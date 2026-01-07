# 04 - AI 批次解析 API

## 概述

使用 AI (DeepSeek) 從 OCR 原文中提取結構化欄位內容。
**單次 API 呼叫處理所有圖片**，最大化效率。

## 依賴

- `01-data-structures.md` - ParseRequest, ParseResponse 型別

## 輸出檔案

```
server/src/routes/parse.ts
```

---

## API 規格

### Endpoint

```
POST /api/parse
```

### Request

```typescript
interface ParseRequest {
  /** 欄位定義 */
  fields: Array<{
    id: string;
    name: string;
    description?: string;  // 幫助 AI 理解欄位用途
  }>;

  /** 各圖片的 OCR 文字 */
  images: Array<{
    id: string;
    ocrText: string;
  }>;
}
```

**範例:**

```json
{
  "fields": [
    { "id": "field-1", "name": "標題", "description": "主要標題，通常較大較醒目" },
    { "id": "field-2", "name": "副標題", "description": "補充說明文字" },
    { "id": "field-3", "name": "內文", "description": "主要內容段落" }
  ],
  "images": [
    { "id": "img-1", "ocrText": "Computer Science\n$166k average salary\n\nThis repository contains..." },
    { "id": "img-2", "ocrText": "Data Analysis\n$95k average salary\n\nLearn to analyze..." },
    { "id": "img-3", "ocrText": "Machine Learning\n$140k average salary\n\nMaster the fundamentals..." }
  ]
}
```

### Response

```typescript
interface ParseResponse {
  success: boolean;
  results: Record<string, Record<string, string>>;
  // 結構: { [imageId]: { [fieldId]: extractedText } }
  error?: string;
}
```

**範例:**

```json
{
  "success": true,
  "results": {
    "img-1": {
      "field-1": "Computer Science",
      "field-2": "$166k average salary",
      "field-3": "This repository contains..."
    },
    "img-2": {
      "field-1": "Data Analysis",
      "field-2": "$95k average salary",
      "field-3": "Learn to analyze..."
    },
    "img-3": {
      "field-1": "Machine Learning",
      "field-2": "$140k average salary",
      "field-3": "Master the fundamentals..."
    }
  }
}
```

---

## 實作

### parse.ts

```typescript
import { Router } from 'express';

const router = Router();
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

router.post('/', async (req, res) => {
  try {
    const { fields, images } = req.body;

    // 驗證輸入
    if (!fields?.length || !images?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing fields or images',
      });
    }

    // 建構 prompt
    const prompt = buildParsePrompt(fields, images);

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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,  // 低隨機性，確保穩定輸出
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }

    // 解析回應
    const content = data.choices[0]?.message?.content;
    const parsed = JSON.parse(content);

    // 轉換為標準格式
    const results = transformResults(parsed, fields, images);

    res.json({ success: true, results });

  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Parse failed',
    });
  }
});

export default router;
```

### Prompt 建構

```typescript
const SYSTEM_PROMPT = `你是一個專業的文字結構分析助手。
你的任務是從 OCR 提取的原始文字中，識別並分類不同的內容欄位。

輸出規則：
1. 必須以 JSON 格式回應
2. 保持原文，不要翻譯或修改
3. 如果某欄位找不到對應內容，使用空字串 ""
4. 根據欄位描述和文字特徵（位置、大小暗示）進行分類`;

function buildParsePrompt(
  fields: Array<{ id: string; name: string; description?: string }>,
  images: Array<{ id: string; ocrText: string }>
): string {
  const fieldDefs = fields.map((f, i) =>
    `${i + 1}. ${f.name}${f.description ? ` - ${f.description}` : ''}`
  ).join('\n');

  const imageDocs = images.map((img, i) =>
    `### 圖片 ${i + 1} (ID: ${img.id})\n\`\`\`\n${img.ocrText}\n\`\`\``
  ).join('\n\n');

  return `## 欄位定義
${fieldDefs}

## 圖片 OCR 文字
${imageDocs}

## 輸出格式
請以以下 JSON 格式回應：
{
  "${images[0]?.id}": {
    "${fields[0]?.id}": "提取的文字",
    "${fields[1]?.id}": "提取的文字",
    ...
  },
  "${images[1]?.id}": { ... },
  ...
}`;
}
```

### 結果轉換

```typescript
function transformResults(
  parsed: any,
  fields: Array<{ id: string; name: string }>,
  images: Array<{ id: string; ocrText: string }>
): Record<string, Record<string, string>> {
  const results: Record<string, Record<string, string>> = {};

  images.forEach(img => {
    results[img.id] = {};

    fields.forEach(field => {
      // 嘗試從解析結果中取得，若無則為空
      results[img.id][field.id] = parsed[img.id]?.[field.id] || '';
    });
  });

  return results;
}
```

---

## 錯誤處理

### Fallback 策略

如果 AI 解析失敗，回傳 OCR 原文讓使用者手動分配：

```typescript
function createFallbackResults(
  fields: Array<{ id: string }>,
  images: Array<{ id: string; ocrText: string }>
): Record<string, Record<string, string>> {
  const results: Record<string, Record<string, string>> = {};

  images.forEach(img => {
    results[img.id] = {};

    // 將 OCR 原文放入第一個欄位
    fields.forEach((field, index) => {
      results[img.id][field.id] = index === 0 ? img.ocrText : '';
    });
  });

  return results;
}
```

### 錯誤碼

| 狀態碼 | 錯誤 | 說明 |
|--------|------|------|
| 400 | Missing fields or images | 輸入資料不完整 |
| 401 | Invalid API key | DeepSeek API key 錯誤 |
| 429 | Rate limit exceeded | API 呼叫次數超限 |
| 500 | Parse failed | 解析失敗 |

---

## 效能考量

### Token 估算

```
每張圖 OCR 文字: ~200 tokens
欄位定義: ~50 tokens
系統 prompt: ~100 tokens
輸出: ~100 tokens/圖

10 張圖預估: (200 * 10) + 50 + 100 + (100 * 10) = 3,150 tokens
```

### 限制

- 最大圖片數: 20 張
- 最大 OCR 文字長度: 每張 2000 字元
- 最大欄位數: 10 個

```typescript
// 輸入驗證
const MAX_IMAGES = 20;
const MAX_OCR_LENGTH = 2000;
const MAX_FIELDS = 10;

if (images.length > MAX_IMAGES) {
  return res.status(400).json({
    success: false,
    error: `Maximum ${MAX_IMAGES} images allowed`,
  });
}
```

---

## 測試案例

### 成功案例

```bash
curl -X POST http://localhost:3001/api/parse \
  -H "Content-Type: application/json" \
  -d '{
    "fields": [
      { "id": "f1", "name": "標題" },
      { "id": "f2", "name": "說明" }
    ],
    "images": [
      { "id": "i1", "ocrText": "Hello World\nThis is a test" }
    ]
  }'
```

### 預期回應

```json
{
  "success": true,
  "results": {
    "i1": {
      "f1": "Hello World",
      "f2": "This is a test"
    }
  }
}
```

---

## 驗收清單

- [ ] POST /api/parse endpoint 正常運作
- [ ] 可處理多張圖片
- [ ] 可處理多個欄位
- [ ] JSON 輸出格式正確
- [ ] 錯誤處理完善
- [ ] 輸入驗證 (圖片數、文字長度)
- [ ] API key 缺失時有適當錯誤訊息
- [ ] Fallback 策略可用
