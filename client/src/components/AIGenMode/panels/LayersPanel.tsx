/**
 * LayersPanel - 圖層管理面板
 * 參考 mini-canvas-editor 的 layers-panel 架構
 * 用於管理 AI Gen Mode 的卡片圖層
 */

import { useCallback, useState } from 'react';
import type { SlideContent } from '../types';
import './LayersPanel.css';

interface LayersPanelProps {
  slides: SlideContent[];
  selectedSlideId: string | null;
  onSelect: (slideId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (slideId: string) => void;
  onDuplicate: (slideId: string) => void;
  onToggleVisibility?: (slideId: string) => void;
  onToggleLock?: (slideId: string) => void;
}

interface LayerItemProps {
  slide: SlideContent;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function LayerItem({
  slide,
  index,
  isSelected,
  isDragging,
  isDragOver,
  onSelect,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDelete,
  onDuplicate,
}: LayerItemProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`layer-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      draggable
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="layer-drag-handle">⋮⋮</div>

      <div className="layer-thumbnail">
        {slide.images && slide.images.length > 0 ? (
          <img src={slide.images[0].thumbnailUrl} alt="" />
        ) : (
          <div className="layer-thumb-placeholder">
            {slide.title.charAt(0) || '?'}
          </div>
        )}
      </div>

      <div className="layer-info">
        <span className="layer-index">#{index + 1}</span>
        <span className="layer-title">{slide.title || '(無標題)'}</span>
        {slide.images && slide.images.length > 0 && (
          <span className="layer-badge">{slide.images.length} 圖</span>
        )}
      </div>

      {showActions && (
        <div className="layer-actions">
          <button
            className="layer-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="複製"
          >
            ⧉
          </button>
          <button
            className="layer-action-btn layer-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="刪除"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function LayersPanel({
  slides,
  selectedSlideId,
  onSelect,
  onReorder,
  onDelete,
  onDuplicate,
}: LayersPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== index) {
      setDragOverIndex(index);
    }
  }, [dragIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((toIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="layers-panel" onDragEnd={handleDragEnd}>
      <div className="layers-header">
        <h4>圖層</h4>
        <span className="layers-count">{slides.length}</span>
      </div>

      <div className="layers-list">
        {slides.map((slide, index) => (
          <LayerItem
            key={slide.id}
            slide={slide}
            index={index}
            isSelected={slide.id === selectedSlideId}
            isDragging={dragIndex === index}
            isDragOver={dragOverIndex === index}
            onSelect={() => onSelect(slide.id)}
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop(index)}
            onDelete={() => onDelete(slide.id)}
            onDuplicate={() => onDuplicate(slide.id)}
          />
        ))}
      </div>

      {slides.length === 0 && (
        <div className="layers-empty">
          <span>沒有圖層</span>
        </div>
      )}
    </div>
  );
}

export default LayersPanel;
