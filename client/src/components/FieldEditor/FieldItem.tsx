import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { FieldTemplate } from '../../types';

interface FieldItemProps {
  field: FieldTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onResize: (width: number) => void;
  onUpdate: (updates: Partial<FieldTemplate>) => void;
  canvasBounds: { width: number; height: number };
  zoom?: number;
}

type ResizeType = 'left' | 'right' | 'corner' | null;

/**
 * FieldItem - A draggable and resizable field box on the canvas
 */
export function FieldItem({
  field,
  isSelected,
  onSelect,
  onDrag,
  onResize,
  onUpdate,
  canvasBounds,
  zoom = 1,
}: FieldItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeType, setResizeType] = useState<ResizeType>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, fieldX: 0, fontSize: 16 });

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore if clicking on resize handle
      if ((e.target as HTMLElement).classList.contains('field-resize-handle')) {
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

  // Handle resize start (right handle - width)
  const handleResizeRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: field.width,
        fieldX: field.x,
        fontSize: field.fontSize,
      };

      setResizeType('right');
    },
    [onSelect, field.width, field.x, field.fontSize]
  );

  // Handle resize start (left handle - width + position)
  const handleResizeLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: field.width,
        fieldX: field.x,
        fontSize: field.fontSize,
      };

      setResizeType('left');
    },
    [onSelect, field.width, field.x, field.fontSize]
  );

  // Handle resize start (corner handle - font size)
  const handleResizeCornerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: field.width,
        fieldX: field.x,
        fontSize: field.fontSize,
      };

      setResizeType('corner');
    },
    [onSelect, field.width, field.x, field.fontSize]
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = itemRef.current?.parentElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      // Account for zoom when calculating position
      const x = (e.clientX - canvasRect.left) / zoom - dragOffset.current.x;
      const y = (e.clientY - canvasRect.top) / zoom - dragOffset.current.y;

      // Bound within canvas
      const boundedX = Math.max(0, Math.min(x, canvasBounds.width - 50));
      const boundedY = Math.max(0, Math.min(y, canvasBounds.height - 30));

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
  }, [isDragging, onDrag, canvasBounds, zoom]);

  // Handle resize move
  useEffect(() => {
    if (!resizeType) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Account for zoom when calculating deltas
      const deltaX = (e.clientX - resizeStart.current.x) / zoom;
      const deltaY = (e.clientY - resizeStart.current.y) / zoom;

      if (resizeType === 'right') {
        // Right handle: adjust width only
        const newWidth = Math.max(80, resizeStart.current.width + deltaX);
        const maxWidth = canvasBounds.width - field.x;
        const boundedWidth = Math.min(newWidth, maxWidth);
        onResize(Math.round(boundedWidth));
      } else if (resizeType === 'left') {
        // Left handle: adjust width and x position
        const newX = resizeStart.current.fieldX + deltaX;
        const newWidth = resizeStart.current.width - deltaX;

        if (newWidth >= 80 && newX >= 0) {
          onUpdate({ x: Math.round(newX), width: Math.round(newWidth) });
        }
      } else if (resizeType === 'corner') {
        // Corner handle: adjust font size
        const scaleFactor = (resizeStart.current.fontSize + deltaY) / resizeStart.current.fontSize;
        const newFontSize = Math.max(8, Math.min(200, Math.round(resizeStart.current.fontSize * scaleFactor)));
        onUpdate({ fontSize: newFontSize });
      }
    };

    const handleMouseUp = () => {
      setResizeType(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizeType, onResize, onUpdate, canvasBounds.width, field.x, zoom]);

  const isResizing = resizeType !== null;

  return (
    <div
      ref={itemRef}
      className={`field-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: field.x,
        top: field.y,
        width: field.width,
        fontSize: field.fontSize,
        fontWeight: field.fontWeight,
        color: field.color,
        textAlign: field.textAlign,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Field name label */}
      <div className="field-label">{field.name}</div>

      {/* Preview text */}
      <div className="field-preview-text" style={{ lineHeight: field.lineHeight || 1.4 }}>
        範例文字
      </div>

      {/* Resize handles - only show when selected */}
      {isSelected && (
        <>
          {/* Left handle - adjust width from left side */}
          <div
            className="field-resize-handle field-resize-left"
            onMouseDown={handleResizeLeftMouseDown}
            title="拖曳調整寬度 (左)"
          />
          {/* Right handle - adjust width from right side */}
          <div
            className="field-resize-handle field-resize-right"
            onMouseDown={handleResizeRightMouseDown}
            title="拖曳調整寬度 (右)"
          />
          {/* Corner handle - adjust font size */}
          <div
            className="field-resize-handle field-resize-corner"
            onMouseDown={handleResizeCornerMouseDown}
            title="拖曳調整字體大小"
          />
        </>
      )}
    </div>
  );
}
