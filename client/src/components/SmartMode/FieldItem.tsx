import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { FieldTemplate } from '../../types';

interface FieldItemProps {
  /** Field template data */
  field: FieldTemplate;

  /** Whether this field is selected */
  isSelected: boolean;

  /** Callback when field is selected */
  onSelect: () => void;

  /** Callback when field is dragged to a new position */
  onDrag: (x: number, y: number) => void;

  /** Callback when field is resized */
  onResize: (width: number) => void;

  /** Canvas boundaries for constraining drag */
  canvasBounds: { width: number; height: number };

  /** Current canvas scale */
  scale: number;
}

/**
 * FieldItem - A draggable and resizable field template box on the canvas
 * Displays field name and allows positioning via drag and resize
 */
export function FieldItem({
  field,
  isSelected,
  onSelect,
  onDrag,
  onResize,
  canvasBounds,
  scale,
}: FieldItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, width: 0 });

  // Estimate field height based on font size
  const estimatedHeight = Math.max(field.fontSize * 1.5, 30);

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
      const x = (e.clientX - canvasRect.left - dragOffset.current.x) / scale;
      const y = (e.clientY - canvasRect.top - dragOffset.current.y) / scale;

      // Bound within canvas
      const boundedX = Math.max(0, Math.min(x, canvasBounds.width - field.width));
      const boundedY = Math.max(0, Math.min(y, canvasBounds.height - estimatedHeight));

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
  }, [isDragging, onDrag, canvasBounds, field.width, estimatedHeight, scale]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - resizeStart.current.x) / scale;
      let newWidth = resizeStart.current.width + deltaX;

      // Constrain width
      newWidth = Math.max(50, newWidth); // Minimum width
      newWidth = Math.min(newWidth, canvasBounds.width - field.x); // Max to canvas edge

      onResize(Math.round(newWidth));
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
  }, [isResizing, onResize, canvasBounds.width, field.x, scale]);

  return (
    <div
      ref={itemRef}
      className={`field-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: field.x * scale,
        top: field.y * scale,
        width: field.width * scale,
        minHeight: estimatedHeight * scale,
        // Apply field styles to show preview
        fontSize: field.fontSize * scale,
        fontWeight: field.fontWeight,
        color: field.color,
        textAlign: field.textAlign,
        fontFamily: field.fontFamily || 'sans-serif',
        lineHeight: field.lineHeight || 1.2,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Field name label */}
      <div className="field-label">{field.name}</div>

      {/* Sample text for preview */}
      <div className="field-preview-text">
        Sample Text
      </div>

      {/* Resize handle - only show when selected */}
      {isSelected && (
        <div
          className="field-resize-handle"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  );
}

export default FieldItem;
