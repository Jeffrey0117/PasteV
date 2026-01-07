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
 * ImageCropModal - Modal for cropping a region from the original image
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);

  // Display scale (fit image in container)
  const [scale, setScale] = useState(1);

  // Load image and calculate scale
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;

      // Calculate scale to fit in container (max 80vh, 80vw)
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.7;
      const scaleX = maxWidth / imageWidth;
      const scaleY = maxHeight / imageHeight;
      const newScale = Math.min(scaleX, scaleY, 1);
      setScale(newScale);
    };
    img.src = imageData;
  }, [imageData, imageWidth, imageHeight]);

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

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getImageCoords(e);
    setIsDrawing(true);
    setDrawStart(pos);
    setDrawEnd(pos);
  }, [getImageCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getImageCoords(e);
    setDrawEnd(pos);
  }, [isDrawing, getImageCoords]);

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

    return { x, y, width, height };
  }, [drawStart, drawEnd]);

  const selectionRect = getSelectionRect();

  // Crop the image
  const handleConfirm = useCallback(() => {
    if (!selectionRect || !imgRef.current) return;

    // Create canvas to crop
    const canvas = document.createElement('canvas');
    canvas.width = selectionRect.width;
    canvas.height = selectionRect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw cropped region
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

    // Get base64
    const croppedData = canvas.toDataURL('image/png');

    // Calculate output position (center of canvas by default)
    const outputWidth = Math.min(selectionRect.width, canvasWidth * 0.8);
    const outputHeight = (outputWidth / selectionRect.width) * selectionRect.height;
    const x = (canvasWidth - outputWidth) / 2;
    const y = (canvasHeight - outputHeight) / 2;

    const croppedImage: CroppedImage = {
      id: generateId('crop'),
      imageData: croppedData,
      sourceRect: selectionRect,
      x,
      y,
      outputWidth,
      outputHeight,
    };

    onConfirm(croppedImage);
  }, [selectionRect, canvasWidth, canvasHeight, onConfirm]);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && selectionRect) {
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleConfirm, selectionRect]);

  return (
    <div className="crop-modal-overlay" onClick={onClose}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <h3>擷取圖片區域</h3>
          <button className="crop-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="crop-modal-body">
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

            {/* Selection overlay */}
            {selectionRect && (
              <>
                {/* Dimmed areas */}
                <div
                  className="crop-overlay-top"
                  style={{
                    height: selectionRect.y * scale,
                  }}
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

                {/* Selection box */}
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
                    {Math.round(selectionRect.width)} x {Math.round(selectionRect.height)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="crop-modal-footer">
          <button className="btn secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={handleConfirm}
            disabled={!selectionRect}
          >
            確認擷取
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
