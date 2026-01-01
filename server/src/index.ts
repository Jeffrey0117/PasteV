import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import ocrRouter from './routes/ocr.js';
import translateRouter from './routes/translate.js';
import generateRouter from './routes/generate.js';
import parseRouter from './routes/parse.js';
import detectBlocksRouter from './routes/detect-blocks.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/ocr', ocrRouter);
app.use('/api/translate', translateRouter);
app.use('/api/generate', generateRouter);
app.use('/api/parse', parseRouter);
app.use('/api/detect-blocks', detectBlocksRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PasteV API is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
