import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CroppedImage } from '../../types';
import { generateId } from '../../types';
import './ImageCropModal.css';

export interface ImageCropModalProps {
  /** Original image base64 */
  imageData: string;
  /** Image dimensions */
  imageWidth: number;
  imageHeight: number;
  /** Canvas settings for output positioning */
  canvasWidth: number;
  canvasHeight: number;
  /** Close handler */
  onClose: () => void;
  /** Confirm handler with cropped image */
  onConfirm: (croppedImage: CroppedImage) => void;
}

/**
 * ImageCropModal - Two-step modal for cropping and background removal
 * Step 1: Select crop region
 * Step 2: Pick background color for removal with live preview
 */
export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  imageData,
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  onClose,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Step state: 'crop' or 'background'
  const [step, setStep] = useState<'crop' | 'background'>('crop');

  // Drawing state (step 1)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);

  // Display scale (fit image in container)
  const [scale, setScale] = useState(1);
  const [previewScale, setPreviewScale] = useState(1);

  // Cropped image data (after step 1)
  const [croppedImageData, setCroppedImageData] = useState<string | null>(null);
  const [croppedRect, setCroppedRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Background removal state (step 2)
  const [bgColor, setBgColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [colorTolerance, setColorTolerance] = useState(30);
  const [processedImageData, setProcessedImageData] = useState<string | null>(null);

  // Load image and calculate scale
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.65;
      const scaleX = maxWidth / imageWidth;
      const scaleY = maxHeight / imageHeight;
      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
    };
    img.src = imageData;
  }, [imageData, imageWidth, imageHeight]);

  // Calculate preview scale when entering step 2
  useEffect(() => {
    if (step === 'background' && croppedRect) {
      const maxWidth = window.innerWidth * 0.6;
      const maxHeight = window.innerHeight * 0.5;
      const scaleX = maxWidth / croppedRect.width;
      const scaleY = maxHeight / croppedRect.height;
      setPreviewScale(Math.min(scaleX, scaleY, 2)); // max 2x for small images
    }
  }, [step, croppedRect]);

  // Get mouse position relative to image (in original image coordinates)
  const getImageCoords = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    return {
      x: Math.max(0, Math.min(imageWidth, x)),
      y: Math.max(0, Math.min(imageHeight, y)),
    };
  }, [scale, imageWidth, imageHeight]);

  // Mouse handlers for crop selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (step !== 'crop') return;
    const pos = getImageCoords(e);
    setIsDrawing(true);
    setDrawStart(pos);
    setDrawEnd(pos);
  }, [getImageCoords, step]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || step !== 'crop') return;
    const pos = getImageCoords(e);
    setDrawEnd(pos);
  }, [isDrawing, getImageCoords, step]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Calculate selection rect
  const getSelectionRect = useCallback(() => {
    if (!drawStart || !drawEnd) return null;

    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const width = Math.abs(drawEnd.x - drawStart.x);
    const height = Math.abs(drawEnd.y - drawStart.y);

    if (width < 10 || height < 10) return null;

    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  }, [drawStart, drawEnd]);

  const selectionRect = getSelectionRect();

  // Go to step 2: crop the image and show background removal
  const goToBackgroundStep = useCallback(() => {
    if (!selectionRect || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = selectionRect.width;
    canvas.height = selectionRect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      imgRef.current,
      selectionRect.x,
      selectionRect.y,
      selectionRect.width,
      selectionRect.height,
      0,
      0,
      selectionRect.width,
      selectionRect.height
    );

    const cropped = canvas.toDataURL('image/png');
    setCroppedImageData(cropped);
    setCroppedRect(selectionRect);
    setProcessedImageData(cropped);
    setStep('background');
  }, [selectionRect]);

  // Pick color from cropped image
  const handlePreviewClick = useCallback((e: React.MouseEvent) => {
    if (!croppedImageData || !croppedRect) return;

    const container = previewContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / previewScale);
    const y = Math.floor((e.clientY - rect.top) / previewScale);

    // Get pixel color from cropped image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = croppedRect.width;
      canvas.height = croppedRect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      setBgColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
    };
    img.src = croppedImageData;
  }, [croppedImageData, croppedRect, previewScale]);

  // Process image with background removal (live preview)
  useEffect(() => {
    if (!croppedImageData || !croppedRect || !bgColor) {
      if (croppedImageData) {
        setProcessedImageData(croppedImageData);
      }
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = croppedRect.width;
      canvas.height = croppedRect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      // Apply flood fill background removal
      const imageData = ctx.getImageData(0, 0, croppedRect.width, croppedRect.height);
      const data = imageData.data;
      const width = croppedRect.width;
      const height = croppedRect.height;

      const threshold = (colorTolerance / 100) * 441.67;

      const isBackgroundColor = (idx: number): boolean => {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const distance = Math.sqrt(
          Math.pow(r - bgColor.r, 2) +
          Math.pow(g - bgColor.g, 2) +
          Math.pow(b - bgColor.b, 2)
        );
        return distance <= threshold;
      };

      const visited = new Uint8Array(width * height);
      const getIdx = (x: number, y: number) => (y * width + x) * 4;
      const getVisitedIdx = (x: number, y: number) => y * width + x;

      const queue: Array<[number, number]> = [];

      // Add edge pixels
      for (let x = 0; x < width; x++) {
        if (isBackgroundColor(getIdx(x, 0))) {
          queue.push([x, 0]);
          visited[getVisitedIdx(x, 0)] = 1;
        }
        if (isBackgroundColor(getIdx(x, height - 1))) {
          queue.push([x, height - 1]);
          visited[getVisitedIdx(x, height - 1)] = 1;
        }
      }
      for (let y = 0; y < height; y++) {
        if (isBackgroundColor(getIdx(0, y))) {
          queue.push([0, y]);
          visited[getVisitedIdx(0, y)] = 1;
        }
        if (isBackgroundColor(getIdx(width - 1, y))) {
          queue.push([width - 1, y]);
          visited[getVisitedIdx(width - 1, y)] = 1;
        }
      }

      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

      while (queue.length > 0) {
        const [x, y] = queue.shift()!;
        const idx = getIdx(x, y);
        data[idx + 3] = 0;

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const visitedIdx = getVisitedIdx(nx, ny);
          if (visited[visitedIdx]) continue;
          if (isBackgroundColor(getIdx(nx, ny))) {
            visited[visitedIdx] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setProcessedImageData(canvas.toDataURL('image/png'));
    };
    img.src = croppedImageData;
  }, [croppedImageData, croppedRect, bgColor, colorTolerance]);

  // Final confirm
  const handleConfirm = useCallback(() => {
    if (!croppedRect || !processedImageData) return;

    const outputWidth = Math.min(croppedRect.width, canvasWidth * 0.8);
    const outputHeight = (outputWidth / croppedRect.width) * croppedRect.height;
    const x = (canvasWidth - outputWidth) / 2;
    const y = (canvasHeight - outputHeight) / 2;

    const croppedImage: CroppedImage = {
      id: generateId('crop'),
      imageData: processedImageData,
      sourceRect: croppedRect,
      x,
      y,
      outputWidth,
      outputHeight,
    };

    onConfirm(croppedImage);
  }, [croppedRect, processedImageData, canvasWidth, canvasHeight, onConfirm]);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'background') {
          setStep('crop');
          setBgColor(null);
        } else {
          onClose();
        }
      } else if (e.key === 'Enter') {
        if (step === 'crop' && selectionRect) {
          goToBackgroundStep();
        } else if (step === 'background') {
          handleConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, step, selectionRect, goToBackgroundStep, handleConfirm]);

  return (
    <div className="crop-modal-overlay" onClick={onClose}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <h3>{step === 'crop' ? '步驟 1：框選區域' : '步驟 2：去背設定'}</h3>
          <button className="crop-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="crop-modal-body">
          {step === 'crop' ? (
            <>
              <div className="crop-instructions">
                拖曳滑鼠框選要擷取的區域
              </div>

              <div
                ref={containerRef}
                className="crop-image-container"
                style={{
                  width: imageWidth * scale,
                  height: imageHeight * scale,
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={imageData}
                  alt="Original"
                  style={{
                    width: imageWidth * scale,
                    height: imageHeight * scale,
                  }}
                  draggable={false}
                />

                {selectionRect && (
                  <>
                    <div
                      className="crop-overlay-top"
                      style={{ height: selectionRect.y * scale }}
                    />
                    <div
                      className="crop-overlay-bottom"
                      style={{
                        top: (selectionRect.y + selectionRect.height) * scale,
                        height: (imageHeight - selectionRect.y - selectionRect.height) * scale,
                      }}
                    />
                    <div
                      className="crop-overlay-left"
                      style={{
                        top: selectionRect.y * scale,
                        height: selectionRect.height * scale,
                        width: selectionRect.x * scale,
                      }}
                    />
                    <div
                      className="crop-overlay-right"
                      style={{
                        top: selectionRect.y * scale,
                        height: selectionRect.height * scale,
                        left: (selectionRect.x + selectionRect.width) * scale,
                        width: (imageWidth - selectionRect.x - selectionRect.width) * scale,
                      }}
                    />
                    <div
                      className="crop-selection"
                      style={{
                        left: selectionRect.x * scale,
                        top: selectionRect.y * scale,
                        width: selectionRect.width * scale,
                        height: selectionRect.height * scale,
                      }}
                    >
                      <div className="crop-selection-size">
                        {selectionRect.width} x {selectionRect.height}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="crop-instructions">
                👆 點擊圖片選取要去除的背景顏色（可選）
              </div>

              <div className="crop-bg-controls">
                {bgColor ? (
                  <>
                    <div className="crop-color-preview">
                      <div
                        className="color-swatch"
                        style={{ backgroundColor: `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})` }}
                      />
                      <span>RGB({bgColor.r}, {bgColor.g}, {bgColor.b})</span>
                    </div>

                    <div className="crop-tolerance">
                      <label>
                        容差: {colorTolerance}%
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={colorTolerance}
                          onChange={(e) => setColorTolerance(Number(e.target.value))}
                        />
                      </label>
                    </div>

                    <button
                      className="btn small secondary"
                      onClick={() => setBgColor(null)}
                    >
                      清除去背
                    </button>
                  </>
                ) : (
                  <span className="crop-hint">尚未選取背景色，點擊圖片選取</span>
                )}
              </div>

              <div
                ref={previewContainerRef}
                className="crop-preview-container"
                style={{
                  width: croppedRect ? croppedRect.width * previewScale : 'auto',
                  height: croppedRect ? croppedRect.height * previewScale : 'auto',
                }}
                onClick={handlePreviewClick}
              >
                {processedImageData && (
                  <img
                    src={processedImageData}
                    alt="Preview"
                    style={{
                      width: croppedRect ? croppedRect.width * previewScale : 'auto',
                      height: croppedRect ? croppedRect.height * previewScale : 'auto',
                    }}
                    draggable={false}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="crop-modal-footer">
          {step === 'crop' ? (
            <>
              <button className="btn secondary" onClick={onClose}>
                取消
              </button>
              <button
                className="btn primary"
                onClick={goToBackgroundStep}
                disabled={!selectionRect}
              >
                下一步 →
              </button>
            </>
          ) : (
            <>
              <button className="btn secondary" onClick={() => { setStep('crop'); setBgColor(null); }}>
                ← 重新選取
              </button>
              <button className="btn primary" onClick={handleConfirm}>
                確認擷取
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
