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
  ocrText?: string;      // OCR 文字（可選）
  imageData?: string;    // Base64 圖片資料（可選，用於 Vision API）
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

// OpenAI API Types
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

// System Prompt for Vision
const SYSTEM_PROMPT_VISION = `你是一個專業的圖片內容分析助手。
你的任務是從圖片中識別並提取指定的結構化欄位內容。

輸出規則：
1. 必須以 JSON 格式回應
2. 保持原文，不要翻譯或修改
3. 如果某欄位找不到對應內容，使用空字串 ""
4. 根據欄位描述和視覺特徵（位置、大小、顏色等）進行分類
5. 仔細觀察圖片中的文字、數字和符號`;

// System Prompt for OCR Text
const SYSTEM_PROMPT_OCR = `你是一個專業的文字結構分析助手。
你的任務是從 OCR 提取的原始文字中，識別並分類不同的內容欄位。

輸出規則：
1. 必須以 JSON 格式回應
2. 保持原文，不要翻譯或修改
3. 如果某欄位找不到對應內容，使用空字串 ""
4. 根據欄位描述和文字特徵（位置、大小暗示）進行分類`;

/**
 * 建構欄位定義描述
 */
function buildFieldDefinitions(fields: ParseField[]): string {
  return fields
    .map((f, i) => `${i + 1}. "${f.name}" (ID: ${f.id})${f.description ? ` - ${f.description}` : ''}`)
    .join('\n');
}

/**
 * 建構輸出格式範例
 */
function buildOutputExample(fields: ParseField[], images: ParseImage[]): string {
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
  return JSON.stringify(exampleOutput, null, 2);
}

/**
 * 建構 OCR 文字模式的 prompt
 */
function buildOcrPrompt(fields: ParseField[], images: ParseImage[]): string {
  const fieldDefs = buildFieldDefinitions(fields);

  const imageDocs = images
    .map((img, i) => `### 圖片 ${i + 1} (ID: ${img.id})\n\`\`\`\n${img.ocrText || ''}\n\`\`\``)
    .join('\n\n');

  const exampleOutput = buildOutputExample(fields, images);

  return `## 欄位定義
${fieldDefs}

## 圖片 OCR 文字
${imageDocs}

## 輸出格式
請以以下 JSON 格式回應，包含所有圖片和所有欄位：
${exampleOutput}

注意：請務必為每張圖片的每個欄位都提供值（若找不到則為空字串 ""）。`;
}

/**
 * 建構 Vision API 的訊息內容（支援多張圖片）
 */
function buildVisionMessages(fields: ParseField[], images: ParseImage[]): OpenAIMessage[] {
  const fieldDefs = buildFieldDefinitions(fields);
  const exampleOutput = buildOutputExample(fields, images);

  // 建構 user message 內容
  const content: OpenAIContentPart[] = [];

  // 文字說明
  const textPrompt = `## 欄位定義
${fieldDefs}

## 圖片列表
以下有 ${images.length} 張圖片，請從每張圖片中提取上述欄位的內容。

${images.map((img, i) => `圖片 ${i + 1}: ID = "${img.id}"`).join('\n')}

## 輸出格式
請以以下 JSON 格式回應，包含所有圖片和所有欄位：
${exampleOutput}

注意：
1. 請務必為每張圖片的每個欄位都提供值（若找不到則為空字串 ""）
2. 回應必須是純 JSON，不要包含 markdown 標記
3. 圖片順序與上方 ID 列表對應`;

  content.push({ type: 'text', text: textPrompt });

  // 加入圖片
  for (const img of images) {
    if (img.imageData) {
      // 確保格式正確 (data:image/xxx;base64,xxx 或純 base64)
      let imageUrl = img.imageData;
      if (!imageUrl.startsWith('data:')) {
        imageUrl = `data:image/png;base64,${imageUrl}`;
      }

      content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
          detail: 'high',
        },
      });
    }
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT_VISION },
    { role: 'user', content },
  ];
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

    // 將 OCR 原文放入第一個欄位（如果有的話）
    fields.forEach((field, index) => {
      results[img.id][field.id] = index === 0 ? (img.ocrText || '') : '';
    });
  });

  return results;
}

/**
 * 判斷請求是否使用 Vision 模式（圖片直接解析）
 */
function isVisionMode(images: ParseImage[]): boolean {
  return images.some((img) => img.imageData && img.imageData.length > 0);
}

/**
 * 清理 AI 回應中的 markdown 標記
 */
function cleanJsonResponse(content: string): string {
  // 移除 markdown code block 標記
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * POST /api/parse - AI 批次解析圖片/OCR 文字
 *
 * 支援兩種模式：
 * 1. Vision 模式：直接傳送圖片，使用 GPT-4 Vision 解析
 * 2. OCR 模式：傳送 OCR 文字，使用 GPT-4 解析
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

    // 驗證 OCR 文字長度（僅在 OCR 模式下檢查）
    for (const img of images) {
      if (img.ocrText && img.ocrText.length > MAX_OCR_LENGTH) {
        return res.status(400).json({
          success: false,
          results: {},
          error: `OCR text for image ${img.id} exceeds maximum length of ${MAX_OCR_LENGTH} characters`,
        } as ParseResponse);
      }
    }

    // 決定使用哪種模式
    const useVision = isVisionMode(images);

    // 檢查 API Key（優先使用 OpenAI，其次 DeepSeek）
    const openaiKey = process.env.OPENAI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // Vision 模式需要 OpenAI API
    if (useVision && !openaiKey) {
      return res.status(400).json({
        success: false,
        results: {},
        error: 'Vision mode requires OPENAI_API_KEY',
      } as ParseResponse);
    }

    // 至少需要一個 API Key
    const apiKey = openaiKey || deepseekKey;
    if (!apiKey) {
      console.warn('No API key set, returning fallback results');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'Using fallback - set OPENAI_API_KEY or DEEPSEEK_API_KEY for AI parsing',
      } as ParseResponse);
    }

    console.log(`AI parsing ${images.length} images with ${fields.length} fields (mode: ${useVision ? 'Vision' : 'OCR'})...`);
    const startTime = Date.now();

    let response: Response;
    let apiName: string;

    if (useVision) {
      // Vision 模式：使用 OpenAI GPT-4 Vision
      apiName = 'OpenAI';
      const messages = buildVisionMessages(fields, images);

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',  // GPT-4o 支援 Vision
          messages,
          temperature: 0.1,
          max_tokens: 4096,
        }),
      });
    } else if (openaiKey) {
      // OCR 模式 + OpenAI
      apiName = 'OpenAI';
      const prompt = buildOcrPrompt(fields, images);

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_OCR },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
    } else {
      // OCR 模式 + DeepSeek
      apiName = 'DeepSeek';
      const prompt = buildOcrPrompt(fields, images);

      response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_OCR },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
    }

    // 處理 API 錯誤
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`${apiName} API Error:`, errorData);

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
        error: `${apiName} API failed, using fallback`,
      } as ParseResponse);
    }

    const data = await response.json();

    // 解析回應內容
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.warn('Empty response from API, using fallback');
      const fallbackResults = createFallbackResults(fields, images);
      return res.json({
        success: true,
        results: fallbackResults,
        error: 'Empty AI response, using fallback',
      } as ParseResponse);
    }

    // 清理並解析 JSON
    const content = cleanJsonResponse(rawContent);
    let parsed: Record<string, Record<string, string>>;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw content:', rawContent);
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
    console.log(`AI parsing completed in ${elapsed}ms (${apiName})`);

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
