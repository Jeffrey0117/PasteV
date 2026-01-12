import { Router } from 'express';
import sharp from 'sharp';

const router = Router();

// Maximum allowed image size (10MB)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Validate Base64 string
function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  // Check if it's a valid base64 pattern
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(str);
}

interface TextBlock {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
}

interface GenerateRequest {
  backgroundImage?: string; // base64
  backgroundColor?: string;
  width: number;
  height: number;
  textBlocks: TextBlock[];
}

// Generate image with text overlay
router.post('/', async (req, res) => {
  try {
    const {
      backgroundImage,
      backgroundColor = '#ffffff',
      width = 800,
      height = 600,
      textBlocks
    }: GenerateRequest = req.body;

    if (!textBlocks || textBlocks.length === 0) {
      return res.status(400).json({ error: 'No text blocks provided' });
    }

    // Create SVG with text overlays
    const svgTexts = textBlocks.map(block => {
      const fontSize = block.fontSize || 16;
      const color = block.color || '#000000';
      const fontFamily = block.fontFamily || 'Arial, sans-serif';

      // Escape special XML characters
      const escapedText = block.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      return `<text x="${block.x}" y="${block.y + fontSize}"
        font-size="${fontSize}"
        fill="${color}"
        font-family="${fontFamily}">${escapedText}</text>`;
    }).join('\n');

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgTexts}
      </svg>
    `;

    let outputBuffer: Buffer;

    if (backgroundImage) {
      // Decode base64 background image
      const bgBase64 = backgroundImage.replace(/^data:image\/\w+;base64,/, '');

      // Validate base64 format and size
      if (!isValidBase64(bgBase64)) {
        return res.status(400).json({ error: 'Invalid base64 image format' });
      }

      const bgBuffer = Buffer.from(bgBase64, 'base64');

      // Check image size
      if (bgBuffer.length > MAX_IMAGE_SIZE) {
        return res.status(400).json({
          error: `Image too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
        });
      }

      // Verify it's a valid image
      try {
        await sharp(bgBuffer).metadata();
      } catch {
        return res.status(400).json({ error: 'Invalid image data' });
      }

      // Composite SVG text over background
      outputBuffer = await sharp(bgBuffer)
        .resize(width, height, { fit: 'cover' })
        .composite([{
          input: Buffer.from(svg),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();
    } else {
      // Create solid color background with text
      const bgSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="${backgroundColor}"/>
          ${svgTexts}
        </svg>
      `;

      outputBuffer = await sharp(Buffer.from(bgSvg))
        .png()
        .toBuffer();
    }

    // Return as base64
    const base64Output = `data:image/png;base64,${outputBuffer.toString('base64')}`;

    res.json({
      success: true,
      image: base64Output,
      width,
      height
    });

  } catch (error) {
    console.error('Generate Error:', error);
    res.status(500).json({ error: 'Image generation failed', details: String(error) });
  }
});

export default router;
