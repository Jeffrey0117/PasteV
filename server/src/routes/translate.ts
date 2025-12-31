import { Router } from 'express';

const router = Router();

interface TranslateRequest {
  texts: string[];
  sourceLang?: string;
  targetLang?: string;
}

// Translate endpoint using DeepSeek API
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

    // Translate each text separately for better accuracy
    const translations: string[] = [];

    for (const text of texts) {
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
              content: '你是專業翻譯。請將以下英文翻譯成繁體中文。只輸出翻譯結果，不要加任何解釋或標點符號變化。保持原文的段落格式。'
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('DeepSeek API Error:', errorData);
        translations.push(text); // fallback to original
        continue;
      }

      const data = await response.json();
      const translated = data.choices[0]?.message?.content?.trim() || text;
      translations.push(translated);

      console.log('Translated:', text.substring(0, 50) + '...', '=>', translated.substring(0, 50) + '...');
    }

    res.json({
      success: true,
      translations
    });

  } catch (error) {
    console.error('Translation Error:', error);
    res.status(500).json({ error: 'Translation failed', details: String(error) });
  }
});

export default router;
