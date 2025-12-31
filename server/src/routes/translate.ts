import { Router } from 'express';

const router = Router();

// =============================================================================
// Types
// =============================================================================

/** 原有的簡易翻譯請求格式 */
interface LegacyTranslateRequest {
  texts: string[];
  sourceLang?: string;
  targetLang?: string;
}

/** 批次翻譯請求格式 */
interface BatchTranslateRequest {
  texts: Array<{ key: string; text: string }>;
  sourceLang?: string;
  targetLang?: string;
}

/** 批次翻譯回應格式 */
interface BatchTranslateResponse {
  success: boolean;
  translations: Record<string, string>;
  stats?: { total: number; translated: number; cached: number };
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const BATCH_SEPARATOR = '\n===SPLIT===\n';
const MAX_TEXTS = 100;
const MAX_TEXT_LENGTH = 500;

const TRANSLATE_SYSTEM_PROMPT = `你是專業的翻譯助手。
將英文翻譯成繁體中文，保持以下原則：
1. 保持簡潔有力
2. 適合圖片/社群貼文使用
3. 專有名詞可保留英文
4. 數字和貨幣符號保留

輸出格式：每行一個翻譯，對應輸入順序，用 ||| 分隔序號和翻譯
例如：
1||| 翻譯結果一
2||| 翻譯結果二`;

// =============================================================================
// Translation Cache (LRU-like)
// =============================================================================

class TranslationCache {
  private cache = new Map<string, { value: string; timestamp: number }>();
  private maxSize = 1000;
  private maxAge = 24 * 60 * 60 * 1000; // 24 小時

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 檢查過期
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: string): void {
    // 清理超過大小限制
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  generateKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text.toLowerCase().trim()}`;
  }
}

const translationCache = new TranslationCache();

// =============================================================================
// Helper Functions
// =============================================================================

function buildBatchTranslatePrompt(
  items: Array<{ key: string; text: string; index: number }>,
  sourceLang: string,
  targetLang: string
): string {
  const lines = items.map((item, i) => `${i + 1}. ${item.text}`).join('\n');

  return `請將以下 ${items.length} 段文字從 ${sourceLang} 翻譯成 ${targetLang}：

${lines}

輸出格式：每行 "序號||| 翻譯"`;
}

function parseTranslations(
  content: string,
  originalItems: Array<{ key: string; text: string; index: number }>
): Array<{ key: string; original: string; translated: string }> {
  const lines = content.trim().split('\n');
  const results: Array<{ key: string; original: string; translated: string }> = [];

  lines.forEach((line) => {
    const match = line.match(/^(\d+)\|\|\|\s*(.+)$/);
    if (match) {
      const index = parseInt(match[1]) - 1;
      const translated = match[2].trim();

      if (originalItems[index]) {
        results.push({
          key: originalItems[index].key,
          original: originalItems[index].text,
          translated,
        });
      }
    }
  });

  // Fallback：如果解析失敗，嘗試按行對應
  if (results.length === 0 && lines.length === originalItems.length) {
    lines.forEach((line, index) => {
      results.push({
        key: originalItems[index].key,
        original: originalItems[index].text,
        translated: line.trim(),
      });
    });
  }

  return results;
}

// =============================================================================
// Legacy Endpoint: POST / (向下相容)
// =============================================================================

router.post('/', async (req, res) => {
  try {
    const { texts, sourceLang = 'en', targetLang = 'zh' }: LegacyTranslateRequest = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'No texts provided for translation' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      console.warn('No DEEPSEEK_API_KEY set, returning mock translation');
      const mockTranslations = texts.map(t => `[翻譯] ${t}`);
      return res.json({
        success: true,
        translations: mockTranslations,
        warning: 'Using mock translation - set DEEPSEEK_API_KEY for real translation'
      });
    }

    console.log(`Batch translating ${texts.length} texts...`);
    const startTime = Date.now();

    // 合併所有文字為單次 API 呼叫 (大幅加速)
    const combinedText = texts.map((t, i) => `[${i + 1}]\n${t}`).join(BATCH_SEPARATOR);

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是專業翻譯。請將以下英文內容翻譯成繁體中文。
規則：
1. 每段文字以 [數字] 開頭標記
2. 請保持相同的標記格式 [數字] 輸出翻譯結果
3. 段落之間用 ===SPLIT=== 分隔
4. 只輸出翻譯結果，不要加任何解釋
5. 保持原文的段落格式`
          },
          {
            role: 'user',
            content: combinedText
          }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API Error:', errorData);
      return res.status(500).json({ error: 'Translation API failed', details: errorData });
    }

    const data = await response.json();
    const translatedContent = data.choices[0]?.message?.content?.trim() || '';

    // 解析批量翻譯結果
    const translations: string[] = [];
    const parts = translatedContent.split(/===SPLIT===|\n\[(\d+)\]/);

    // 提取翻譯結果
    let currentIndex = 0;
    for (const part of parts) {
      if (!part) continue; // 跳過 undefined/null
      const trimmed = part.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        // 移除開頭的 [數字] 標記
        const cleaned = trimmed.replace(/^\[\d+\]\s*/, '').trim();
        if (cleaned) {
          translations.push(cleaned);
          currentIndex++;
        }
      }
    }

    // 如果解析失敗，嘗試簡單分割
    if (translations.length !== texts.length) {
      console.log('Fallback parsing...');
      translations.length = 0;
      const simpleParts = translatedContent.split('===SPLIT===');
      for (let i = 0; i < texts.length; i++) {
        if (simpleParts[i]) {
          const cleaned = simpleParts[i].replace(/^\[\d+\]\s*/, '').trim();
          translations.push(cleaned || texts[i]);
        } else {
          translations.push(texts[i]);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`Batch translation completed in ${elapsed}ms (${texts.length} texts)`);

    res.json({
      success: true,
      translations,
      timing: elapsed
    });

  } catch (error) {
    console.error('Translation Error:', error);
    res.status(500).json({ error: 'Translation failed', details: String(error) });
  }
});

// =============================================================================
// Batch Endpoint: POST /batch (新 API)
// =============================================================================

router.post('/batch', async (req, res) => {
  try {
    const { texts, sourceLang = 'en', targetLang = 'zh-TW' }: BatchTranslateRequest = req.body;

    // 驗證：texts 必須存在且為陣列
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        translations: {},
        error: 'No texts provided',
      } satisfies BatchTranslateResponse);
    }

    // 驗證：texts 不能為空
    if (texts.length === 0) {
      return res.json({
        success: true,
        translations: {},
        stats: { total: 0, translated: 0, cached: 0 },
      } satisfies BatchTranslateResponse);
    }

    // 驗證：最大文字數
    if (texts.length > MAX_TEXTS) {
      return res.status(400).json({
        success: false,
        translations: {},
        error: `Maximum ${MAX_TEXTS} texts allowed`,
      } satisfies BatchTranslateResponse);
    }

    // 驗證：單段文字長度
    const tooLong = texts.find((t) => t.text && t.text.length > MAX_TEXT_LENGTH);
    if (tooLong) {
      return res.status(400).json({
        success: false,
        translations: {},
        error: `Text exceeds ${MAX_TEXT_LENGTH} characters: ${tooLong.key}`,
      } satisfies BatchTranslateResponse);
    }

    // 驗證：每個項目必須有 key 和 text
    const invalidItem = texts.find((t) => typeof t.key !== 'string' || typeof t.text !== 'string');
    if (invalidItem) {
      return res.status(400).json({
        success: false,
        translations: {},
        error: 'Each item must have a key and text property',
      } satisfies BatchTranslateResponse);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;

    // Mock 模式（無 API key）
    if (!apiKey) {
      console.warn('No DEEPSEEK_API_KEY set, returning mock translation');
      const mockTranslations: Record<string, string> = {};
      texts.forEach((item) => {
        mockTranslations[item.key] = `[翻譯] ${item.text}`;
      });
      return res.json({
        success: true,
        translations: mockTranslations,
        stats: { total: texts.length, translated: texts.length, cached: 0 },
      } satisfies BatchTranslateResponse);
    }

    // 分離已快取與需翻譯的文字
    const toTranslate: Array<{ key: string; text: string; index: number }> = [];
    const results: Record<string, string> = {};
    let cachedCount = 0;

    texts.forEach((item, index) => {
      const cacheKey = translationCache.generateKey(item.text, sourceLang, targetLang);
      const cached = translationCache.get(cacheKey);

      if (cached) {
        results[item.key] = cached;
        cachedCount++;
      } else if (item.text.trim()) {
        toTranslate.push({ ...item, index });
      } else {
        results[item.key] = ''; // 空文字直接回傳空
      }
    });

    // 如果全部命中快取
    if (toTranslate.length === 0) {
      return res.json({
        success: true,
        translations: results,
        stats: { total: texts.length, translated: 0, cached: cachedCount },
      } satisfies BatchTranslateResponse);
    }

    console.log(`Batch translating ${toTranslate.length} texts (${cachedCount} cached)...`);
    const startTime = Date.now();

    // 建構 prompt
    const prompt = buildBatchTranslatePrompt(toTranslate, sourceLang, targetLang);

    // 呼叫 DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API Error:', errorData);
      throw new Error('DeepSeek API error');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // 解析回應
    const translations = parseTranslations(content, toTranslate);

    // 更新快取並合併結果
    translations.forEach(({ key, original, translated }) => {
      results[key] = translated;
      const cacheKey = translationCache.generateKey(original, sourceLang, targetLang);
      translationCache.set(cacheKey, translated);
    });

    // 處理未成功解析的項目（回傳原文）
    toTranslate.forEach((item) => {
      if (!(item.key in results)) {
        results[item.key] = item.text;
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`Batch translation completed in ${elapsed}ms`);

    res.json({
      success: true,
      translations: results,
      stats: {
        total: texts.length,
        translated: toTranslate.length,
        cached: cachedCount,
      },
    } satisfies BatchTranslateResponse);
  } catch (error) {
    console.error('Batch Translate Error:', error);
    res.status(500).json({
      success: false,
      translations: {},
      error: error instanceof Error ? error.message : 'Translation failed',
    } satisfies BatchTranslateResponse);
  }
});

export default router;
