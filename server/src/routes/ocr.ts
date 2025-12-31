import { Router } from 'express';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  color: string; // hex color e.g. "#FF0000"
}

// Fast color extraction using Sharp raw pixel access
async function extractTextColors(
  imageBuffer: Buffer,
  blocks: Array<{ x: number; y: number; width: number; height: number }>
): Promise<string[]> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const { width: imgWidth = 0, height: imgHeight = 0 } = metadata;

  // Get raw RGB pixel data (no alpha for speed)
  const { data, info } = await image
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colors: string[] = [];
  const channels = info.channels; // Should be 3 (RGB)

  for (const block of blocks) {
    // Sample center point of text block for speed
    const centerX = Math.min(Math.max(Math.floor(block.x + block.width / 2), 0), imgWidth - 1);
    const centerY = Math.min(Math.max(Math.floor(block.y + block.height / 2), 0), imgHeight - 1);

    // Calculate pixel position in buffer
    const pixelIndex = (centerY * info.width + centerX) * channels;

    const r = data[pixelIndex] || 0;
    const g = data[pixelIndex + 1] || 0;
    const b = data[pixelIndex + 2] || 0;

    // Convert to hex
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    colors.push(hex);
  }

  return colors;
}

// OCR endpoint
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    console.log(`Processing OCR for: ${imagePath}`);

    // Read file into buffer for both OCR and color extraction
    const imageBuffer = fs.readFileSync(imagePath);

    // Perform OCR with Tesseract.js
    const result = await Tesseract.recognize(imageBuffer, 'eng+chi_tra', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    // Extract text blocks with positions (without colors first)
    const rawBlocks: Array<{ text: string; x: number; y: number; width: number; height: number; confidence: number }> = [];

    if (result.data.words) {
      for (const word of result.data.words) {
        rawBlocks.push({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
          confidence: word.confidence
        });
      }
    }

    // Extract colors for all blocks in one pass (fast)
    const colors = rawBlocks.length > 0
      ? await extractTextColors(imageBuffer, rawBlocks)
      : [];

    // Merge colors into text blocks
    const textBlocks: TextBlock[] = rawBlocks.map((block, i) => ({
      ...block,
      color: colors[i] || '#000000'
    }));

    // Clean up uploaded file
    fs.unlinkSync(imagePath);

    res.json({
      success: true,
      fullText: result.data.text,
      textBlocks,
      imageWidth: (result.data as any).width || 0,
      imageHeight: (result.data as any).height || 0
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'OCR processing failed', details: String(error) });
  }
});

// OCR from base64
router.post('/base64', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await Tesseract.recognize(buffer, 'eng+chi_tra', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    // Extract text blocks with positions (without colors first)
    const rawBlocks: Array<{ text: string; x: number; y: number; width: number; height: number; confidence: number }> = [];

    if (result.data.words) {
      for (const word of result.data.words) {
        rawBlocks.push({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
          confidence: word.confidence
        });
      }
    }

    // Extract colors for all blocks in one pass (fast)
    const colors = rawBlocks.length > 0
      ? await extractTextColors(buffer, rawBlocks)
      : [];

    // Merge colors into text blocks
    const textBlocks: TextBlock[] = rawBlocks.map((block, i) => ({
      ...block,
      color: colors[i] || '#000000'
    }));

    res.json({
      success: true,
      fullText: result.data.text,
      textBlocks,
      imageWidth: (result.data as any).width || 0,
      imageHeight: (result.data as any).height || 0
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'OCR processing failed', details: String(error) });
  }
});

export default router;
