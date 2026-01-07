import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ImageData, FieldTemplate, FieldContent } from '../../types';
import { createImageData, createDefaultField, generateId } from '../../types';
import './SmartModePage.css';

/** Smart Mode 4 步驟 */
type SmartStep = 'upload' | 'fields' | 'edit' | 'preview';

interface SmartModePageProps {
  onBack?: () => void;
}

/**
 * SmartModePage - Smart Mode 主頁面
 * 4 步流程：上傳 -> 欄位定義 -> 編輯 -> 預覽
 */
export function SmartModePage({ onBack }: SmartModePageProps) {
  // 步驟管理
  const [currentStep, setCurrentStep] = useState<SmartStep>('upload');

  // 圖片與 OCR 狀態
  const [images, setImages] = useState<ImageData[]>([]);
  const [ocrProgress, setOcrProgress] = useState({ completed: 0, total: 0 });
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  // 欄位模板
  const [fieldTemplates, setFieldTemplates] = useState<FieldTemplate[]>([
    createDefaultField('帳號', 0),
    createDefaultField('ID', 1),
  ]);

  // 編輯步驟狀態
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateTarget, setTranslateTarget] = useState<'field' | 'all' | null>(null);

  // 解析狀態
  const [isParsing, setIsParsing] = useState(false);

  // 預覽步驟狀態
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showTranslated, setShowTranslated] = useState(true);

  // 錯誤訊息
  const [error, setError] = useState<string | null>(null);

  // 欄位框選狀態
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const fieldsCanvasRef = useRef<HTMLDivElement>(null);

  // 拖曳欄位狀態
  const [isDragging, setIsDragging] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化 activeTab
  useEffect(() => {
    if (fieldTemplates.length > 0 && !activeTab) {
      setActiveTab(fieldTemplates[0].id);
    }
  }, [fieldTemplates, activeTab]);

  // ============================================
  // 檔案處理
  // ============================================

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = `data:image/png;base64,${base64}`;
    });
  };

  const getImageSrc = (base64: string): string => {
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  };

  // ============================================
  // 背景 OCR
  // ============================================

  const runOcrForImage = useCallback(async (imageId: string, imageBase64: string) => {
    try {
      setImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, status: 'ocr' } : img
      ));

      const response = await fetch('/api/detect-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 }),
      });

      if (!response.ok) throw new Error('OCR 失敗');

      const result = await response.json();
      const ocrText = result.blocks?.map((b: { text: string }) => b.text).join('\n') || '';

      setImages(prev => prev.map(img =>
        img.id === imageId
          ? { ...img, ocrText, detectedBlocks: result.blocks, status: 'ocr_done' }
          : img
      ));

      setOcrProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
    } catch (err) {
      console.error('OCR error for image:', imageId, err);
      setImages(prev => prev.map(img =>
        img.id === imageId ? { ...img, status: 'error' } : img
      ));
      setOcrProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
    }
  }, []);

  const startBackgroundOcr = useCallback(async (newImages: ImageData[]) => {
    if (newImages.length === 0) return;

    setIsOcrRunning(true);
    setOcrProgress({ completed: 0, total: newImages.length });

    // 逐一執行 OCR（可改為並行但需控制併發數）
    for (const img of newImages) {
      await runOcrForImage(img.id, img.originalImage);
    }

    setIsOcrRunning(false);
  }, [runOcrForImage]);

  // ============================================
  // 檔案上傳
  // ============================================

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setError(null);

    const processPromises = fileArray.map(async (file) => {
      if (!file.type.startsWith('image/')) return null;

      try {
        const base64 = await fileToBase64(file);
        const dimensions = await getImageDimensions(base64);
        const imageData = createImageData(base64, dimensions.width, dimensions.height);
        imageData.status = 'pending';
        return imageData;
      } catch (err) {
        console.error('Failed to process image:', file.name, err);
        return null;
      }
    });

    const results = await Promise.all(processPromises);
    const validImages = results.filter((img): img is ImageData => img !== null);

    if (validImages.length > 0) {
      setImages(prev => {
        const updated = [...prev, ...validImages];
        // 啟動背景 OCR
        startBackgroundOcr(validImages);
        return updated;
      });
    }
  }, [startBackgroundOcr]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelect]);

  // ============================================
  // 欄位管理
  // ============================================

  const handleAddField = useCallback(() => {
    const newField = createDefaultField(`欄位 ${fieldTemplates.length + 1}`, fieldTemplates.length);
    setFieldTemplates(prev => [...prev, newField]);
  }, [fieldTemplates.length]);

  const handleRemoveField = useCallback((fieldId: string) => {
    setFieldTemplates(prev => {
      const updated = prev.filter(f => f.id !== fieldId);
      // 如果刪除的是當前 tab，切換到第一個
      if (activeTab === fieldId && updated.length > 0) {
        setActiveTab(updated[0].id);
      }
      return updated;
    });
  }, [activeTab]);

  const handleUpdateField = useCallback((fieldId: string, updates: Partial<FieldTemplate>) => {
    setFieldTemplates(prev => prev.map(f =>
      f.id === fieldId ? { ...f, ...updates } : f
    ));
  }, []);

  // ============================================
  // 欄位框選處理
  // ============================================

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!fieldsCanvasRef.current) return;

    // 如果正在拖曳欄位，不要開始繪製
    if (isDragging) return;

    const rect = fieldsCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawEnd({ x, y });
  }, [isDragging]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!fieldsCanvasRef.current) return;
    const rect = fieldsCanvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    // 拖曳欄位
    if (isDragging && dragFieldId && dragOffset) {
      const newX = x - dragOffset.x;
      const newY = y - dragOffset.y;
      setFieldTemplates(prev => prev.map(f =>
        f.id === dragFieldId ? { ...f, x: Math.round(newX), y: Math.round(newY) } : f
      ));
      return;
    }

    // 繪製新欄位
    if (isDrawing) {
      setDrawEnd({ x, y });
    }
  }, [isDrawing, isDragging, dragFieldId, dragOffset]);

  const handleCanvasMouseUp = useCallback(() => {
    // 結束拖曳
    if (isDragging) {
      setIsDragging(false);
      setDragFieldId(null);
      setDragOffset(null);
      return;
    }

    // 結束繪製
    if (!isDrawing || !drawStart || !drawEnd) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const width = Math.abs(drawEnd.x - drawStart.x);
    const height = Math.abs(drawEnd.y - drawStart.y);

    // 最小尺寸檢查
    if (width > 20 && height > 10) {
      // 新增欄位
      const newField = createDefaultField(`欄位 ${fieldTemplates.length + 1}`, fieldTemplates.length);
      newField.x = Math.round(x);
      newField.y = Math.round(y);
      newField.width = Math.round(width);
      newField.height = Math.round(height);
      setFieldTemplates(prev => [...prev, newField]);
      setSelectedFieldId(newField.id);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawEnd(null);
  }, [isDrawing, isDragging, drawStart, drawEnd, fieldTemplates.length]);

  // 開始拖曳欄位
  const handleFieldMouseDown = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fieldsCanvasRef.current) return;

    const field = fieldTemplates.find(f => f.id === fieldId);
    if (!field) return;

    const rect = fieldsCanvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setSelectedFieldId(fieldId);
    setIsDragging(true);
    setDragFieldId(fieldId);
    setDragOffset({
      x: mouseX - field.x,
      y: mouseY - field.y,
    });
  }, [fieldTemplates]);

  // 刪除欄位（圖片上的刪除按鈕）
  const handleFieldDelete = useCallback((fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFieldTemplates(prev => prev.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  }, [selectedFieldId]);

  const getDrawingRect = useCallback(() => {
    if (!drawStart || !drawEnd) return null;
    return {
      left: Math.min(drawStart.x, drawEnd.x),
      top: Math.min(drawStart.y, drawEnd.y),
      width: Math.abs(drawEnd.x - drawStart.x),
      height: Math.abs(drawEnd.y - drawStart.y),
    };
  }, [drawStart, drawEnd]);

  // ============================================
  // AI 解析
  // ============================================

  const handleAIParse = useCallback(async () => {
    if (images.length === 0 || fieldTemplates.length === 0) return;

    setIsParsing(true);
    setError(null);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldTemplates.map(f => ({ id: f.id, name: f.name })),
          images: images.map(img => ({
            id: img.id,
            // 使用 OCR 文字模式 (DeepSeek 可用)
            // 如需 Vision 模式，需設定 OPENAI_API_KEY 並加入 imageData
            ocrText: img.ocrText || '',
          })),
        }),
      });

      if (!response.ok) throw new Error('AI 解析失敗');

      const result = await response.json();

      setImages(prev => prev.map(img => {
        const parsedFields = result.results?.[img.id];
        if (!parsedFields) return img;

        const fields: Record<string, FieldContent> = {};
        for (const [fieldId, text] of Object.entries(parsedFields)) {
          fields[fieldId] = { original: text as string, translated: '' };
        }

        return { ...img, fields, status: 'parsed' };
      }));

      // 設定預設 activeTab
      if (fieldTemplates.length > 0) {
        setActiveTab(fieldTemplates[0].id);
      }

      setCurrentStep('edit');
    } catch (err) {
      console.error('AI Parse error:', err);
      setError(err instanceof Error ? err.message : 'AI 解析失敗');
    } finally {
      setIsParsing(false);
    }
  }, [images, fieldTemplates]);

  // ============================================
  // 翻譯功能
  // ============================================

  const handleTranslateField = useCallback(async (fieldId: string) => {
    const textsToTranslate: Array<{ key: string; text: string }> = [];

    images.forEach(img => {
      const content = img.fields?.[fieldId];
      if (content?.original && !content.translated) {
        textsToTranslate.push({
          key: `${img.id}:${fieldId}`,
          text: content.original,
        });
      }
    });

    if (textsToTranslate.length === 0) return;

    setIsTranslating(true);
    setTranslateTarget('field');
    setError(null);

    try {
      const response = await fetch('/api/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: textsToTranslate }),
      });

      if (!response.ok) throw new Error('翻譯失敗');

      const result = await response.json();

      setImages(prev => prev.map(img => {
        const key = `${img.id}:${fieldId}`;
        if (result.translations?.[key]) {
          const updatedFields = { ...img.fields };
          updatedFields[fieldId] = {
            ...updatedFields[fieldId],
            translated: result.translations[key],
          };
          return { ...img, fields: updatedFields };
        }
        return img;
      }));
    } catch (err) {
      console.error('Translate error:', err);
      setError(err instanceof Error ? err.message : '翻譯失敗');
    } finally {
      setIsTranslating(false);
      setTranslateTarget(null);
    }
  }, [images]);

  const handleTranslateAll = useCallback(async () => {
    const textsToTranslate: Array<{ key: string; text: string }> = [];

    images.forEach(img => {
      Object.entries(img.fields || {}).forEach(([fieldId, content]) => {
        if (content.original && !content.translated) {
          textsToTranslate.push({
            key: `${img.id}:${fieldId}`,
            text: content.original,
          });
        }
      });
    });

    if (textsToTranslate.length === 0) return;

    setIsTranslating(true);
    setTranslateTarget('all');
    setError(null);

    try {
      const response = await fetch('/api/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: textsToTranslate }),
      });

      if (!response.ok) throw new Error('翻譯失敗');

      const result = await response.json();

      setImages(prev => prev.map(img => {
        const updatedFields = { ...img.fields };
        Object.keys(updatedFields).forEach(fieldId => {
          const key = `${img.id}:${fieldId}`;
          if (result.translations?.[key]) {
            updatedFields[fieldId] = {
              ...updatedFields[fieldId],
              translated: result.translations[key],
            };
          }
        });
        return { ...img, fields: updatedFields, status: 'translated' };
      }));
    } catch (err) {
      console.error('Translate error:', err);
      setError(err instanceof Error ? err.message : '翻譯失敗');
    } finally {
      setIsTranslating(false);
      setTranslateTarget(null);
    }
  }, [images]);

  // ============================================
  // 輸出功能
  // ============================================

  const handleExportSingle = useCallback(async () => {
    const img = images[previewIndex];
    if (!img) return;

    // 簡單實作：將資料下載為 JSON（實際應用可改為圖片輸出）
    const data = {
      image: img.id,
      fields: img.fields,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output-${previewIndex + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [images, previewIndex]);

  const handleExportAll = useCallback(async () => {
    // 簡單實作：將所有資料下載為 JSON（實際應用可改為 ZIP）
    const data = images.map((img, index) => ({
      index: index + 1,
      image: img.id,
      fields: img.fields,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `output-all.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [images]);

  // ============================================
  // 步驟導航
  // ============================================

  const allOcrCompleted = images.length > 0 && images.every(img =>
    img.status === 'ocr_done' || img.status === 'parsed' || img.status === 'translated'
  );

  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case 'upload':
        return images.length > 0 && allOcrCompleted;
      case 'fields':
        return fieldTemplates.length > 0;
      case 'edit':
        return images.some(img => Object.keys(img.fields || {}).length > 0);
      default:
        return false;
    }
  }, [currentStep, images, fieldTemplates, allOcrCompleted]);

  const handleNextStep = useCallback(() => {
    switch (currentStep) {
      case 'upload':
        setCurrentStep('fields');
        break;
      case 'fields':
        handleAIParse();
        break;
      case 'edit':
        setPreviewIndex(0);
        setCurrentStep('preview');
        break;
    }
  }, [currentStep, handleAIParse]);

  const handlePrevStep = useCallback(() => {
    switch (currentStep) {
      case 'fields':
        setCurrentStep('upload');
        break;
      case 'edit':
        setCurrentStep('fields');
        break;
      case 'preview':
        setCurrentStep('edit');
        break;
    }
  }, [currentStep]);

  const handleClearAll = useCallback(() => {
    console.log('handleClearAll called');
    setImages([]);
    setFieldTemplates([
      createDefaultField('帳號', 0),
      createDefaultField('ID', 1),
    ]);
    setCurrentStep('upload');
    setOcrProgress({ completed: 0, total: 0 });
    setError(null);
    setPreviewIndex(0);
    setSelectedFieldId(null);
    setActiveTab(null);
  }, []);

  // ============================================
  // 步驟設定
  // ============================================

  const steps: SmartStep[] = ['upload', 'fields', 'edit', 'preview'];
  const stepLabels: Record<SmartStep, string> = {
    upload: '上傳',
    fields: '欄位',
    edit: '編輯',
    preview: '預覽',
  };
  const currentStepIndex = steps.indexOf(currentStep);

  // ============================================
  // 渲染
  // ============================================

  return (
    <div className="smart-mode-page">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <div className="smart-mode-header">
        <div className="smart-mode-header-left">
          {onBack && (
            <button className="btn-back" onClick={onBack}>
              ← 返回
            </button>
          )}
          <div
            className="smart-mode-title-link"
            onClick={handleClearAll}
            title="回到初始狀態"
          >
            <img src="/logo.png" alt="PasteV" className="smart-mode-logo" />
            <h1>Smart Mode - 智慧翻譯</h1>
          </div>
        </div>
        <div className="smart-mode-header-right">
          {images.length > 0 && (
            <button className="btn-clear" onClick={handleClearAll}>
              清除全部
            </button>
          )}
        </div>
      </div>

      {/* Step indicator - 4 步驟 */}
      <div className="smart-mode-steps">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step-item ${currentStep === step ? 'active' : ''} ${index < currentStepIndex ? 'completed' : ''}`}
          >
            <div className="step-number">
              {index < currentStepIndex ? '✓' : index + 1}
            </div>
            <span className="step-label">{stepLabels[step]}</span>
            {index < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="smart-mode-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Main content */}
      <div className="smart-mode-content">
        {/* ==================== */}
        {/* Step 1: Upload       */}
        {/* ==================== */}
        {currentStep === 'upload' && (
          <div className="step-upload">
            {images.length === 0 ? (
              <div
                className="smart-mode-dropzone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleClick}
              >
                <div className="dropzone-icon">+</div>
                <p>拖放圖片或點擊選擇</p>
                <span className="dropzone-hint">支援多張圖片，上傳後自動執行 OCR</span>
              </div>
            ) : (
              <>
                <div className="smart-mode-image-grid">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      className={`image-grid-item ${image.status === 'ocr' ? 'processing' : ''}`}
                    >
                      <img src={getImageSrc(image.originalImage)} alt={`Image ${index + 1}`} />
                      <div className="image-grid-index">{index + 1}</div>
                      <div className={`image-grid-status status-${image.status}`}>
                        {image.status === 'pending' && '等待中'}
                        {image.status === 'ocr' && '辨識中...'}
                        {image.status === 'ocr_done' && '✓ 完成'}
                        {image.status === 'error' && '錯誤'}
                      </div>
                    </div>
                  ))}
                  <div
                    className="image-grid-add"
                    onClick={handleClick}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <span>+</span>
                  </div>
                </div>

                {/* OCR Progress */}
                {(isOcrRunning || ocrProgress.total > 0) && (
                  <div className="smart-mode-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${ocrProgress.total > 0 ? (ocrProgress.completed / ocrProgress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="progress-text">
                      OCR: {ocrProgress.completed}/{ocrProgress.total} 完成
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================== */}
        {/* Step 2: Fields       */}
        {/* ==================== */}
        {currentStep === 'fields' && (
          <div className="step-fields">
            <div className="fields-layout">
              {/* 左側：圖片框選區 */}
              <div className="fields-canvas-area">
                <div className="fields-canvas-hint">在圖片上框選欄位區域</div>
                {images.length > 0 && (
                  <div
                    ref={fieldsCanvasRef}
                    className="fields-canvas"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  >
                    <img
                      src={getImageSrc(images[0].originalImage)}
                      alt="Preview"
                      className="fields-canvas-image"
                      draggable={false}
                    />
                    {/* 已定義的欄位框 */}
                    {fieldTemplates.map((field, index) => (
                      <div
                        key={field.id}
                        className={`field-box ${selectedFieldId === field.id ? 'selected' : ''} ${isDragging && dragFieldId === field.id ? 'dragging' : ''}`}
                        style={{
                          left: field.x,
                          top: field.y,
                          width: field.width,
                          height: field.height || 30,
                        }}
                        onMouseDown={(e) => handleFieldMouseDown(field.id, e)}
                      >
                        <span className="field-box-label">{index + 1}. {field.name}</span>
                        <button
                          className="field-box-delete"
                          onClick={(e) => handleFieldDelete(field.id, e)}
                          title="刪除欄位"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {/* 正在繪製的框 */}
                    {isDrawing && drawStart && drawEnd && (
                      <div
                        className="field-box drawing"
                        style={getDrawingRect() || {}}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* 右側：欄位列表 */}
              <div className="fields-editor">
                <h3>欄位列表</h3>
                <p className="fields-hint">
                  在左側圖片上框選區域新增欄位，或點擊下方按鈕
                </p>
                <div className="fields-list">
                  {fieldTemplates.map((field, index) => (
                    <div
                      key={field.id}
                      className={`field-item ${selectedFieldId === field.id ? 'selected' : ''}`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <span className="field-index">{index + 1}</span>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                        placeholder="欄位名稱"
                        className="field-name-input"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        className="btn-remove-field"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveField(field.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button className="btn-add-field" onClick={handleAddField}>
                  + 手動新增欄位
                </button>
                <div className="fields-summary">
                  共 {images.length} 張圖片，{fieldTemplates.length} 個欄位
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== */}
        {/* Step 3: Edit         */}
        {/* ==================== */}
        {currentStep === 'edit' && (
          <div className="step-edit">
            {/* Tab 切換欄位 */}
            <div className="edit-tabs">
              {fieldTemplates.map(field => (
                <button
                  key={field.id}
                  className={`edit-tab ${activeTab === field.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(field.id)}
                >
                  {field.name}
                </button>
              ))}
            </div>

            {/* 表格編輯 */}
            <div className="edit-table-container">
              <table className="edit-table">
                <thead>
                  <tr>
                    <th className="col-image">圖片</th>
                    <th className="col-original">原文</th>
                    <th className="col-translated">譯文</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((img, imgIndex) => {
                    const fieldContent = activeTab ? img.fields?.[activeTab] : null;
                    return (
                      <tr key={img.id}>
                        <td className="col-image">
                          <div className="table-image-cell">
                            <img src={getImageSrc(img.originalImage)} alt={`${imgIndex + 1}`} />
                            <span>{imgIndex + 1}</span>
                          </div>
                        </td>
                        <td className="col-original">
                          <input
                            type="text"
                            value={fieldContent?.original || ''}
                            onChange={(e) => {
                              if (!activeTab) return;
                              const newFields = { ...img.fields };
                              newFields[activeTab] = {
                                original: e.target.value,
                                translated: newFields[activeTab]?.translated || '',
                              };
                              setImages(prev => prev.map(i =>
                                i.id === img.id ? { ...i, fields: newFields } : i
                              ));
                            }}
                            placeholder="輸入原文"
                            className="edit-input"
                          />
                        </td>
                        <td className="col-translated">
                          <input
                            type="text"
                            value={fieldContent?.translated || ''}
                            onChange={(e) => {
                              if (!activeTab) return;
                              const newFields = { ...img.fields };
                              newFields[activeTab] = {
                                original: newFields[activeTab]?.original || '',
                                translated: e.target.value,
                              };
                              setImages(prev => prev.map(i =>
                                i.id === img.id ? { ...i, fields: newFields } : i
                              ));
                            }}
                            placeholder={fieldContent?.translated ? '' : '(尚未翻譯)'}
                            className="edit-input"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 翻譯按鈕 */}
            <div className="edit-actions">
              <button
                className="btn-translate-field"
                onClick={() => activeTab && handleTranslateField(activeTab)}
                disabled={isTranslating || !activeTab}
              >
                {isTranslating && translateTarget === 'field' ? '翻譯中...' : '翻譯此欄位'}
              </button>
              <button
                className="btn-translate-all"
                onClick={handleTranslateAll}
                disabled={isTranslating}
              >
                {isTranslating && translateTarget === 'all' ? '翻譯中...' : '翻譯全部'}
              </button>
            </div>
          </div>
        )}

        {/* ==================== */}
        {/* Step 4: Preview      */}
        {/* ==================== */}
        {currentStep === 'preview' && (
          <div className="step-preview">
            {/* 圖片切換 */}
            <div className="preview-nav">
              <button
                className="btn-prev-image"
                onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
              >
                ← 上一張
              </button>
              <span className="preview-counter">
                {previewIndex + 1} / {images.length}
              </span>
              <button
                className="btn-next-image"
                onClick={() => setPreviewIndex(i => Math.min(images.length - 1, i + 1))}
                disabled={previewIndex === images.length - 1}
              >
                下一張 →
              </button>
            </div>

            {/* 預覽區域 */}
            <div className="preview-area">
              {images[previewIndex] && (
                <>
                  <div className="preview-image-wrapper">
                    <img
                      src={getImageSrc(images[previewIndex].originalImage)}
                      alt={`Preview ${previewIndex + 1}`}
                      className="preview-main-image"
                    />
                  </div>
                  <div className="preview-fields-list">
                    {fieldTemplates.map(field => {
                      const content = images[previewIndex].fields?.[field.id];
                      return (
                        <div key={field.id} className="preview-field-row">
                          <span className="preview-field-name">{field.name}:</span>
                          <span className="preview-field-value">
                            {showTranslated
                              ? (content?.translated || content?.original || '-')
                              : (content?.original || '-')
                            }
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 控制列 */}
            <div className="preview-controls">
              <button
                className={`btn-toggle-text ${showTranslated ? 'active' : ''}`}
                onClick={() => setShowTranslated(!showTranslated)}
              >
                {showTranslated ? '顯示譯文' : '顯示原文'}
              </button>
            </div>

            {/* 輸出按鈕 */}
            <div className="preview-export">
              <button className="btn-export-single" onClick={handleExportSingle}>
                輸出此張
              </button>
              <button className="btn-export-all" onClick={handleExportAll}>
                輸出全部 (ZIP)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="smart-mode-nav">
        <button
          className="btn-prev"
          onClick={handlePrevStep}
          disabled={currentStep === 'upload'}
        >
          ← 上一步
        </button>
        <button
          className="btn-next"
          onClick={handleNextStep}
          disabled={!canGoNext() || isParsing || (currentStep === 'upload' && isOcrRunning)}
        >
          {isParsing
            ? '解析中...'
            : currentStep === 'upload' && isOcrRunning
              ? 'OCR 處理中...'
              : currentStep === 'preview'
                ? '完成'
                : currentStep === 'fields'
                  ? '開始 AI 解析 →'
                  : '下一步 →'
          }
        </button>
      </div>
    </div>
  );
}

export default SmartModePage;
