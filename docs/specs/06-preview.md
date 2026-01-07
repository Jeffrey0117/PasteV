# 06 - 預覽與輸出

## 概述

即時預覽套用模板後的效果，並支援單張或批次 ZIP 輸出。

## 依賴

- `01-data-structures.md` - 型別定義
- `02-field-ui.md` - FieldTemplate 樣式
- `03-table-ui.md` - 翻譯內容

## 輸出檔案

```
client/src/components/Preview/
├── Preview.tsx          # 主元件
├── Preview.css          # 樣式
├── CanvasRenderer.tsx   # 畫布渲染
└── ExportButton.tsx     # 輸出按鈕
```

---

## UI 設計

```
┌─────────────────────────────────────────────────────────────────┐
│ 預覽輸出                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ← 上一張    ○ ○ ● ○ ○    下一張 →         [1 / 5]          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌───────────────────────────────────┬─────────────────────────┐│
│  │                                   │                         ││
│  │                                   │  原圖                   ││
│  │     ┌─────────────────────┐       │  ┌─────────────────┐   ││
│  │     │     電腦科學        │       │  │ [縮圖]          │   ││
│  │     │     年薪 $166k      │       │  └─────────────────┘   ││
│  │     └─────────────────────┘       │                         ││
│  │                                   │  ─────────────────────  ││
│  │     此儲存庫包含一條通往          │  欄位預覽               ││
│  │     免費自學電腦科學教育的路徑     │                         ││
│  │                                   │  標題: 電腦科學         ││
│  │                                   │  副標題: 年薪 $166k    ││
│  │     (預覽畫布)                    │  內文: 此儲存庫...      ││
│  │                                   │                         ││
│  └───────────────────────────────────┴─────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [← 返回編輯]        [輸出此張]      [輸出全部 ZIP]          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 元件規格

### Preview (主元件)

```typescript
interface PreviewProps {
  /** 所有圖片 */
  images: ImageData[];

  /** 欄位模板 */
  fields: FieldTemplate[];

  /** 畫布設定 */
  canvasSettings: CanvasSettings;

  /** 當前圖片索引 */
  currentIndex: number;

  /** 切換圖片 */
  onIndexChange: (index: number) => void;

  /** 返回編輯 */
  onBack: () => void;
}
```

### CanvasRenderer (畫布渲染)

```typescript
interface CanvasRendererProps {
  /** 圖片資料 */
  image: ImageData;

  /** 欄位模板 */
  fields: FieldTemplate[];

  /** 畫布設定 */
  canvasSettings: CanvasSettings;

  /** ref 供輸出使用 */
  canvasRef: React.RefObject<HTMLDivElement>;
}
```

### ExportButton (輸出按鈕)

```typescript
interface ExportButtonProps {
  /** 輸出類型 */
  type: 'single' | 'all';

  /** 點擊回調 */
  onClick: () => void;

  /** 載入中 */
  loading?: boolean;

  /** 圖片數量 (all 模式) */
  count?: number;
}
```

---

## 畫布渲染邏輯

```typescript
const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  image,
  fields,
  canvasSettings,
  canvasRef,
}) => {
  return (
    <div
      ref={canvasRef}
      className="preview-canvas"
      style={{
        width: canvasSettings.width,
        height: canvasSettings.height,
        backgroundColor: canvasSettings.backgroundColor,
        position: 'relative',
      }}
    >
      {fields.map(field => {
        const content = image.fields[field.id];
        if (!content?.translated) return null;

        return (
          <div
            key={field.id}
            className="preview-field"
            style={{
              position: 'absolute',
              left: field.x,
              top: field.y,
              width: field.width,
              fontSize: field.fontSize,
              fontWeight: field.fontWeight,
              color: field.color,
              textAlign: field.textAlign,
              lineHeight: field.lineHeight || 1.4,
              fontFamily: field.fontFamily || '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
            }}
          >
            {content.translated}
          </div>
        );
      })}
    </div>
  );
};
```

---

## 輸出功能

### 單張輸出

```typescript
const exportSingle = async () => {
  if (!canvasRef.current) return;

  setExporting(true);

  try {
    const canvas = await html2canvas(canvasRef.current, {
      backgroundColor: canvasSettings.backgroundColor,
      scale: 2,  // 2x 解析度
      useCORS: true,
    });

    const link = document.createElement('a');
    link.download = `pastev-${currentIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

  } catch (error) {
    console.error('Export failed:', error);
    // 顯示錯誤 toast
  } finally {
    setExporting(false);
  }
};
```

### 批次輸出 ZIP

```typescript
import JSZip from 'jszip';

const exportAll = async () => {
  setExporting(true);
  setExportProgress(0);

  try {
    const zip = new JSZip();
    const folder = zip.folder('pastev-export');

    for (let i = 0; i < images.length; i++) {
      // 更新進度
      setExportProgress(Math.round((i / images.length) * 100));

      // 切換到該圖片
      setCurrentIndex(i);

      // 等待渲染
      await new Promise(resolve => setTimeout(resolve, 100));

      // 擷取畫布
      const canvas = await html2canvas(canvasRef.current!, {
        backgroundColor: canvasSettings.backgroundColor,
        scale: 2,
      });

      // 轉換為 blob
      const blob = await new Promise<Blob>(resolve => {
        canvas.toBlob(blob => resolve(blob!), 'image/png');
      });

      // 加入 ZIP
      folder?.file(`image-${String(i + 1).padStart(2, '0')}.png`, blob);
    }

    // 產生 ZIP
    setExportProgress(100);
    const content = await zip.generateAsync({ type: 'blob' });

    // 下載
    const link = document.createElement('a');
    link.download = `pastev-export-${Date.now()}.zip`;
    link.href = URL.createObjectURL(content);
    link.click();

    // 清理
    URL.revokeObjectURL(link.href);

  } catch (error) {
    console.error('Export all failed:', error);
  } finally {
    setExporting(false);
    setExportProgress(0);
  }
};
```

---

## 圖片導航

### Dot Indicator

```typescript
const DotIndicator: React.FC<{
  total: number;
  current: number;
  onChange: (index: number) => void;
}> = ({ total, current, onChange }) => {
  return (
    <div className="dot-indicator">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          className={`dot ${i === current ? 'active' : ''}`}
          onClick={() => onChange(i)}
          aria-label={`Go to image ${i + 1}`}
        />
      ))}
    </div>
  );
};
```

### 鍵盤導航

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
        if (currentIndex > 0) onIndexChange(currentIndex - 1);
        break;
      case 'ArrowRight':
        if (currentIndex < images.length - 1) onIndexChange(currentIndex + 1);
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          exportSingle();
        }
        break;
      case 'S':
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
          e.preventDefault();
          exportAll();
        }
        break;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [currentIndex, images.length]);
```

---

## 樣式規格

```css
/* 預覽容器 */
.preview-container {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 1.5rem;
  height: calc(100vh - 200px);
}

/* 畫布區域 */
.canvas-area {
  background: var(--surface-alt);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 2rem;
}

.preview-canvas {
  box-shadow: var(--shadow-lg);
  border-radius: 4px;
}

/* Dot indicator */
.dot-indicator {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 12px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.dot:hover {
  background: var(--text-muted);
}

.dot.active {
  background: var(--primary);
  transform: scale(1.2);
}

/* 導航按鈕 */
.nav-arrow {
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.nav-arrow:hover:not(:disabled) {
  background: var(--surface-alt);
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 輸出按鈕 */
.export-btn {
  padding: 12px 24px;
  font-weight: 600;
}

.export-btn.primary {
  background: linear-gradient(135deg, var(--primary), #8b5cf6);
  color: white;
}

/* 進度條 */
.export-progress {
  background: var(--surface-alt);
  border-radius: 4px;
  height: 8px;
  overflow: hidden;
  margin-top: 12px;
}

.export-progress-bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}
```

---

## 安裝依賴

```bash
cd client
npm install jszip
npm install --save-dev @types/jszip
```

---

## 快捷鍵

| 按鍵 | 功能 |
|------|------|
| `←` | 上一張圖片 |
| `→` | 下一張圖片 |
| `Home` | 第一張 |
| `End` | 最後一張 |
| `Ctrl + S` | 輸出當前圖片 |
| `Ctrl + Shift + S` | 輸出全部 (ZIP) |

---

## 驗收清單

- [ ] 畫布正確渲染欄位內容
- [ ] 樣式正確套用 (位置、字體、顏色)
- [ ] 可切換圖片 (箭頭、dot、鍵盤)
- [ ] 單張輸出 PNG
- [ ] 批次輸出 ZIP
- [ ] 輸出進度顯示
- [ ] 2x 解析度輸出
- [ ] 鍵盤快捷鍵
- [ ] 響應式布局
- [ ] 中文字體正確顯示
