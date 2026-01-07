import { Router } from 'express';

const router = Router();

// 型別定義
interface AIGenerateRequest {
  mode: 'topic' | 'content';
  topic?: string;
  rawContent?: string;
  slideCount?: number;
  style: 'informative' | 'tips' | 'listicle' | 'story';
  language: 'zh-TW' | 'zh-CN' | 'en';
}

interface SlideContent {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  bulletPoints?: string[];
  footnote?: string;
  imageKeywords?: string[];
}

interface AIGenerateResponse {
  slides: SlideContent[];
  suggestedTemplate: string;
}

// 風格名稱對照
const STYLE_NAMES: Record<string, string> = {
  informative: '知識型',
  tips: '技巧型',
  listicle: '清單型',
  story: '故事型',
};

// 語言名稱對照
const LANGUAGE_NAMES: Record<string, string> = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  'en': 'English',
};

/**
 * 建構主題生成 Prompt
 */
function buildTopicPrompt(req: AIGenerateRequest): string {
  const styleName = STYLE_NAMES[req.style] || req.style;
  const langName = LANGUAGE_NAMES[req.language] || req.language;

  return `你是一個社群媒體內容專家。請根據以下主題生成 Instagram 風格的知識型圖文內容。

主題：${req.topic}
張數：${req.slideCount || 5}
風格：${styleName}
語言：${langName}

請生成以下格式的 JSON（不要包含 markdown 標記）：
{
  "slides": [
    {
      "id": "slide-1",
      "title": "標題（簡短有力，10字內）",
      "subtitle": "副標題（可選，更詳細的說明）",
      "body": "主要內容（50-100字，清楚說明重點）",
      "bulletPoints": ["要點1", "要點2", "要點3"],
      "imageKeywords": ["coding", "programming"]
    }
  ],
  "suggestedTemplate": "knowledge-card"
}

注意：
1. 第一張應該是封面，標題要吸引人，副標題說明這系列的主題
2. 內容要有價值、易讀、適合社群媒體快速瀏覽
3. 最後一張可以是總結或 Call-to-Action（如：追蹤更多內容）
4. imageKeywords 使用英文，適合搜尋 Unsplash 免費圖庫
5. 每張卡片的 id 格式為 "slide-數字"
6. bulletPoints 每項控制在 15 字內
7. 請直接回傳 JSON，不要加 \`\`\`json 標記`;
}

/**
 * 建構內容整理 Prompt
 */
function buildContentPrompt(req: AIGenerateRequest): string {
  const styleName = STYLE_NAMES[req.style] || req.style;
  const langName = LANGUAGE_NAMES[req.language] || req.language;

  return `你是一個社群媒體內容專家。請將以下內容整理成 Instagram 風格的多張圖文卡片。

原始內容：
${req.rawContent}

目標張數：${req.slideCount || '自動決定最適合的張數'}
風格：${styleName}
語言：${langName}

請生成以下格式的 JSON（不要包含 markdown 標記）：
{
  "slides": [
    {
      "id": "slide-1",
      "title": "標題（簡短有力，10字內）",
      "subtitle": "副標題（可選）",
      "body": "主要內容（50-100字）",
      "bulletPoints": ["要點1", "要點2"],
      "imageKeywords": ["keyword1", "keyword2"]
    }
  ],
  "suggestedTemplate": "knowledge-card"
}

注意：
1. 保留原始內容的核心資訊，不要自行添加新內容
2. 適當拆分成易讀的段落，每張卡片聚焦一個主題
3. 每張卡片內容獨立但有連貫性
4. 第一張作為封面，最後一張作為總結
5. imageKeywords 使用英文，用於搜尋相關配圖
6. 請直接回傳 JSON，不要加 \`\`\`json 標記`;
}

/**
 * 清理 AI 回應中的 markdown 標記
 */
function cleanJsonResponse(content: string): string {
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
 * 生成 fallback 內容（當 API 失敗時）
 */
function generateFallbackContent(req: AIGenerateRequest): AIGenerateResponse {
  const count = req.slideCount || 5;
  const slides: SlideContent[] = [];

  if (req.mode === 'topic' && req.topic) {
    // 主題模式 fallback
    slides.push({
      id: 'slide-1',
      title: req.topic,
      subtitle: '精選內容分享',
      body: `關於「${req.topic}」的精彩內容，請繼續往下看！`,
      imageKeywords: [req.topic.split(' ')[0] || 'knowledge'],
    });

    for (let i = 2; i <= count; i++) {
      slides.push({
        id: `slide-${i}`,
        title: `第 ${i - 1} 點`,
        body: '請編輯此內容...',
        imageKeywords: ['content'],
      });
    }
  } else if (req.mode === 'content' && req.rawContent) {
    // 內容模式 fallback：簡單分段
    const paragraphs = req.rawContent.split('\n\n').filter(p => p.trim());
    const slideCount = Math.min(paragraphs.length, count);

    for (let i = 0; i < slideCount; i++) {
      slides.push({
        id: `slide-${i + 1}`,
        title: i === 0 ? '內容摘要' : `Part ${i}`,
        body: paragraphs[i]?.slice(0, 200) || '',
        imageKeywords: ['content'],
      });
    }
  }

  // 確保至少有一張
  if (slides.length === 0) {
    slides.push({
      id: 'slide-1',
      title: '新內容',
      body: '請編輯此內容...',
      imageKeywords: ['creative'],
    });
  }

  return {
    slides,
    suggestedTemplate: 'knowledge-card',
  };
}

/**
 * POST /api/ai-generate/content
 * 生成內容
 */
router.post('/content', async (req, res) => {
  try {
    const request: AIGenerateRequest = req.body;

    // 驗證輸入
    if (!request.mode) {
      return res.status(400).json({ error: '請選擇生成模式' });
    }

    if (request.mode === 'topic' && !request.topic?.trim()) {
      return res.status(400).json({ error: '請輸入主題' });
    }

    if (request.mode === 'content' && !request.rawContent?.trim()) {
      return res.status(400).json({ error: '請輸入內容' });
    }

    // 檢查 API Key（優先 DeepSeek，其次 OpenAI）
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!deepseekKey && !openaiKey) {
      console.warn('No API key set, returning fallback content');
      const fallback = generateFallbackContent(request);
      return res.json(fallback);
    }

    console.log(`AI generating content: mode=${request.mode}, slides=${request.slideCount}`);
    const startTime = Date.now();

    // 建構 prompt
    const prompt = request.mode === 'topic'
      ? buildTopicPrompt(request)
      : buildContentPrompt(request);

    let response: Response;
    let apiName: string;

    if (deepseekKey) {
      // 使用 DeepSeek
      apiName = 'DeepSeek';
      response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是一個專業的社群媒體內容創作專家。你的輸出必須是純 JSON 格式，不要包含任何 markdown 標記。',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
    } else {
      // 使用 OpenAI
      apiName = 'OpenAI';
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: '你是一個專業的社群媒體內容創作專家。你的輸出必須是純 JSON 格式，不要包含任何 markdown 標記。',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
    }

    // 處理 API 錯誤
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${apiName} API error:`, errorText);

      // 回傳 fallback
      const fallback = generateFallbackContent(request);
      return res.json({
        ...fallback,
        _warning: `${apiName} API 暫時無法使用，已生成基本內容供編輯`,
      });
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.warn('Empty response from API');
      const fallback = generateFallbackContent(request);
      return res.json(fallback);
    }

    // 解析 JSON
    const content = cleanJsonResponse(rawContent);
    let parsed: AIGenerateResponse;

    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw content:', rawContent);
      const fallback = generateFallbackContent(request);
      return res.json(fallback);
    }

    // 驗證結果
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      console.warn('Invalid response structure');
      const fallback = generateFallbackContent(request);
      return res.json(fallback);
    }

    // 確保每個 slide 有 id
    parsed.slides = parsed.slides.map((slide, index) => ({
      ...slide,
      id: slide.id || `slide-${index + 1}`,
    }));

    const elapsed = Date.now() - startTime;
    console.log(`AI content generated in ${elapsed}ms (${apiName}), ${parsed.slides.length} slides`);

    res.json(parsed);
  } catch (error) {
    console.error('AI generate error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : '內容生成失敗',
    });
  }
});

export default router;
