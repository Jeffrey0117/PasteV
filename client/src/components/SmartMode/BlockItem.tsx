import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { TextBlock } from '../../types';

interface BlockItemProps {
  block: TextBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onUpdate: (updates: Partial<TextBlock>) => void;
  canvasBounds: { width: number; height: number };
  scale: number;
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

/**
 * BlockItem - A draggable and resizable text block on the canvas
 * Displays OCR detected text blocks with status-based styling
 */
export function BlockItem({
  block,
  isSelected,
  onSelect,
  onDrag,
  onUpdate,
  canvasBounds,
  scale,
}: BlockItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    bboxX: 0,
    bboxY: 0,
  });

  // Get status color class
  const getStatusClass = () => {
    switch (block.status) {
      case 'translate':
        return 'status-translate';
      case 'keep':
        return 'status-keep';
      case 'exclude':
        return 'status-exclude';
      default:
        return 'status-translate';
    }
  };

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore if clicking on resize handle
      if ((e.target as HTMLElement).classList.contains('block-resize-handle')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      onSelect();

      const rect = itemRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }

      setIsDragging(true);
    },
    [onSelect]
  );

  // Handle resize start
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: block.bbox.width,
        height: block.bbox.height,
        bboxX: block.bbox.x,
        bboxY: block.bbox.y,
      };

      setResizeHandle(handle);
    },
    [onSelect, block.bbox]
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = itemRef.current?.parentElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const x = (e.clientX - canvasRect.left - dragOffset.current.x) / scale;
      const y = (e.clientY - canvasRect.top - dragOffset.current.y) / scale;

      // Bound within canvas
      const boundedX = Math.max(0, Math.min(x, canvasBounds.width - block.bbox.width));
      const boundedY = Math.max(0, Math.min(y, canvasBounds.height - block.bbox.height));

      onDrag(Math.round(boundedX), Math.round(boundedY));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDrag, canvasBounds, block.bbox.width, block.bbox.height, scale]);

  // Handle resize move
  useEffect(() => {
    if (!resizeHandle) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - resizeStart.current.x) / scale;
      const deltaY = (e.clientY - resizeStart.current.y) / scale;

      let newX = resizeStart.current.bboxX;
      let newY = resizeStart.current.bboxY;
      let newWidth = resizeStart.current.width;
      let newHeight = resizeStart.current.height;

      // Adjust based on handle position
      switch (resizeHandle) {
        case 'e':
          newWidth = Math.max(20, resizeStart.current.width + deltaX);
          break;
        case 'w':
          newWidth = Math.max(20, resizeStart.current.width - deltaX);
          newX = resizeStart.current.bboxX + resizeStart.current.width - newWidth;
          break;
        case 's':
          newHeight = Math.max(20, resizeStart.current.height + deltaY);
          break;
        case 'n':
          newHeight = Math.max(20, resizeStart.current.height - deltaY);
          newY = resizeStart.current.bboxY + resizeStart.current.height - newHeight;
          break;
        case 'se':
          newWidth = Math.max(20, resizeStart.current.width + deltaX);
          newHeight = Math.max(20, resizeStart.current.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(20, resizeStart.current.width - deltaX);
          newHeight = Math.max(20, resizeStart.current.height + deltaY);
          newX = resizeStart.current.bboxX + resizeStart.current.width - newWidth;
          break;
        case 'ne':
          newWidth = Math.max(20, resizeStart.current.width + deltaX);
          newHeight = Math.max(20, resizeStart.current.height - deltaY);
          newY = resizeStart.current.bboxY + resizeStart.current.height - newHeight;
          break;
        case 'nw':
          newWidth = Math.max(20, resizeStart.current.width - deltaX);
          newHeight = Math.max(20, resizeStart.current.height - deltaY);
          newX = resizeStart.current.bboxX + resizeStart.current.width - newWidth;
          newY = resizeStart.current.bboxY + resizeStart.current.height - newHeight;
          break;
      }

      // Bound within canvas
      newX = Math.max(0, Math.min(newX, canvasBounds.width - 20));
      newY = Math.max(0, Math.min(newY, canvasBounds.height - 20));
      newWidth = Math.min(newWidth, canvasBounds.width - newX);
      newHeight = Math.min(newHeight, canvasBounds.height - newY);

      onUpdate({
        bbox: {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        },
      });
    };

    const handleMouseUp = () => {
      setResizeHandle(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeHandle, onUpdate, canvasBounds, scale]);

  const isResizing = resizeHandle !== null;

  return (
    <div
      ref={itemRef}
      className={`block-item ${getStatusClass()} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: block.bbox.x * scale,
        top: block.bbox.y * scale,
        width: block.bbox.width * scale,
        height: block.bbox.height * scale,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Status label */}
      <div className="block-label">
        {block.status === 'translate' && 'T'}
        {block.status === 'keep' && 'K'}
        {block.status === 'exclude' && 'X'}
      </div>

      {/* OCR text preview */}
      <div className="block-text-preview" title={block.text}>
        {block.text}
      </div>

      {/* Confidence indicator */}
      {block.confidence < 0.8 && (
        <div className="block-confidence" title={`OCR confidence: ${Math.round(block.confidence * 100)}%`}>
          !
        </div>
      )}

      {/* Resize handles - only show when selected */}
      {isSelected && (
        <>
          {/* Corner handles */}
          <div
            className="block-resize-handle block-resize-nw"
            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
          />
          <div
            className="block-resize-handle block-resize-ne"
            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
          />
          <div
            className="block-resize-handle block-resize-sw"
            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
          />
          <div
            className="block-resize-handle block-resize-se"
            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
          />
          {/* Edge handles */}
          <div
            className="block-resize-handle block-resize-n"
            onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
          />
          <div
            className="block-resize-handle block-resize-s"
            onMouseDown={(e) => handleResizeMouseDown(e, 's')}
          />
          <div
            className="block-resize-handle block-resize-e"
            onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
          />
          <div
            className="block-resize-handle block-resize-w"
            onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
          />
        </>
      )}
    </div>
  );
}
