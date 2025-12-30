import { Router } from 'express';
import multer from 'multer';
import Tesseract from 'tesseract.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
}

// OCR endpoint
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    console.log(`Processing OCR for: ${imagePath}`);

    // Perform OCR with Tesseract.js
    const result = await Tesseract.recognize(imagePath, 'eng+chi_tra', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    // Extract text blocks with positions
    const textBlocks: TextBlock[] = [];

    if (result.data.words) {
      for (const word of result.data.words) {
        textBlocks.push({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
          confidence: word.confidence
        });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(imagePath);

    res.json({
      success: true,
      fullText: result.data.text,
      textBlocks,
      imageWidth: result.data.width || 0,
      imageHeight: result.data.height || 0
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

    const textBlocks: TextBlock[] = [];

    if (result.data.words) {
      for (const word of result.data.words) {
        textBlocks.push({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
          confidence: word.confidence
        });
      }
    }

    res.json({
      success: true,
      fullText: result.data.text,
      textBlocks,
      imageWidth: result.data.width || 0,
      imageHeight: result.data.height || 0
    });

  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'OCR processing failed', details: String(error) });
  }
});

export default router;
