# 05 - AI 批次翻譯 API

## 概述

批次翻譯多段文字，**單次 API 呼叫**完成所有翻譯。
支援快取避免重複翻譯。

## 依賴

- `01-data-structures.md` - TranslateRequest, TranslateResponse 型別

## 輸出檔案

```
server/src/routes/translate.ts  (修改現有檔案)
```

---

## API 規格

### Endpoint

```
POST /api/translate/batch
```

> 注意：新增 `/batch` endpoint，保留原有 `/translate` 向下相容

### Request

```typescript
interface TranslateRequest {
  /** 要翻譯的文字列表 */
  texts: Array<{
    /** 識別 key，格式建議: imageId:fieldId */
    key: string;
    /** 原文 */
    text: string;
  }>;

  /** 來源語言 (預設 en) */
  sourceLang?: string;

  /** 目標語言 (預設 zh-TW) */
  targetLang?: string;
}
```

**範例:**

```json
{
  "texts": [
    { "key": "img-1:field-1", "text": "Computer Science" },
    { "key": "img-1:field-2", "text": "$166k average salary" },
    { "key": "img-2:field-1", "text": "Data Analysis" },
    { "key": "img-2:field-2", "text": "$95k average salary" }
  ],
  "sourceLang": "en",
  "targetLang": "zh-TW"
}
```

### Response

```typescript
interface TranslateResponse {
  success: boolean;

  /** 翻譯結果，key 對應請求 */
  translations: Record<string, string>;

  /** 統計資訊 */
  stats?: {
    total: number;      // 總數
    translated: number; // 實際翻譯數
    cached: number;     // 快取命中數
  };

  error?: string;
}
```

**範例:**

```json
{
  "success": true,
  "translations": {
    "img-1:field-1": "電腦科學",
    "img-1:field-2": "平均年薪 $166k",
    "img-2:field-1": "資料分析",
    "img-2:field-2": "平均年薪 $95k"
  },
  "stats": {
    "total": 4,
    "translated": 4,
    "cached": 0
  }
}
```

---

## 實作

### translate.ts

```typescript
import { Router } from 'express';

const router = Router();
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// 簡易記憶體快取
const translationCache = new Map<string, string>();

// 批次翻譯 endpoint
router.post('/batch', async (req, res) => {
  try {
    const { texts, sourceLang = 'en', targetLang = 'zh-TW' } = req.body;

    if (!texts?.length) {
      return res.status(400).json({
        success: false,
        error: 'No texts provided',
      });
    }

    // 分離已快取與需翻譯的文字
    const toTranslate: Array<{ key: string; text: string; index: number }> = [];
    const results: Record<string, string> = {};
    let cachedCount = 0;

    texts.forEach((item: { key: string; text: string }, index: number) => {
      const cacheKey = `${sourceLang}:${targetLang}:${item.text.toLowerCase().trim()}`;
      const cached = translationCache.get(cacheKey);

      if (cached) {
        results[item.key] = cached;
        cachedCount++;
      } else if (item.text.trim()) {
        toTranslate.push({ ...item, index });
      } else {
        results[item.key] = '';  // 空文字直接回傳空
      }
    });

    // 如果全部命中快取
    if (toTranslate.length === 0) {
      return res.json({
        success: true,
        translations: results,
        stats: { total: texts.length, translated: 0, cached: cachedCount },
      });
    }

    // 建構 prompt
    const prompt = buildTranslatePrompt(toTranslate, sourceLang, targetLang);

    // 呼叫 DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    // 解析回應
    const content = data.choices[0]?.message?.content || '';
    const translations = parseTranslations(content, toTranslate);

    // 更新快取並合併結果
    translations.forEach(({ key, original, translated }) => {
      results[key] = translated;
      const cacheKey = `${sourceLang}:${targetLang}:${original.toLowerCase().trim()}`;
      translationCache.set(cacheKey, translated);
    });

    res.json({
      success: true,
      translations: results,
      stats: {
        total: texts.length,
        translated: toTranslate.length,
        cached: cachedCount,
      },
    });

  } catch (error) {
    console.error('Translate error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Translation failed',
    });
  }
});

export default router;
```

### Prompt 建構

```typescript
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

function buildTranslatePrompt(
  items: Array<{ key: string; text: string; index: number }>,
  sourceLang: string,
  targetLang: string
): string {
  const lines = items.map((item, i) =>
    `${i + 1}. ${item.text}`
  ).join('\n');

  return `請將以下 ${items.length} 段文字從 ${sourceLang} 翻譯成 ${targetLang}：

${lines}

輸出格式：每行 "序號||| 翻譯"`;
}
```

### 解析翻譯結果

```typescript
function parseTranslations(
  content: string,
  originalItems: Array<{ key: string; text: string; index: number }>
): Array<{ key: string; original: string; translated: string }> {
  const lines = content.trim().split('\n');
  const results: Array<{ key: string; original: string; translated: string }> = [];

  lines.forEach(line => {
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
```

---

## 快取策略

### 記憶體快取

```typescript
// 簡易 LRU 快取
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
      this.cache.delete(oldest);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  generateKey(text: string, sourceLang: string, targetLang: string): string {
    return `${sourceLang}:${targetLang}:${text.toLowerCase().trim()}`;
  }
}

const cache = new TranslationCache();
```

### 快取命中範例

```
第一次請求：
texts: ["Hello", "World", "Test"]
→ 翻譯 3 個，快取 3 個
→ stats: { total: 3, translated: 3, cached: 0 }

第二次請求：
texts: ["Hello", "World", "New"]
→ Hello, World 命中快取
→ 只翻譯 "New"
→ stats: { total: 3, translated: 1, cached: 2 }
```

---

## 限制

```typescript
const MAX_TEXTS = 100;      // 最大文字數
const MAX_TEXT_LENGTH = 500; // 單段最大字元數

// 驗證
if (texts.length > MAX_TEXTS) {
  return res.status(400).json({
    success: false,
    error: `Maximum ${MAX_TEXTS} texts allowed`,
  });
}

const tooLong = texts.find(t => t.text.length > MAX_TEXT_LENGTH);
if (tooLong) {
  return res.status(400).json({
    success: false,
    error: `Text exceeds ${MAX_TEXT_LENGTH} characters: ${tooLong.key}`,
  });
}
```

---

## 測試案例

### 基本翻譯

```bash
curl -X POST http://localhost:3001/api/translate/batch \
  -H "Content-Type: application/json" \
  -d '{
    "texts": [
      { "key": "1", "text": "Hello World" },
      { "key": "2", "text": "Good Morning" }
    ]
  }'
```

### 預期回應

```json
{
  "success": true,
  "translations": {
    "1": "你好世界",
    "2": "早安"
  },
  "stats": {
    "total": 2,
    "translated": 2,
    "cached": 0
  }
}
```

---

## 驗收清單

- [ ] POST /api/translate/batch endpoint 正常運作
- [ ] 可批次翻譯多段文字
- [ ] 快取機制運作正常
- [ ] stats 回傳正確統計
- [ ] 空文字處理
- [ ] 錯誤處理完善
- [ ] 輸入驗證 (文字數、長度)
- [ ] 原有 /api/translate 仍可使用
