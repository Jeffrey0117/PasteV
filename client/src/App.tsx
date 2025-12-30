import { useState, useRef, useCallback } from 'react';
import './App.css';

const API_BASE = 'http://localhost:3001/api';

interface TextBlock {
  id: string;
  text: string;
  translatedText?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}

interface OcrResult {
  fullText: string;
  textBlocks: TextBlock[];
  imageWidth: number;
  imageHeight: number;
}

type Step = 'upload' | 'ocr' | 'translate' | 'edit' | 'generate';

function App() {
  const [step, setStep] = useState<Step>('upload');
  const [image, setImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImage(base64);

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
      };
      img.src = base64;

      setStep('ocr');
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setImage(base64);

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
        };
        img.src = base64;

        setStep('ocr');
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Run OCR
  const runOcr = async () => {
    if (!image) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/ocr/base64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'OCR failed');
      }

      // Convert OCR results to text blocks with IDs
      const blocks: TextBlock[] = data.textBlocks.map((block: any, index: number) => ({
        id: `block-${index}`,
        text: block.text,
        translatedText: '',
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        fontSize: Math.max(12, Math.round(block.height * 0.8)),
        color: '#000000'
      }));

      setOcrResult(data);
      setTextBlocks(blocks);
      setStep('translate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setLoading(false);
    }
  };

  // Run translation
  const runTranslate = async () => {
    if (textBlocks.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const textsToTranslate = textBlocks.map(b => b.text);

      const response = await fetch(`${API_BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate,
          sourceLang: 'en',
          targetLang: 'zh'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Translation failed');
      }

      // Update text blocks with translations
      const updatedBlocks = textBlocks.map((block, index) => ({
        ...block,
        translatedText: data.translations[index] || block.text
      }));

      setTextBlocks(updatedBlocks);
      setStep('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  };

  // Update text block
  const updateTextBlock = (id: string, field: keyof TextBlock, value: any) => {
    setTextBlocks(blocks =>
      blocks.map(b => b.id === id ? { ...b, [field]: value } : b)
    );
  };

  // Generate final image
  const generateImage = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backgroundImage: image,
          width: imageSize.width,
          height: imageSize.height,
          textBlocks: textBlocks.map(b => ({
            text: b.translatedText || b.text,
            x: b.x,
            y: b.y,
            fontSize: b.fontSize,
            color: b.color
          }))
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setGeneratedImage(data.image);
      setStep('generate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  // Download generated image
  const downloadImage = () => {
    if (!generatedImage) return;

    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `pastev-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset to start
  const reset = () => {
    setStep('upload');
    setImage(null);
    setOcrResult(null);
    setTextBlocks([]);
    setGeneratedImage(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>PasteV</h1>
        <p>圖片文案翻譯還原工具</p>
      </header>

      {/* Progress Steps */}
      <div className="progress">
        {['upload', 'ocr', 'translate', 'edit', 'generate'].map((s, i) => (
          <div key={s} className={`step ${step === s ? 'active' : ''} ${
            ['upload', 'ocr', 'translate', 'edit', 'generate'].indexOf(step) > i ? 'done' : ''
          }`}>
            <span className="step-number">{i + 1}</span>
            <span className="step-label">
              {s === 'upload' && '上傳'}
              {s === 'ocr' && 'OCR'}
              {s === 'translate' && '翻譯'}
              {s === 'edit' && '編輯'}
              {s === 'generate' && '輸出'}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <main className="main">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            className="upload-zone"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              hidden
            />
            <div className="upload-icon">📷</div>
            <p>點擊或拖放圖片到此處</p>
            <p className="upload-hint">支援 JPG, PNG, GIF, WebP</p>
          </div>
        )}

        {/* Step 2: OCR */}
        {step === 'ocr' && image && (
          <div className="ocr-section">
            <div className="preview">
              <img src={image} alt="Uploaded" />
            </div>
            <div className="actions">
              <button onClick={reset} className="btn secondary">重新上傳</button>
              <button onClick={runOcr} className="btn primary" disabled={loading}>
                {loading ? '識別中...' : '開始 OCR 識別'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Translate */}
        {step === 'translate' && (
          <div className="translate-section">
            <div className="preview">
              <img src={image!} alt="Uploaded" />
            </div>
            <div className="ocr-results">
              <h3>OCR 識別結果</h3>
              <div className="text-list">
                {textBlocks.map(block => (
                  <div key={block.id} className="text-item">
                    <span>{block.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => setStep('ocr')} className="btn secondary">返回</button>
              <button onClick={runTranslate} className="btn primary" disabled={loading}>
                {loading ? '翻譯中...' : '翻譯成中文'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Edit */}
        {step === 'edit' && (
          <div className="edit-section">
            <div className="preview">
              <img src={image!} alt="Uploaded" />
              {/* Overlay translated text */}
              <div className="text-overlay">
                {textBlocks.map(block => (
                  <div
                    key={block.id}
                    className="overlay-text"
                    style={{
                      left: `${(block.x / imageSize.width) * 100}%`,
                      top: `${(block.y / imageSize.height) * 100}%`,
                      fontSize: `${block.fontSize}px`,
                      color: block.color
                    }}
                  >
                    {block.translatedText || block.text}
                  </div>
                ))}
              </div>
            </div>
            <div className="editor">
              <h3>編輯翻譯</h3>
              <div className="text-list">
                {textBlocks.map(block => (
                  <div key={block.id} className="edit-item">
                    <div className="original">{block.text}</div>
                    <input
                      type="text"
                      value={block.translatedText || ''}
                      onChange={(e) => updateTextBlock(block.id, 'translatedText', e.target.value)}
                      placeholder="翻譯文字"
                    />
                    <div className="controls">
                      <input
                        type="number"
                        value={block.fontSize}
                        onChange={(e) => updateTextBlock(block.id, 'fontSize', parseInt(e.target.value))}
                        min="8"
                        max="72"
                        title="字體大小"
                      />
                      <input
                        type="color"
                        value={block.color}
                        onChange={(e) => updateTextBlock(block.id, 'color', e.target.value)}
                        title="文字顏色"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => setStep('translate')} className="btn secondary">返回</button>
              <button onClick={generateImage} className="btn primary" disabled={loading}>
                {loading ? '生成中...' : '生成圖片'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Generate */}
        {step === 'generate' && generatedImage && (
          <div className="generate-section">
            <div className="preview">
              <img src={generatedImage} alt="Generated" />
            </div>
            <div className="actions">
              <button onClick={reset} className="btn secondary">重新開始</button>
              <button onClick={downloadImage} className="btn primary">
                下載圖片
              </button>
            </div>
          </div>
        )}
      </main>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>處理中...</p>
        </div>
      )}
    </div>
  );
}

export default App;
