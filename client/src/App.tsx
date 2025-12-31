import { useState, useRef, useCallback, useEffect } from 'react';
import html2canvas from 'html2canvas';
import './App.css';

const API_BASE = 'http://localhost:3001/api';

// 可用字體列表
const FONT_OPTIONS = [
  { value: 'system-ui, sans-serif', label: '系統預設' },
  { value: '"Microsoft JhengHei", sans-serif', label: '微軟正黑體' },
  { value: '"Noto Sans TC", sans-serif', label: '思源黑體' },
  { value: '"Arial", sans-serif', label: 'Arial' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: '"Georgia", serif', label: 'Georgia' },
];

// 文字區塊 (增強版)
interface TextBlock {
  id: string;
  originalText: string;
  translatedText: string;
  x: number;
  y: number;
  // 基本樣式
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  // 進階樣式
  opacity: number;
  lineHeight: number;
  letterSpacing: number;
  // 文字效果
  textShadow: string;
  textStroke: string;
  textStrokeColor: string;
  // 排版
  rotation: number;
  maxWidth: number;
  // 區塊樣式
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  padding: number;
  zIndex: number;
}

// 模板區塊配置 (增強版)
interface TemplateBlock {
  id: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  opacity: number;
  lineHeight: number;
  letterSpacing: number;
  textShadow: string;
  textStroke: string;
  textStrokeColor: string;
  rotation: number;
  maxWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  padding: number;
  zIndex: number;
}

// 預設文字區塊樣式
const defaultBlockStyle: Omit<TextBlock, 'id' | 'originalText' | 'translatedText' | 'x' | 'y'> = {
  fontSize: 24,
  fontWeight: 'normal',
  fontFamily: 'system-ui, sans-serif',
  color: '#ffffff',
  textAlign: 'left',
  opacity: 1,
  lineHeight: 1.4,
  letterSpacing: 0,
  textShadow: 'none',
  textStroke: '0',
  textStrokeColor: '#000000',
  rotation: 0,
  maxWidth: 0,
  backgroundColor: 'transparent',
  backgroundOpacity: 0,
  borderRadius: 0,
  padding: 0,
  zIndex: 1,
};

// 歷史記錄類型
interface HistoryState {
  textBlocks: TextBlock[];
}

// 單張圖片項目
interface ImageItem {
  id: string;
  originalImage: string;
  ocrText: string;
  translatedText: string;
  textBlocks: TextBlock[];
  status: 'pending' | 'ocr' | 'translated' | 'ready';
  width: number;
  height: number;
}

// 畫布設定
interface CanvasSettings {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage: string | null;
}

type AppStep = 'upload' | 'processing' | 'template' | 'preview';

function App() {
  // 多圖狀態
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [step, setStep] = useState<AppStep>('upload');

  // 模板 (從第一張圖建立)
  const [, setTemplate] = useState<TemplateBlock[]>([]);

  // 處理狀態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // 編輯器狀態
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    backgroundImage: null,
  });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 圖片拖曳排序狀態
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);

  // 歷史記錄 (Undo/Redo)
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  // 對齊輔助線
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  // 剪貼簿 (複製區塊)
  const [clipboard, setClipboard] = useState<TextBlock | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // localStorage 自動存檔 key
  const STORAGE_KEY = 'pastev_session';

  // 從 localStorage 恢復狀態
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.images?.length > 0) {
          setImages(data.images);
          setCurrentImageIndex(data.currentImageIndex || 0);
          setStep(data.step || 'upload');
          if (data.canvasSettings) setCanvasSettings(data.canvasSettings);
          console.log('已從 localStorage 恢復進度');
        }
      }
    } catch (e) {
      console.error('恢復進度失敗:', e);
    }
  }, []);

  // 自動存檔到 localStorage
  useEffect(() => {
    if (images.length > 0) {
      try {
        const data = {
          images,
          currentImageIndex,
          step,
          canvasSettings,
          savedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.error('存檔失敗:', e);
      }
    }
  }, [images, currentImageIndex, step, canvasSettings]);

  // 當前圖片
  const currentImage = images[currentImageIndex];

  // 儲存歷史記錄
  const saveHistory = useCallback((textBlocks: TextBlock[]) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ textBlocks: JSON.parse(JSON.stringify(textBlocks)) });
      // 限制歷史記錄數量
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoAction.current = true;
    const prevState = history[historyIndex - 1];
    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex ? { ...img, textBlocks: prevState.textBlocks } : img
    ));
    setHistoryIndex(prev => prev - 1);
  }, [historyIndex, history, currentImageIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoAction.current = true;
    const nextState = history[historyIndex + 1];
    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex ? { ...img, textBlocks: nextState.textBlocks } : img
    ));
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex, history, currentImageIndex]);

  // 複製區塊
  const copyBlock = useCallback(() => {
    if (!selectedBlockId || !currentImage) return;
    const block = currentImage.textBlocks.find(b => b.id === selectedBlockId);
    if (block) setClipboard({ ...block });
  }, [selectedBlockId, currentImage]);

  // 貼上區塊
  const pasteBlock = useCallback(() => {
    if (!clipboard) return;
    const newBlock: TextBlock = {
      ...clipboard,
      id: `block-${Date.now()}`,
      x: clipboard.x + 20,
      y: clipboard.y + 20,
    };
    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex
        ? { ...img, textBlocks: [...img.textBlocks, newBlock] }
        : img
    ));
    setSelectedBlockId(newBlock.id);
  }, [clipboard, currentImageIndex]);

  // 計算對齊輔助線
  const calculateAlignmentGuides = useCallback((movingBlock: TextBlock, allBlocks: TextBlock[]) => {
    const threshold = 5;
    let guideX: number | null = null;
    let guideY: number | null = null;

    const centerX = movingBlock.x;
    const centerY = movingBlock.y;

    // 畫布中心對齊
    if (Math.abs(centerX - canvasSettings.width / 2) < threshold) {
      guideX = canvasSettings.width / 2;
    }
    if (Math.abs(centerY - canvasSettings.height / 2) < threshold) {
      guideY = canvasSettings.height / 2;
    }

    // 其他區塊對齊
    allBlocks.forEach(block => {
      if (block.id === movingBlock.id) return;
      if (Math.abs(block.x - centerX) < threshold) guideX = block.x;
      if (Math.abs(block.y - centerY) < threshold) guideY = block.y;
    });

    setAlignmentGuides({ x: guideX, y: guideY });
    return { x: guideX, y: guideY };
  }, [canvasSettings]);

  // 鍵盤快捷鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在輸入文字，不處理快捷鍵
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        redo();
      }
      // Copy: Ctrl+C
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        copyBlock();
      }
      // Paste: Ctrl+V
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        pasteBlock();
      }
      // Delete: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
        e.preventDefault();
        deleteBlock(selectedBlockId);
      }
      // Arrow keys: 微調位置
      if (selectedBlockId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const updates: Partial<TextBlock> = {};
        if (e.key === 'ArrowUp') updates.y = -step;
        if (e.key === 'ArrowDown') updates.y = step;
        if (e.key === 'ArrowLeft') updates.x = -step;
        if (e.key === 'ArrowRight') updates.x = step;

        setImages(prev => prev.map((img, idx) =>
          idx === currentImageIndex
            ? {
                ...img,
                textBlocks: img.textBlocks.map(b =>
                  b.id === selectedBlockId
                    ? { ...b, x: b.x + (updates.x || 0), y: b.y + (updates.y || 0) }
                    : b
                )
              }
            : img
        ));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copyBlock, pasteBlock, selectedBlockId, currentImageIndex]);

  // 多圖上傳
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages: ImageItem[] = [];
    let loadedCount = 0;

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;

        const img = new Image();
        img.onload = () => {
          newImages[index] = {
            id: `img-${Date.now()}-${index}`,
            originalImage: base64,
            ocrText: '',
            translatedText: '',
            textBlocks: [],
            status: 'pending',
            width: img.width,
            height: img.height,
          };

          loadedCount++;
          if (loadedCount === files.length) {
            // 按原始順序排列
            const sortedImages = newImages.filter(Boolean);
            setImages(sortedImages);
            setCurrentImageIndex(0);

            // 設定畫布尺寸為第一張圖的尺寸
            if (sortedImages[0]) {
              setCanvasSettings(prev => ({
                ...prev,
                width: sortedImages[0].width,
                height: sortedImages[0].height,
              }));
            }

            setStep('processing');
            setError(null);
          }
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // 批次 OCR
  const runBatchOcr = async () => {
    setLoading(true);
    setError(null);

    try {
      for (let i = 0; i < images.length; i++) {
        setProcessingStatus(`OCR 處理中... (${i + 1}/${images.length})`);

        const response = await fetch(`${API_BASE}/ocr/base64`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: images[i].originalImage })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'OCR failed');

        setImages(prev => prev.map((img, idx) =>
          idx === i ? { ...img, ocrText: data.fullText.trim(), status: 'ocr' } : img
        ));
      }

      setProcessingStatus('OCR 完成！');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setLoading(false);
    }
  };

  // 批次翻譯 (優化: 一次性發送所有文字)
  const runBatchTranslate = async () => {
    setLoading(true);
    setError(null);

    try {
      // 收集所有需要翻譯的文字和對應索引
      const textsToTranslate: { index: number; text: string }[] = [];
      images.forEach((img, idx) => {
        if (img.ocrText) {
          textsToTranslate.push({ index: idx, text: img.ocrText });
        }
      });

      if (textsToTranslate.length === 0) {
        setProcessingStatus('沒有需要翻譯的文字');
        return;
      }

      setProcessingStatus(`翻譯中... (${textsToTranslate.length} 段文字)`);

      // 一次性發送所有文字
      const response = await fetch(`${API_BASE}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: textsToTranslate.map(t => t.text),
          sourceLang: 'en',
          targetLang: 'zh'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Translation failed');

      // 一次性更新所有翻譯結果
      setImages(prev => {
        const updated = [...prev];
        textsToTranslate.forEach((item, i) => {
          updated[item.index] = {
            ...updated[item.index],
            translatedText: data.translations[i] || updated[item.index].ocrText,
            status: 'translated'
          };
        });
        return updated;
      });

      const timing = data.timing ? ` (${data.timing}ms)` : '';
      setProcessingStatus(`翻譯完成！${timing}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  };

  // 進入模板設定 (第一張圖)
  const startTemplateSetup = () => {
    if (images.length === 0) return;

    const firstImage = images[0];
    const initialBlock: TextBlock = {
      id: 'block-1',
      originalText: firstImage.ocrText,
      translatedText: firstImage.translatedText,
      x: 50,
      y: 50,
      ...defaultBlockStyle,
    };

    setImages(prev => prev.map((img, idx) =>
      idx === 0 ? { ...img, textBlocks: [initialBlock], status: 'ready' } : img
    ));
    setSelectedBlockId('block-1');
    setCurrentImageIndex(0);
    setStep('template');
  };

  // 確認模板，套用到其他圖片
  const confirmTemplate = () => {
    const firstImage = images[0];
    if (!firstImage || firstImage.textBlocks.length === 0) return;

    // 從第一張圖提取完整模板配置
    const templateBlocks: TemplateBlock[] = firstImage.textBlocks.map(block => ({
      id: block.id,
      x: block.x,
      y: block.y,
      fontSize: block.fontSize,
      fontWeight: block.fontWeight,
      fontFamily: block.fontFamily,
      color: block.color,
      textAlign: block.textAlign,
      opacity: block.opacity,
      lineHeight: block.lineHeight,
      letterSpacing: block.letterSpacing,
      textShadow: block.textShadow,
      textStroke: block.textStroke,
      textStrokeColor: block.textStrokeColor,
      rotation: block.rotation,
      maxWidth: block.maxWidth,
      backgroundColor: block.backgroundColor,
      backgroundOpacity: block.backgroundOpacity,
      borderRadius: block.borderRadius,
      padding: block.padding,
      zIndex: block.zIndex,
    }));
    setTemplate(templateBlocks);

    // 套用模板到其他圖片
    setImages(prev => prev.map((img, idx) => {
      if (idx === 0) return img; // 第一張已設定

      // 將模板配置套用到此圖片的文字
      const newBlocks: TextBlock[] = templateBlocks.map((tmpl) => ({
        ...tmpl,
        originalText: img.ocrText,
        translatedText: img.translatedText,
      }));

      return { ...img, textBlocks: newBlocks, status: 'ready' };
    }));

    setStep('preview');
  };

  // 新增文字區塊
  const addTextBlock = () => {
    const newBlock: TextBlock = {
      id: `block-${Date.now()}`,
      originalText: '',
      translatedText: '新文字',
      x: 100,
      y: 100,
      ...defaultBlockStyle,
    };

    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex
        ? { ...img, textBlocks: [...img.textBlocks, newBlock] }
        : img
    ));
    setSelectedBlockId(newBlock.id);
  };

  // 更新文字區塊
  const updateBlock = (id: string, updates: Partial<TextBlock>) => {
    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex
        ? { ...img, textBlocks: img.textBlocks.map(b => b.id === id ? { ...b, ...updates } : b) }
        : img
    ));
  };

  // 刪除文字區塊
  const deleteBlock = (id: string) => {
    setImages(prev => prev.map((img, idx) =>
      idx === currentImageIndex
        ? { ...img, textBlocks: img.textBlocks.filter(b => b.id !== id) }
        : img
    ));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  // 拖曳處理
  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    const block = currentImage?.textBlocks.find(b => b.id === blockId);
    if (!block) return;

    setSelectedBlockId(blockId);
    setIsDragging(true);

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedBlockId || !canvasRef.current || !currentImage) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
    const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);

    // 計算對齊輔助線
    const movingBlock = { ...currentImage.textBlocks.find(b => b.id === selectedBlockId)!, x: newX, y: newY };
    const guides = calculateAlignmentGuides(movingBlock, currentImage.textBlocks);

    // 吸附到輔助線
    const snappedX = guides.x !== null ? guides.x : newX;
    const snappedY = guides.y !== null ? guides.y : newY;

    updateBlock(selectedBlockId, {
      x: snappedX,
      y: snappedY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setAlignmentGuides({ x: null, y: null });
  };

  // 輸出單張圖片
  const exportSingleImage = async () => {
    if (!canvasRef.current) return;

    setLoading(true);
    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: canvasSettings.backgroundColor,
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `pastev-${currentImageIndex + 1}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setError('Export failed');
    } finally {
      setLoading(false);
    }
  };

  // 批次輸出所有圖片
  const exportAllImages = async () => {
    setLoading(true);
    setError(null);

    try {
      for (let i = 0; i < images.length; i++) {
        setProcessingStatus(`輸出中... (${i + 1}/${images.length})`);
        setCurrentImageIndex(i);

        // 等待 React 更新畫布
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!canvasRef.current) continue;

        const canvas = await html2canvas(canvasRef.current, {
          backgroundColor: canvasSettings.backgroundColor,
          scale: 2,
        });

        const link = document.createElement('a');
        link.download = `pastev-${i + 1}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // 間隔避免瀏覽器阻擋
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setProcessingStatus('全部輸出完成！');
    } catch (err) {
      setError('Export failed');
    } finally {
      setLoading(false);
    }
  };

  // 重置
  const reset = () => {
    setStep('upload');
    setImages([]);
    setCurrentImageIndex(0);
    setTemplate([]);
    setSelectedBlockId(null);
    setProcessingStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    // 清除 localStorage 存檔
    localStorage.removeItem(STORAGE_KEY);
  };

  // 圖片拖曳排序
  const handleImageDragStart = (e: React.DragEvent, index: number) => {
    setDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) return;

    // 重新排序
    setImages(prev => {
      const newImages = [...prev];
      const draggedItem = newImages[draggedImageIndex];
      newImages.splice(draggedImageIndex, 1);
      newImages.splice(index, 0, draggedItem);
      return newImages;
    });

    // 更新當前選擇的索引
    if (currentImageIndex === draggedImageIndex) {
      setCurrentImageIndex(index);
    } else if (
      draggedImageIndex < currentImageIndex && index >= currentImageIndex
    ) {
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (
      draggedImageIndex > currentImageIndex && index <= currentImageIndex
    ) {
      setCurrentImageIndex(currentImageIndex + 1);
    }

    setDraggedImageIndex(index);
  };

  const handleImageDragEnd = () => {
    setDraggedImageIndex(null);
  };

  const selectedBlock = currentImage?.textBlocks.find(b => b.id === selectedBlockId);

  return (
    <div className="app">
      <header className="header">
        <h1>PasteV</h1>
        <p>圖片文案翻譯還原工具 {images.length > 0 && `(${images.length} 張圖片)`}</p>
      </header>

      {error && (
        <div className="error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <main className="main">
        {/* Step 1: 多圖上傳 */}
        {step === 'upload' && (
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
            <p className="upload-hint">支援多張圖片，第一張設定模板後自動套用</p>
          </div>
        )}

        {/* Step 2: 批次處理 OCR & 翻譯 */}
        {step === 'processing' && (
          <div className="processing-step">
            <div className="image-thumbnails">
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  className={`thumbnail ${idx === currentImageIndex ? 'active' : ''} ${draggedImageIndex === idx ? 'dragging' : ''}`}
                  onClick={() => setCurrentImageIndex(idx)}
                  draggable
                  onDragStart={(e) => handleImageDragStart(e, idx)}
                  onDragOver={(e) => handleImageDragOver(e, idx)}
                  onDragEnd={handleImageDragEnd}
                >
                  <img src={img.originalImage} alt={`圖 ${idx + 1}`} draggable={false} />
                  <span className="thumbnail-index">{idx + 1}</span>
                  <span className={`thumbnail-status status-${img.status}`}>
                    {img.status === 'pending' && '待處理'}
                    {img.status === 'ocr' && 'OCR完成'}
                    {img.status === 'translated' && '已翻譯'}
                    {img.status === 'ready' && '就緒'}
                  </span>
                </div>
              ))}
            </div>

            <div className="processing-panel">
              <div className="preview-large">
                {currentImage && (
                  <img src={currentImage.originalImage} alt="Preview" />
                )}
              </div>

              <div className="processing-controls">
                <h3>批次處理</h3>

                {processingStatus && (
                  <div className="processing-status">{processingStatus}</div>
                )}

                <div className="text-preview">
                  <div className="text-box">
                    <label>OCR 文字</label>
                    <textarea
                      value={currentImage?.ocrText || ''}
                      onChange={(e) => setImages(prev => prev.map((img, idx) =>
                        idx === currentImageIndex ? { ...img, ocrText: e.target.value } : img
                      ))}
                      placeholder="OCR 識別的文字..."
                      rows={4}
                    />
                  </div>
                  <div className="text-box">
                    <label>翻譯結果</label>
                    <textarea
                      value={currentImage?.translatedText || ''}
                      onChange={(e) => setImages(prev => prev.map((img, idx) =>
                        idx === currentImageIndex ? { ...img, translatedText: e.target.value } : img
                      ))}
                      placeholder="翻譯後的文字..."
                      rows={4}
                    />
                  </div>
                </div>

                <div className="processing-actions">
                  <button onClick={runBatchOcr} className="btn primary" disabled={loading}>
                    {loading ? '處理中...' : `批次 OCR (${images.length} 張)`}
                  </button>
                  <button
                    onClick={runBatchTranslate}
                    className="btn primary"
                    disabled={loading || !images.some(img => img.ocrText)}
                  >
                    {loading ? '處理中...' : `批次翻譯`}
                  </button>
                </div>

                <div className="processing-actions">
                  <button onClick={reset} className="btn secondary">重新上傳</button>
                  <button
                    onClick={startTemplateSetup}
                    className="btn primary"
                    disabled={!images.some(img => img.translatedText)}
                  >
                    設定模板排版
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 模板設定 (第一張圖) */}
        {step === 'template' && currentImage && (
          <div className="editor-layout">
            <div className="reference-panel">
              <h3>原圖參考 (第 1 張)</h3>
              <img src={currentImage.originalImage} alt="Reference" className="reference-img" />
              <p className="template-hint">調整此圖的文字位置，將自動套用到其他圖片</p>
            </div>

            <div className="canvas-wrapper">
              <div
                ref={canvasRef}
                className="design-canvas"
                style={{
                  width: canvasSettings.width,
                  height: canvasSettings.height,
                  backgroundColor: canvasSettings.backgroundColor,
                  backgroundImage: canvasSettings.backgroundImage
                    ? `url(${canvasSettings.backgroundImage})`
                    : 'none',
                  backgroundSize: 'cover',
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* 對齊輔助線 */}
                {alignmentGuides.x !== null && (
                  <div className="alignment-guide vertical" style={{ left: alignmentGuides.x }} />
                )}
                {alignmentGuides.y !== null && (
                  <div className="alignment-guide horizontal" style={{ top: alignmentGuides.y }} />
                )}

                {currentImage.textBlocks.map(block => (
                  <div
                    key={block.id}
                    className={`text-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                    style={{
                      left: block.x,
                      top: block.y,
                      fontSize: block.fontSize,
                      fontWeight: block.fontWeight,
                      fontFamily: block.fontFamily,
                      color: block.color,
                      textAlign: block.textAlign,
                      opacity: block.opacity,
                      lineHeight: block.lineHeight,
                      letterSpacing: `${block.letterSpacing}px`,
                      textShadow: block.textShadow,
                      WebkitTextStroke: block.textStroke !== '0' ? `${block.textStroke}px ${block.textStrokeColor}` : 'none',
                      transform: block.rotation !== 0 ? `rotate(${block.rotation}deg)` : 'none',
                      maxWidth: block.maxWidth > 0 ? block.maxWidth : 'none',
                      backgroundColor: block.backgroundOpacity > 0 ? block.backgroundColor : 'transparent',
                      borderRadius: block.borderRadius,
                      padding: block.padding,
                      zIndex: block.zIndex,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, block.id)}
                  >
                    {block.translatedText}
                  </div>
                ))}
              </div>
            </div>

            <div className="controls-panel">
              <h3>模板設定</h3>

              {/* 快捷鍵提示 */}
              <div className="shortcuts-hint">
                <small>
                  Ctrl+Z 撤銷 | Ctrl+Y 重做 | Ctrl+C/V 複製貼上 | 方向鍵微調
                </small>
              </div>

              <div className="control-group">
                <label>畫布設定</label>
                <div className="input-row">
                  <input
                    type="number"
                    value={canvasSettings.width}
                    onChange={(e) => setCanvasSettings(prev => ({ ...prev, width: parseInt(e.target.value) || 800 }))}
                    placeholder="寬"
                  />
                  <span>x</span>
                  <input
                    type="number"
                    value={canvasSettings.height}
                    onChange={(e) => setCanvasSettings(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                    placeholder="高"
                  />
                </div>
                <div className="input-row">
                  <label>背景色</label>
                  <input
                    type="color"
                    value={canvasSettings.backgroundColor}
                    onChange={(e) => setCanvasSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                  />
                </div>
              </div>

              <button onClick={addTextBlock} className="btn secondary full-width">
                + 新增文字區塊
              </button>

              {selectedBlock && (
                <div className="control-group enhanced-controls">
                  {/* 基本設定 */}
                  <div className="control-section">
                    <h4>文字內容</h4>
                    <textarea
                      value={selectedBlock.translatedText}
                      onChange={(e) => updateBlock(selectedBlock.id, { translatedText: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* 字體設定 */}
                  <div className="control-section">
                    <h4>字體設定</h4>
                    <div className="input-row">
                      <label>字體</label>
                      <select
                        value={selectedBlock.fontFamily}
                        onChange={(e) => updateBlock(selectedBlock.id, { fontFamily: e.target.value })}
                      >
                        {FONT_OPTIONS.map(font => (
                          <option key={font.value} value={font.value}>{font.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="input-row">
                      <label>大小</label>
                      <input
                        type="number"
                        value={selectedBlock.fontSize}
                        onChange={(e) => updateBlock(selectedBlock.id, { fontSize: parseInt(e.target.value) || 16 })}
                        min="8"
                        max="200"
                      />
                    </div>
                    <div className="input-row">
                      <label>粗細</label>
                      <select
                        value={selectedBlock.fontWeight}
                        onChange={(e) => updateBlock(selectedBlock.id, { fontWeight: e.target.value })}
                      >
                        <option value="normal">正常</option>
                        <option value="bold">粗體</option>
                        <option value="100">100</option>
                        <option value="300">300</option>
                        <option value="500">500</option>
                        <option value="700">700</option>
                        <option value="900">900</option>
                      </select>
                    </div>
                    <div className="input-row">
                      <label>顏色</label>
                      <input
                        type="color"
                        value={selectedBlock.color}
                        onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
                      />
                    </div>
                    <div className="input-row">
                      <label>對齊</label>
                      <select
                        value={selectedBlock.textAlign}
                        onChange={(e) => updateBlock(selectedBlock.id, { textAlign: e.target.value as 'left' | 'center' | 'right' })}
                      >
                        <option value="left">靠左</option>
                        <option value="center">置中</option>
                        <option value="right">靠右</option>
                      </select>
                    </div>
                  </div>

                  {/* 進階樣式 */}
                  <div className="control-section">
                    <h4>進階樣式</h4>
                    <div className="input-row">
                      <label>透明度</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={selectedBlock.opacity}
                        onChange={(e) => updateBlock(selectedBlock.id, { opacity: parseFloat(e.target.value) })}
                      />
                      <span>{Math.round(selectedBlock.opacity * 100)}%</span>
                    </div>
                    <div className="input-row">
                      <label>行高</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="3"
                        value={selectedBlock.lineHeight}
                        onChange={(e) => updateBlock(selectedBlock.id, { lineHeight: parseFloat(e.target.value) || 1.4 })}
                      />
                    </div>
                    <div className="input-row">
                      <label>字距</label>
                      <input
                        type="number"
                        step="0.5"
                        min="-5"
                        max="20"
                        value={selectedBlock.letterSpacing}
                        onChange={(e) => updateBlock(selectedBlock.id, { letterSpacing: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  {/* 文字效果 */}
                  <div className="control-section">
                    <h4>文字效果</h4>
                    <div className="input-row">
                      <label>陰影</label>
                      <select
                        value={selectedBlock.textShadow}
                        onChange={(e) => updateBlock(selectedBlock.id, { textShadow: e.target.value })}
                      >
                        <option value="none">無</option>
                        <option value="1px 1px 2px rgba(0,0,0,0.5)">淺陰影</option>
                        <option value="2px 2px 4px rgba(0,0,0,0.7)">中陰影</option>
                        <option value="3px 3px 6px rgba(0,0,0,0.9)">深陰影</option>
                        <option value="0 0 10px rgba(255,255,255,0.8)">發光</option>
                      </select>
                    </div>
                    <div className="input-row">
                      <label>描邊</label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.5"
                        value={selectedBlock.textStroke}
                        onChange={(e) => updateBlock(selectedBlock.id, { textStroke: e.target.value })}
                      />
                      <input
                        type="color"
                        value={selectedBlock.textStrokeColor}
                        onChange={(e) => updateBlock(selectedBlock.id, { textStrokeColor: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 排版 */}
                  <div className="control-section">
                    <h4>排版</h4>
                    <div className="input-row">
                      <label>旋轉</label>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={selectedBlock.rotation}
                        onChange={(e) => updateBlock(selectedBlock.id, { rotation: parseInt(e.target.value) })}
                      />
                      <span>{selectedBlock.rotation}°</span>
                    </div>
                    <div className="input-row">
                      <label>最大寬度</label>
                      <input
                        type="number"
                        min="0"
                        max="2000"
                        value={selectedBlock.maxWidth}
                        onChange={(e) => updateBlock(selectedBlock.id, { maxWidth: parseInt(e.target.value) || 0 })}
                      />
                      <small>(0=無限)</small>
                    </div>
                    <div className="input-row">
                      <label>位置 X</label>
                      <input
                        type="number"
                        value={Math.round(selectedBlock.x)}
                        onChange={(e) => updateBlock(selectedBlock.id, { x: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="input-row">
                      <label>位置 Y</label>
                      <input
                        type="number"
                        value={Math.round(selectedBlock.y)}
                        onChange={(e) => updateBlock(selectedBlock.id, { y: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  {/* 區塊樣式 */}
                  <div className="control-section">
                    <h4>區塊樣式</h4>
                    <div className="input-row">
                      <label>背景色</label>
                      <input
                        type="color"
                        value={selectedBlock.backgroundColor === 'transparent' ? '#000000' : selectedBlock.backgroundColor}
                        onChange={(e) => updateBlock(selectedBlock.id, { backgroundColor: e.target.value })}
                      />
                    </div>
                    <div className="input-row">
                      <label>背景透明度</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={selectedBlock.backgroundOpacity}
                        onChange={(e) => updateBlock(selectedBlock.id, { backgroundOpacity: parseFloat(e.target.value) })}
                      />
                      <span>{Math.round(selectedBlock.backgroundOpacity * 100)}%</span>
                    </div>
                    <div className="input-row">
                      <label>圓角</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={selectedBlock.borderRadius}
                        onChange={(e) => updateBlock(selectedBlock.id, { borderRadius: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="input-row">
                      <label>內距</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={selectedBlock.padding}
                        onChange={(e) => updateBlock(selectedBlock.id, { padding: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="input-row">
                      <label>圖層</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={selectedBlock.zIndex}
                        onChange={(e) => updateBlock(selectedBlock.id, { zIndex: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>

                  {/* 操作按鈕 */}
                  <div className="control-section">
                    <button onClick={copyBlock} className="btn secondary full-width">
                      複製區塊 (Ctrl+C)
                    </button>
                    <button
                      onClick={() => deleteBlock(selectedBlock.id)}
                      className="btn danger full-width"
                    >
                      刪除此區塊
                    </button>
                  </div>
                </div>
              )}

              <div className="export-actions">
                <button onClick={reset} className="btn secondary">重新開始</button>
                <button onClick={confirmTemplate} className="btn primary">
                  確認模板 →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: 預覽 & 批次輸出 */}
        {step === 'preview' && currentImage && (
          <div className="preview-step">
            <div className="image-nav">
              <div className="image-thumbnails horizontal">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className={`thumbnail ${idx === currentImageIndex ? 'active' : ''} ${draggedImageIndex === idx ? 'dragging' : ''}`}
                    onClick={() => setCurrentImageIndex(idx)}
                    draggable
                    onDragStart={(e) => handleImageDragStart(e, idx)}
                    onDragOver={(e) => handleImageDragOver(e, idx)}
                    onDragEnd={handleImageDragEnd}
                  >
                    <img src={img.originalImage} alt={`圖 ${idx + 1}`} draggable={false} />
                    <span className="thumbnail-index">{idx + 1}</span>
                  </div>
                ))}
              </div>
              <div className="nav-buttons">
                <button
                  onClick={() => setCurrentImageIndex(i => Math.max(0, i - 1))}
                  disabled={currentImageIndex === 0}
                  className="btn secondary"
                >
                  ← 上一張
                </button>
                <span>{currentImageIndex + 1} / {images.length}</span>
                <button
                  onClick={() => setCurrentImageIndex(i => Math.min(images.length - 1, i + 1))}
                  disabled={currentImageIndex === images.length - 1}
                  className="btn secondary"
                >
                  下一張 →
                </button>
              </div>
            </div>

            <div className="preview-main">
              <div className="canvas-wrapper">
                <div
                  ref={canvasRef}
                  className="design-canvas"
                  style={{
                    width: canvasSettings.width,
                    height: canvasSettings.height,
                    backgroundColor: canvasSettings.backgroundColor,
                    backgroundImage: canvasSettings.backgroundImage
                      ? `url(${canvasSettings.backgroundImage})`
                      : 'none',
                    backgroundSize: 'cover',
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {currentImage.textBlocks.map(block => (
                    <div
                      key={block.id}
                      className={`text-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                      style={{
                        left: block.x,
                        top: block.y,
                        fontSize: block.fontSize,
                        fontWeight: block.fontWeight,
                        fontFamily: block.fontFamily,
                        color: block.color,
                        textAlign: block.textAlign,
                        opacity: block.opacity,
                        lineHeight: block.lineHeight,
                        letterSpacing: `${block.letterSpacing}px`,
                        textShadow: block.textShadow,
                        WebkitTextStroke: block.textStroke !== '0' ? `${block.textStroke}px ${block.textStrokeColor}` : 'none',
                        transform: block.rotation !== 0 ? `rotate(${block.rotation}deg)` : 'none',
                        maxWidth: block.maxWidth > 0 ? block.maxWidth : 'none',
                        backgroundColor: block.backgroundOpacity > 0 ? block.backgroundColor : 'transparent',
                        borderRadius: block.borderRadius,
                        padding: block.padding,
                        zIndex: block.zIndex,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, block.id)}
                    >
                      {block.translatedText}
                    </div>
                  ))}
                </div>
              </div>

              <div className="preview-controls">
                <h3>圖 {currentImageIndex + 1} 文字編輯</h3>

                {currentImage.textBlocks.map((block, idx) => (
                  <div key={block.id} className="control-group" onClick={() => setSelectedBlockId(block.id)}>
                    <label style={{ cursor: 'pointer' }}>區塊 {idx + 1} {selectedBlockId === block.id ? '✓' : ''}</label>
                    <textarea
                      value={block.translatedText}
                      onChange={(e) => updateBlock(block.id, { translatedText: e.target.value })}
                      rows={2}
                    />
                  </div>
                ))}

                {processingStatus && (
                  <div className="processing-status">{processingStatus}</div>
                )}

                <div className="export-actions">
                  <button onClick={() => setStep('template')} className="btn secondary">
                    修改模板
                  </button>
                  <button onClick={exportSingleImage} className="btn secondary" disabled={loading}>
                    輸出此張
                  </button>
                  <button onClick={exportAllImages} className="btn primary" disabled={loading}>
                    {loading ? '輸出中...' : `輸出全部 (${images.length} 張)`}
                  </button>
                </div>

                <button onClick={reset} className="btn secondary full-width">
                  重新開始
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{processingStatus || '處理中...'}</p>
        </div>
      )}
    </div>
  );
}

export default App;
