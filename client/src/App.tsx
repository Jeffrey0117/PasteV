import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

// Types
import type {
  ImageData,
  FieldTemplate,
  FieldContent,
  AppStep,
  CanvasSettings,
} from './types';
import { createDefaultProject, generateId, createDefaultField } from './types';

// Components
import { FieldEditor } from './components/FieldEditor';
import { TableEditor } from './components/TableEditor';
import { Preview } from './components/Preview';

const API_BASE = 'http://localhost:3001/api';

function App() {
  // Project State
  const [images, setImages] = useState<ImageData[]>([]);
  const [fieldTemplates, setFieldTemplates] = useState<FieldTemplate[]>([
    createDefaultField('標題', 0),
    createDefaultField('副標題', 1),
  ]);
  const [currentStep, setCurrentStep] = useState<AppStep>('upload');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
  });

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // localStorage key
  const STORAGE_KEY = 'pastev_v2_session';

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.images?.length > 0) {
          setImages(data.images);
          setFieldTemplates(data.fieldTemplates || []);
          setCurrentStep(data.currentStep || 'upload');
          setCurrentImageIndex(data.currentImageIndex || 0);
          if (data.canvasSettings) setCanvasSettings(data.canvasSettings);
          console.log('Session restored from localStorage');
        }
      }
    } catch (e) {
      console.error('Failed to restore session:', e);
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    if (images.length > 0) {
      try {
        const data = {
          images,
          fieldTemplates,
          currentStep,
          currentImageIndex,
          canvasSettings,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.error('Failed to save session:', e);
      }
    }
  }, [images, fieldTemplates, currentStep, currentImageIndex, canvasSettings]);

  // Current image
  const currentImage = images[currentImageIndex];

  // Handle multi-image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages: ImageData[] = [];
    let loadedCount = 0;

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;

        const img = new Image();
        img.onload = () => {
          newImages[index] = {
            id: generateId('img'),
            originalImage: base64,
            width: img.width,
            height: img.height,
            ocrText: '',
            fields: {},
            status: 'pending',
          };

          loadedCount++;
          if (loadedCount === files.length) {
            const sortedImages = newImages.filter(Boolean);
            setImages(sortedImages);
            setCurrentImageIndex(0);

            // Set canvas size to first image
            if (sortedImages[0]) {
              setCanvasSettings((prev) => ({
                ...prev,
                width: sortedImages[0].width,
                height: sortedImages[0].height,
              }));
            }

            setError(null);
            // Auto run OCR
            runBatchOcr(sortedImages);
          }
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Batch OCR
  const runBatchOcr = async (imagesToProcess?: ImageData[]) => {
    const targetImages = imagesToProcess || images;
    setLoading(true);
    setError(null);

    try {
      const updatedImages = [...targetImages];

      for (let i = 0; i < targetImages.length; i++) {
        setProcessingStatus(`OCR 處理中... (${i + 1}/${targetImages.length})`);
        updatedImages[i] = { ...updatedImages[i], status: 'ocr' };
        setImages([...updatedImages]);

        const response = await fetch(`${API_BASE}/ocr/base64`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: targetImages[i].originalImage }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'OCR failed');

        updatedImages[i] = {
          ...updatedImages[i],
          ocrText: data.fullText?.trim() || '',
          status: 'ocr_done',
        };
        setImages([...updatedImages]);
      }

      setProcessingStatus('OCR 完成！進入欄位定義...');
      setImages(updatedImages);

      // Move to fields step
      setTimeout(() => {
        setCurrentStep('fields');
        setProcessingStatus('');
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setLoading(false);
    }
  };

  // AI Parse - extract field content from OCR text
  const runAiParse = async () => {
    setLoading(true);
    setError(null);

    try {
      setProcessingStatus('AI 解析中...');

      const response = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldTemplates.map((f) => ({
            id: f.id,
            name: f.name,
          })),
          images: images.map((img) => ({
            id: img.id,
            ocrText: img.ocrText,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Parse failed');

      // Update images with parsed content
      setImages((prev) =>
        prev.map((img) => {
          const parsed = data.results[img.id] || {};
          const fields: Record<string, FieldContent> = {};

          fieldTemplates.forEach((field) => {
            fields[field.id] = {
              original: parsed[field.id] || '',
              translated: '',
            };
          });

          return { ...img, fields, status: 'parsed' };
        })
      );

      setProcessingStatus('解析完成！');
      setCurrentStep('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    } finally {
      setLoading(false);
      setProcessingStatus('');
    }
  };

  // Content change handler for TableEditor
  const handleContentChange = useCallback(
    (imageId: string, fieldId: string, content: FieldContent) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, fields: { ...img.fields, [fieldId]: content } }
            : img
        )
      );
    },
    []
  );

  // Translate single field
  const handleTranslateField = useCallback(
    async (fieldId: string) => {
      const textsToTranslate: Array<{ key: string; text: string }> = [];

      images.forEach((img) => {
        const content = img.fields[fieldId];
        if (content?.original && !content?.translated) {
          textsToTranslate.push({
            key: `${img.id}:${fieldId}`,
            text: content.original,
          });
        }
      });

      if (textsToTranslate.length === 0) return;

      setIsTranslating(true);
      try {
        const response = await fetch(`${API_BASE}/translate/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textsToTranslate,
            sourceLang: 'en',
            targetLang: 'zh-TW',
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Translation failed');

        // Update translations
        setImages((prev) =>
          prev.map((img) => {
            const key = `${img.id}:${fieldId}`;
            const translated = data.translations[key];
            if (translated) {
              return {
                ...img,
                fields: {
                  ...img.fields,
                  [fieldId]: {
                    ...img.fields[fieldId],
                    translated,
                  },
                },
              };
            }
            return img;
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Translation failed');
      } finally {
        setIsTranslating(false);
      }
    },
    [images]
  );

  // Translate all fields
  const handleTranslateAll = useCallback(async () => {
    const textsToTranslate: Array<{ key: string; text: string }> = [];

    fieldTemplates.forEach((field) => {
      images.forEach((img) => {
        const content = img.fields[field.id];
        if (content?.original && !content?.translated) {
          textsToTranslate.push({
            key: `${img.id}:${field.id}`,
            text: content.original,
          });
        }
      });
    });

    if (textsToTranslate.length === 0) return;

    setIsTranslating(true);
    try {
      const response = await fetch(`${API_BASE}/translate/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate,
          sourceLang: 'en',
          targetLang: 'zh-TW',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Translation failed');

      // Update all translations
      setImages((prev) =>
        prev.map((img) => {
          const updatedFields = { ...img.fields };

          fieldTemplates.forEach((field) => {
            const key = `${img.id}:${field.id}`;
            const translated = data.translations[key];
            if (translated && updatedFields[field.id]) {
              updatedFields[field.id] = {
                ...updatedFields[field.id],
                translated,
              };
            }
          });

          return { ...img, fields: updatedFields, status: 'translated' };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [images, fieldTemplates]);

  // Reset
  const reset = () => {
    const defaultProject = createDefaultProject();
    setImages([]);
    setFieldTemplates(defaultProject.fieldTemplates);
    setCurrentStep('upload');
    setCurrentImageIndex(0);
    setSelectedFieldId(null);
    setCanvasSettings(defaultProject.canvasSettings);
    setProcessingStatus('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    localStorage.removeItem(STORAGE_KEY);
  };

  // Navigation
  const goToStep = (step: AppStep) => {
    setCurrentStep(step);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div>
            <h1>PasteV</h1>
            <p>
              圖片文案翻譯工具{' '}
              {images.length > 0 && `(${images.length} 張圖片)`}
            </p>
          </div>
          {currentStep !== 'upload' && (
            <button onClick={reset} className="btn secondary">
              重新開始
            </button>
          )}
        </div>

        {/* Step indicator */}
        {currentStep !== 'upload' && (
          <div className="step-indicator">
            <div
              className={`step-item ${currentStep === 'fields' ? 'active' : ''} ${
                ['edit', 'preview'].includes(currentStep) ? 'done' : ''
              }`}
              onClick={() => goToStep('fields')}
            >
              <span className="step-num">1</span>
              <span className="step-label">欄位定義</span>
            </div>
            <div className="step-line" />
            <div
              className={`step-item ${currentStep === 'edit' ? 'active' : ''} ${
                currentStep === 'preview' ? 'done' : ''
              }`}
              onClick={() => currentStep !== 'fields' && goToStep('edit')}
            >
              <span className="step-num">2</span>
              <span className="step-label">內容編輯</span>
            </div>
            <div className="step-line" />
            <div
              className={`step-item ${currentStep === 'preview' ? 'active' : ''}`}
              onClick={() => currentStep === 'preview' && goToStep('preview')}
            >
              <span className="step-num">3</span>
              <span className="step-label">預覽輸出</span>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <main className="main">
        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              hidden
            />
            <div className="upload-icon">📷</div>
            <p>點擊上傳要翻譯的圖片</p>
            <p className="upload-hint">
              支援多張圖片，將自動進行 OCR 識別
            </p>
          </div>
        )}

        {/* Step 2: Field Definition */}
        {currentStep === 'fields' && currentImage && (
          <div className="step-container">
            <FieldEditor
              image={currentImage}
              fields={fieldTemplates}
              onFieldsChange={setFieldTemplates}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              canvasSettings={canvasSettings}
            />
            <div className="step-actions">
              <button onClick={reset} className="btn secondary">
                取消
              </button>
              <button
                onClick={runAiParse}
                className="btn primary"
                disabled={loading || fieldTemplates.length === 0}
              >
                {loading ? '解析中...' : 'AI 解析欄位內容 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Table Edit */}
        {currentStep === 'edit' && (
          <div className="step-container">
            <TableEditor
              images={images}
              fields={fieldTemplates}
              activeFieldId={selectedFieldId || fieldTemplates[0]?.id || ''}
              onActiveFieldChange={setSelectedFieldId}
              onContentChange={handleContentChange}
              onTranslateField={handleTranslateField}
              onTranslateAll={handleTranslateAll}
              isTranslating={isTranslating}
            />
            <div className="step-actions">
              <button onClick={() => goToStep('fields')} className="btn secondary">
                ← 修改欄位
              </button>
              <button
                onClick={() => {
                  setImages((prev) =>
                    prev.map((img) => ({ ...img, status: 'ready' }))
                  );
                  goToStep('preview');
                }}
                className="btn primary"
              >
                預覽輸出 →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {currentStep === 'preview' && (
          <Preview
            images={images}
            fields={fieldTemplates}
            onFieldsChange={setFieldTemplates}
            canvasSettings={canvasSettings}
            onCanvasSettingsChange={setCanvasSettings}
            currentIndex={currentImageIndex}
            onIndexChange={setCurrentImageIndex}
            onBack={() => goToStep('edit')}
          />
        )}
      </main>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{processingStatus || '處理中...'}</p>
        </div>
      )}
    </div>
  );
}

export default App;
