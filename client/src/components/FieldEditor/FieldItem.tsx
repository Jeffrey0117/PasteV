import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { FieldTemplate } from '../../types';

interface FieldItemProps {
  field: FieldTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onResize: (width: number) => void;
  canvasBounds: { width: number; height: number };
}

/**
 * FieldItem - A draggable and resizable field box on the canvas
 */
export function FieldItem({
  field,
  isSelected,
  onSelect,
  onDrag,
  onResize,
  canvasBounds,
}: FieldItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, width: 0 });

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

  // Handle resize start
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      resizeStart.current = {
        x: e.clientX,
        width: field.width,
      };

      setIsResizing(true);
    },
    [onSelect, field.width]
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = itemRef.current?.parentElement;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const x = e.clientX - canvasRect.left - dragOffset.current.x;
      const y = e.clientY - canvasRect.top - dragOffset.current.y;

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
  }, [isDragging, onDrag, canvasBounds]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.current.x;
      const newWidth = Math.max(80, resizeStart.current.width + deltaX);
      // Bound width to canvas
      const maxWidth = canvasBounds.width - field.x;
      const boundedWidth = Math.min(newWidth, maxWidth);

      onResize(Math.round(boundedWidth));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onResize, canvasBounds.width, field.x]);

  return (
    <div
      ref={itemRef}
      className={`field-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
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
        Sample Text
      </div>

      {/* Resize handle */}
      <div className="field-resize-handle" onMouseDown={handleResizeMouseDown} />
    </div>
  );
}
