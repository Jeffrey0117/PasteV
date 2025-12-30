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
      // Return mock translation if no API key (for development)
      console.warn('No DEEPSEEK_API_KEY set, returning mock translation');
      const mockTranslations = texts.map(t => `[翻譯] ${t}`);
      return res.json({
        success: true,
        translations: mockTranslations,
        warning: 'Using mock translation - set DEEPSEEK_API_KEY for real translation'
      });
    }

    // Call DeepSeek API
    const prompt = `Translate the following texts from ${sourceLang} to ${targetLang}. Return only the translations, one per line, in the same order:

${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

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
            content: 'You are a professional translator. Translate accurately and naturally. Only output the translations, nothing else.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API Error:', errorData);
      return res.status(500).json({ error: 'Translation API failed', details: errorData });
    }

    const data = await response.json();
    const translatedText = data.choices[0]?.message?.content || '';

    // Parse translations (split by newline, remove numbering)
    const translations = translatedText
      .split('\n')
      .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line: string) => line.length > 0);

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
