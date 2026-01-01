import { Router, Request, Response } from 'express';
import Tesseract from 'tesseract.js';

const router = Router();

interface DetectedBlock {
  id: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text: string;
  confidence: number;
  estimatedFontSize: number;
  estimatedColor: string;
  direction: 'horizontal' | 'vertical';
}

interface DetectBlocksResponse {
  success: true;
  blocks: DetectedBlock[];
}

interface DetectBlocksError {
  success: false;
  error: string;
}

// Generate unique ID
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Estimate font size from bounding box height
// Typical font size is roughly 70-80% of line height
function estimateFontSize(height: number): number {
  return Math.round(height * 0.75);
}

// POST /api/detect-blocks
router.post('/', async (req: Request, res: Response) => {
  try {
    const { image } = req.body;

    if (!image) {
      const errorResponse: DetectBlocksError = {
        success: false,
        error: 'No image data provided. Expected { image: string } with base64 encoded image.'
      };
      return res.status(400).json(errorResponse);
    }

    if (typeof image !== 'string') {
      const errorResponse: DetectBlocksError = {
        success: false,
        error: 'Invalid image format. Expected base64 string.'
      };
      return res.status(400).json(errorResponse);
    }

    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (e) {
      const errorResponse: DetectBlocksError = {
        success: false,
        error: 'Failed to decode base64 image data.'
      };
      return res.status(400).json(errorResponse);
    }

    if (buffer.length === 0) {
      const errorResponse: DetectBlocksError = {
        success: false,
        error: 'Empty image data provided.'
      };
      return res.status(400).json(errorResponse);
    }

    console.log('Detecting text blocks...');

    // Perform OCR with Tesseract.js to get words with bounding boxes
    const result = await Tesseract.recognize(buffer, 'eng+chi_tra', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`Block detection progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    const blocks: DetectedBlock[] = [];

    // Process words from Tesseract result
    if (result.data.words && result.data.words.length > 0) {
      for (const word of result.data.words) {
        // Skip empty or whitespace-only text
        if (!word.text || word.text.trim() === '') {
          continue;
        }

        const width = word.bbox.x1 - word.bbox.x0;
        const height = word.bbox.y1 - word.bbox.y0;

        // Skip very small detections (likely noise)
        if (width < 3 || height < 3) {
          continue;
        }

        const block: DetectedBlock = {
          id: generateBlockId(),
          bbox: {
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: width,
            height: height
          },
          text: word.text,
          confidence: word.confidence,
          estimatedFontSize: estimateFontSize(height),
          estimatedColor: '#000000', // Default to black
          direction: 'horizontal' // Default to horizontal text
        };

        blocks.push(block);
      }
    }

    console.log(`Detected ${blocks.length} text blocks`);

    const response: DetectBlocksResponse = {
      success: true,
      blocks
    };

    res.json(response);

  } catch (error) {
    console.error('Block detection error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResponse: DetectBlocksError = {
      success: false,
      error: `Block detection failed: ${errorMessage}`
    };

    res.status(500).json(errorResponse);
  }
});

export default router;
