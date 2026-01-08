/**
 * PropertyPanel - 屬性編輯面板
 * 參考 mini-canvas-editor 的 ShapeEditorFactory 架構
 * 根據選中的 slide 動態渲染對應的屬性編輯器
 */

import { useRef, useCallback } from 'react';
import type { SlideContent, EmbeddedImage } from '../types';
import './PropertyPanel.css';

interface PropertyPanelProps {
  slide: SlideContent | null;
  slideIndex: number;
  totalSlides: number;
  onUpdate: (updates: Partial<SlideContent>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** 將圖片轉為 base64 */
function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Property Editors ---

interface TextPropertyEditorProps {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  onChange: (value: string) => void;
}

function TextPropertyEditor({
  label,
  value,
  placeholder,
  multiline = false,
  rows = 3,
  onChange,
}: TextPropertyEditorProps) {
  return (
    <div className="property-group">
      <label className="property-label">{label}</label>
      {multiline ? (
        <textarea
          className="property-input property-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <input
          type="text"
          className="property-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

interface BulletPointsEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
}

function BulletPointsEditor({ value, onChange }: BulletPointsEditorProps) {
  const textValue = value.join('\n');

  return (
    <div className="property-group">
      <label className="property-label">要點</label>
      <textarea
        className="property-input property-textarea"
        value={textValue}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .filter((s) => s.trim())
          )
        }
        placeholder="每行一個要點..."
        rows={3}
      />
      <span className="property-hint">每行輸入一個要點</span>
    </div>
  );
}

interface ImagesEditorProps {
  images: EmbeddedImage[];
  onAdd: (images: EmbeddedImage[]) => void;
  onDelete: (imageId: string) => void;
}

function ImagesEditor({ images, onAdd, onDelete }: ImagesEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      try {
        const newImages: EmbeddedImage[] = [];

        for (const file of files) {
          const base64 = await imageToBase64(file);
          newImages.push({
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url: base64,
            thumbnailUrl: base64,
            name: file.name,
          });
        }

        onAdd(newImages);
      } catch (err) {
        console.error('Image upload error:', err);
      }

      // 清除 input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onAdd]
  );

  return (
    <div className="property-group images-editor">
      <label className="property-label">素材圖片</label>

      {/* 已上傳的圖片 */}
      {images.length > 0 && (
        <div className="images-grid">
          {images.map((img) => (
            <div key={img.id} className="image-item">
              <img src={img.thumbnailUrl} alt={img.name || ''} />
              <button
                className="image-delete-btn"
                onClick={() => onDelete(img.id)}
                title="刪除"
              >
                ×
              </button>
              {img.name && <span className="image-name">{img.name}</span>}
            </div>
          ))}
        </div>
      )}

      {/* 上傳區域 */}
      <div className="upload-area">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          hidden
        />
        <button
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          + 上傳圖片
        </button>
        <span className="upload-hint">支援多選</span>
      </div>
    </div>
  );
}

// --- Main PropertyPanel ---

export function PropertyPanel({
  slide,
  slideIndex,
  totalSlides,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: PropertyPanelProps) {
  if (!slide) {
    return (
      <div className="property-panel property-panel-empty">
        <div className="empty-state">
          <span className="empty-icon">📝</span>
          <p>請選擇一張卡片進行編輯</p>
        </div>
      </div>
    );
  }

  const handleAddImages = useCallback(
    (newImages: EmbeddedImage[]) => {
      const existingImages = slide.images || [];
      onUpdate({ images: [...existingImages, ...newImages] });
    },
    [slide.images, onUpdate]
  );

  const handleDeleteImage = useCallback(
    (imageId: string) => {
      const updatedImages = (slide.images || []).filter(
        (img) => img.id !== imageId
      );
      onUpdate({ images: updatedImages });
    },
    [slide.images, onUpdate]
  );

  return (
    <div className="property-panel">
      {/* Header */}
      <div className="property-header">
        <h3>卡片 #{slideIndex + 1}</h3>
        <div className="property-actions">
          <button
            className="action-btn"
            onClick={onMoveUp}
            disabled={slideIndex === 0}
            title="上移"
          >
            ↑
          </button>
          <button
            className="action-btn"
            onClick={onMoveDown}
            disabled={slideIndex === totalSlides - 1}
            title="下移"
          >
            ↓
          </button>
          <button
            className="action-btn"
            onClick={onDuplicate}
            title="複製"
          >
            ⧉
          </button>
          <button
            className="action-btn action-btn-danger"
            onClick={onDelete}
            disabled={totalSlides <= 1}
            title="刪除"
          >
            ×
          </button>
        </div>
      </div>

      {/* Properties */}
      <div className="property-content">
        <TextPropertyEditor
          label="標題"
          value={slide.title}
          placeholder="輸入標題"
          onChange={(value) => onUpdate({ title: value })}
        />

        <TextPropertyEditor
          label="副標題"
          value={slide.subtitle || ''}
          placeholder="輸入副標題（可選）"
          onChange={(value) => onUpdate({ subtitle: value })}
        />

        <TextPropertyEditor
          label="內容"
          value={slide.body}
          placeholder="輸入主要內容"
          multiline
          rows={4}
          onChange={(value) => onUpdate({ body: value })}
        />

        <BulletPointsEditor
          value={slide.bulletPoints || []}
          onChange={(value) => onUpdate({ bulletPoints: value })}
        />

        <ImagesEditor
          images={slide.images || []}
          onAdd={handleAddImages}
          onDelete={handleDeleteImage}
        />
      </div>
    </div>
  );
}

export default PropertyPanel;
