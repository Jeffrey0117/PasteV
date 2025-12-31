import { Router } from 'express';

const router = Router();

interface TranslateRequest {
  texts: string[];
  sourceLang?: string;
  targetLang?: string;
}

// 分隔符用於批量翻譯
const BATCH_SEPARATOR = '\n===SPLIT===\n';

// Translate endpoint using DeepSeek API (optimized for batch)
router.post('/', async (req, res) => {
  try {
    const { texts, sourceLang = 'en', targetLang = 'zh' }: TranslateRequest = req.body;

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

export default router;
