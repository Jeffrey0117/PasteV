import { Router } from 'express';

const router = Router();

// 限制常數
const MAX_IMAGES = 20;
const MAX_OCR_LENGTH = 2000;
const MAX_FIELDS = 10;

// 介面定義
interface ParseField {
  id: string;
  name: string;
  description?: string;
}

interface ParseImage {
  id: string;
  ocrText: string;
}

interface ParseRequest {
  fields: ParseField[];
  images: ParseImage[];
}

interface ParseResponse {
  success: boolean;
  results: Record<string, Record<string, string>>;
  error?: string;
}

// System Prompt
const SYSTEM_PROMPT = `你是一個專業的文字結構分析助手。
你的任務是從 OCR 提取的原始文字中，識別並分類不同的內容欄位。

輸出規則：
1. 必須以 JSON 格式回應
2. 保持原文，不要翻譯或修改
3. 如果某欄位找不到對應內容，使用空字串 ""
4. 根據欄位描述和文字特徵（位置、大小暗示）進行分類`;

/**
 * 建構 AI 解析 prompt
 */
function buildParsePrompt(fields: ParseField[], images: ParseImage[]): string {
  const fieldDefs = fields
    .map((f, i) => `${i + 1}. ${f.name}${f.description ? ` - ${f.description}` : ''}`)
    .join('\n');

  const imageDocs = images
    .map((img, i) => `### 圖片 ${i + 1} (ID: ${img.id})\n\`\`\`\n${img.ocrText}\n\`\`\``)
    .join('\n\n');

  // 建構輸出格式範例
  const exampleOutput: Record<string, Record<string, string>> = {};
  if (images.length > 0 && fields.length > 0) {
    exampleOutput[images[0].id] = {};
    fields.forEach((f) => {
      exampleOutput[images[0].id][f.id] = '提取的文字';
    });
    if (images.length > 1) {
      exampleOutput[images[1].id] = {};
      fields.forEach((f) => {
        exampleOutput[images[1].id][f.id] = '...';
      });
    }
  }

  return `## 欄位定義
${fieldDefs}

## 圖片 OCR 文字
${imageDocs}

## 輸出格式
請以以下 JSON 格式回應，包含所有圖片和所有欄位：
${JSON.stringify(exampleOutput, null, 2)}

注意：請務必為每張圖片的每個欄位都提供值（若找不到則為空字串 ""）。`;
}

/**
 * 將 AI 回應轉換為標準格式
 */
function transformResults(
  parsed: Record<string, Record<string, string>>,
  fields: ParseField[],
  images: ParseImage[]
): Record<string, Record<string, string>> {
  const results: Record<string, Record<string, string>> = {};

  images.forEach((img) => {
    results[img.id] = {};

    fields.forEach((field) => {
      // 嘗試從解析結果中取得，若無則為空
      results[img.id][field.id] = parsed[img.id]?.[field.id] || '';
    });
  });

  return results;
}

/**
 * Fallback 策略：AI 解析失敗時，將 OCR 原文放入第一個欄位
 */
function createFallbackResults(
  fields: ParseField[],
  images: ParseImage[]
): Record<string, Record<string, string>> {
  const results: Record<string, Record<string, string>> = {};

  images.forEach((img) => {
    results[img.id] = {};

    // 將 OCR 原文放入第一個欄位
    fields.forEach((field, index) => {
      results[img.id][field.id] = index === 0 ? img.ocrText : '';
    });
  });

  return results;
}

/**
 * POST /api/parse - AI 批次解析 OCR 文字
 */
router.post('/', async (req, res) => {
  try {
    const { fields, images }: ParseRequest = req.body;

    // 驗證輸入存在
    if (!fields?.length || !images?.length) {
      return res.status(400).json({
        success: false,
        results: {},
        error: 'Missing fields or images',
      } as ParseResponse);
    }

    // 驗證欄位數量
    if (fields.length > MAX_FIELDS) {
      return res.status(400).json({
        success: false,
        results: {},
        error: `Maximum ${MAX_FIELDS} fields allowed`,
      } as ParseResponse);
    }

    // 驗證圖片數量
    if (images.length > MAX_IMAGES) {
      return res.status(400).json({
        success: false,
        results: {},
        error: `Maximum ${MAX_IMAGES} images allowed`,
      } as ParseResponse);
    }

    // 驗證 OCR 文字長度
    for (const img of images) {
      if (img.ocrText && img.ocrText.length > MAX_OCR_LENGTH) {
        return res.status(400).json({
          success: false,
          results: {},
          error: `OCR text for image ${img.id} exceeds maximum length of ${MAX_OCR_LENGTH} characters`,
        } as ParseResponse);
      }
    }

    // 檢查 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.warn('No DEEPSEEK_API_KEY set, returning fallback results');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'Using fallback - set DEEPSEEK_API_KEY for AI parsing',
      } as ParseResponse);
    }

    console.log(`AI parsing ${images.length} images with ${fields.length} fields...`);
    const startTime = Date.now();

    // 建構 prompt
    const prompt = buildParsePrompt(fields, images);

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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1, // 低隨機性，確保穩定輸出
        response_format: { type: 'json_object' },
      }),
    });

    // 處理 API 錯誤
    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API Error:', errorData);

      // 特定錯誤碼處理
      if (response.status === 401) {
        return res.status(401).json({
          success: false,
          results: {},
          error: 'Invalid API key',
        } as ParseResponse);
      }

      if (response.status === 429) {
        return res.status(429).json({
          success: false,
          results: {},
          error: 'Rate limit exceeded',
        } as ParseResponse);
      }

      // 其他錯誤使用 fallback
      console.warn('API error, using fallback results');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'AI parsing failed, using fallback',
      } as ParseResponse);
    }

    const data = await response.json();

    // 解析回應內容
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('Empty response from API, using fallback');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'Empty AI response, using fallback',
      } as ParseResponse);
    }

    // 嘗試解析 JSON
    let parsed: Record<string, Record<string, string>>;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.warn('Invalid JSON response, using fallback');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'Invalid AI response format, using fallback',
      } as ParseResponse);
    }

    // 轉換為標準格式
    const results = transformResults(parsed, fields, images);

    const elapsed = Date.now() - startTime;
    console.log(`AI parsing completed in ${elapsed}ms`);

    res.json({
      success: true,
      results,
    } as ParseResponse);
  } catch (error) {
    console.error('Parse error:', error);

    // 嘗試使用 fallback
    try {
      const { fields, images } = req.body;
      if (fields?.length && images?.length) {
        const fallbackResults = createFallbackResults(fields, images);
        return res.json({
          success: true,
          results: fallbackResults,
          error: 'Parse failed, using fallback',
        } as ParseResponse);
      }
    } catch {
      // Fallback 也失敗，回傳錯誤
    }

    res.status(500).json({
      success: false,
      results: {},
      error: error instanceof Error ? error.message : 'Parse failed',
    } as ParseResponse);
  }
});

export default router;
