import { useState, useRef, useCallback, useEffect } from 'react';
import type { SlideContent } from './types';

interface PreviewStepProps {
  slides: SlideContent[];
  canvasSettings: {
    width: number;
    height: number;
    backgroundColor: string;
  };
}

/** Zoom 限制範圍 (參考 mini-canvas-editor: 0.01 ~ 20) */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

/**
 * Step 4: 預覽輸出
 * 顯示所有卡片，支援縮放、平移、下載
 */
export function PreviewStep({ slides, canvasSettings }: PreviewStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom/Pan 狀態
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const currentSlide = slides[currentIndex];

  // 重置 zoom/pan 當切換 slide
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentIndex]);

  // 滾輪縮放 (參考 mini-canvas-editor workspace.ts)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, []);

  // 開始拖曳平移
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只處理左鍵
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  // 拖曳中
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }, [isPanning, panStart]);

  // 結束拖曳
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom 控制按鈕
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP * 2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP * 2));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleZoomFit = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 48; // padding
    const containerHeight = containerRef.current.clientHeight - 100;
    const scaleX = containerWidth / canvasSettings.width;
    const scaleY = containerHeight / canvasSettings.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    setZoom(fitZoom);
    setPan({ x: 0, y: 0 });
  }, [canvasSettings]);

  // 渲染單張卡片到 Canvas
  const renderSlideToCanvas = useCallback(
    async (slide: SlideContent): Promise<string> => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasSettings.width;
      canvas.height = canvasSettings.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // 背景
      if (slide.suggestedImage?.url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = slide.suggestedImage!.url;
          });

          // 繪製背景圖片 (cover)
          const scale = Math.max(
            canvas.width / img.width,
            canvas.height / img.height
          );
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

          // 加上暗化層
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch {
          ctx.fillStyle = canvasSettings.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.fillStyle = canvasSettings.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 文字樣式
      const padding = 80;
      const maxWidth = canvas.width - padding * 2;

      // 標題
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(slide.title, canvas.width / 2, 180, maxWidth);

      // 副標題
      if (slide.subtitle) {
        ctx.font = '36px "Noto Sans TC", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillText(slide.subtitle, canvas.width / 2, 240, maxWidth);
      }

      // 內容
      ctx.font = '32px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      const lines = wrapText(ctx, slide.body, maxWidth);
      let y = 340;
      for (const line of lines.slice(0, 6)) {
        ctx.fillText(line, padding, y);
        y += 48;
      }

      // 要點
      if (slide.bulletPoints && slide.bulletPoints.length > 0) {
        y += 20;
        ctx.font = '28px "Noto Sans TC", sans-serif';
        for (const point of slide.bulletPoints.slice(0, 4)) {
          ctx.fillText(`• ${point}`, padding, y);
          y += 44;
        }
      }

      // 素材圖片 (Embedded images)
      if (slide.images && slide.images.length > 0) {
        const imgSize = 120;
        const imgGap = 16;
        const startX = padding;
        const imgY = canvas.height - padding - imgSize;

        for (let i = 0; i < Math.min(slide.images.length, 4); i++) {
          try {
            const embeddedImg = new Image();
            embeddedImg.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
              embeddedImg.onload = () => resolve();
              embeddedImg.onerror = reject;
              embeddedImg.src = slide.images![i].url;
            });

            const imgX = startX + i * (imgSize + imgGap);

            // 圓角矩形裁切
            ctx.save();
            ctx.beginPath();
            const radius = 8;
            ctx.roundRect(imgX, imgY, imgSize, imgSize, radius);
            ctx.clip();

            // 繪製圖片 (cover)
            const imgScale = Math.max(imgSize / embeddedImg.width, imgSize / embeddedImg.height);
            const drawW = embeddedImg.width * imgScale;
            const drawH = embeddedImg.height * imgScale;
            const drawX = imgX + (imgSize - drawW) / 2;
            const drawY = imgY + (imgSize - drawH) / 2;
            ctx.drawImage(embeddedImg, drawX, drawY, drawW, drawH);

            // 邊框
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          } catch {
            // 圖片載入失敗，跳過
          }
        }
      }

      // 圖片來源
      if (slide.suggestedImage?.author) {
        ctx.font = '20px "Noto Sans TC", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'right';
        ctx.fillText(
          `Photo by ${slide.suggestedImage.author} on Unsplash`,
          canvas.width - padding,
          canvas.height - 40
        );
      }

      return canvas.toDataURL('image/png');
    },
    [canvasSettings]
  );

  // 文字換行
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] => {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const para of paragraphs) {
      const words = para.split('');
      let currentLine = '';

      for (const char of words) {
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  };

  // 下載單張
  const handleDownloadSingle = useCallback(async () => {
    if (!currentSlide) return;
    const dataUrl = await renderSlideToCanvas(currentSlide);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `slide-${currentIndex + 1}.png`;
    a.click();
  }, [currentSlide, currentIndex, renderSlideToCanvas]);

  // 下載全部
  const handleDownloadAll = useCallback(async () => {
    for (let i = 0; i < slides.length; i++) {
      const dataUrl = await renderSlideToCanvas(slides[i]);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `slide-${i + 1}.png`;
      a.click();
      // 延遲避免瀏覽器阻擋
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [slides, renderSlideToCanvas]);

  return (
    <div className="preview-step">
      {/* 縮圖列表 */}
      <div className="preview-thumbnails">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`thumbnail-item ${currentIndex === index ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
          >
            <div className="thumbnail-index">{index + 1}</div>
            {slide.suggestedImage ? (
              <img src={slide.suggestedImage.thumbnailUrl} alt="" />
            ) : slide.images && slide.images.length > 0 ? (
              <img src={slide.images[0].thumbnailUrl} alt="" />
            ) : (
              <div className="thumbnail-placeholder">
                {slide.title.charAt(0) || '?'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Zoom 控制列 */}
      <div className="preview-zoom-controls">
        <button onClick={handleZoomOut} title="縮小">−</button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} title="放大">+</button>
        <button onClick={handleZoomReset} title="重置">1:1</button>
        <button onClick={handleZoomFit} title="適應視窗">適應</button>
      </div>

      {/* 預覽區 (可縮放平移) */}
      <div
        ref={containerRef}
        className={`preview-main ${isPanning ? 'panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {currentSlide && (
          <div
            className="preview-card"
            style={{
              width: canvasSettings.width,
              height: canvasSettings.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              backgroundImage: currentSlide.suggestedImage
                ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${currentSlide.suggestedImage.url})`
                : undefined,
              backgroundColor: currentSlide.suggestedImage
                ? undefined
                : canvasSettings.backgroundColor,
            }}
          >
            <h2 className="preview-title">{currentSlide.title}</h2>
            {currentSlide.subtitle && (
              <h3 className="preview-subtitle">{currentSlide.subtitle}</h3>
            )}
            <p className="preview-body">{currentSlide.body}</p>
            {currentSlide.bulletPoints && currentSlide.bulletPoints.length > 0 && (
              <ul className="preview-bullets">
                {currentSlide.bulletPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            )}
            {/* 素材圖片 */}
            {currentSlide.images && currentSlide.images.length > 0 && (
              <div className="preview-embedded-images">
                {currentSlide.images.slice(0, 4).map((img) => (
                  <img
                    key={img.id}
                    src={img.thumbnailUrl}
                    alt={img.name || ''}
                    className="preview-embedded-img"
                  />
                ))}
              </div>
            )}
            {currentSlide.suggestedImage && (
              <div className="preview-credit">
                Photo by {currentSlide.suggestedImage.author} on Unsplash
              </div>
            )}
          </div>
        )}
      </div>

      {/* 導航 */}
      <div className="preview-nav">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          ← 上一張
        </button>
        <span>
          {currentIndex + 1} / {slides.length}
        </span>
        <button
          onClick={() => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))}
          disabled={currentIndex === slides.length - 1}
        >
          下一張 →
        </button>
      </div>

      {/* 下載按鈕 */}
      <div className="preview-actions">
        <button className="btn-download" onClick={handleDownloadSingle}>
          下載此張
        </button>
        <button className="btn-download-all" onClick={handleDownloadAll}>
          下載全部 ({slides.length} 張)
        </button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default PreviewStep;
