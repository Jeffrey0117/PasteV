import { useState, useCallback, useRef, useEffect } from 'react';
import type { SlideContent, ImageSearchResult, EmbeddedImage } from './types';
import { LayersPanel } from './panels';

interface ConfirmStepProps {
  slides: SlideContent[];
  includeImages: boolean;
  onUpdateSlide: (slideId: string, updates: Partial<SlideContent>) => void;
  onDeleteSlide: (slideId: string) => void;
  onAddSlide: (slide?: Partial<SlideContent>) => SlideContent;
  onReorderSlides: (fromIndex: number, toIndex: number) => void;
  onRegenerateSlide: (slideId: string) => void;
  onSearchImage: (slideId: string, query: string) => Promise<ImageSearchResult[]>;
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

/**
 * Step 2: 確認內容
 * 編輯、調整、上傳素材圖片
 * 使用 LayersPanel 管理圖層
 */
export function ConfirmStep({
  slides,
  onUpdateSlide,
  onDeleteSlide,
  onAddSlide,
  onReorderSlides,
  onRegenerateSlide,
  onSearchImage,
}: ConfirmStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onRegenerateSlide; // 預留給未來重新生成功能
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onSearchImage; // 預留給未來圖庫搜尋功能

  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(
    slides[0]?.id || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedSlide = slides.find((s) => s.id === selectedSlideId);
  const selectedIndex = slides.findIndex((s) => s.id === selectedSlideId);

  // 當 slides 變更時，確保 selectedSlideId 有效
  useEffect(() => {
    if (slides.length > 0 && !slides.find(s => s.id === selectedSlideId)) {
      setSelectedSlideId(slides[0].id);
    }
  }, [slides, selectedSlideId]);

  // 上傳素材圖片（支援多張）
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0 || !selectedSlideId || !selectedSlide) return;

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

        // 合併現有圖片
        const existingImages = selectedSlide.images || [];
        onUpdateSlide(selectedSlideId, {
          images: [...existingImages, ...newImages],
        });
      } catch (err) {
        console.error('Image upload error:', err);
      }

      // 清除 input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedSlideId, selectedSlide, onUpdateSlide]
  );

  // 刪除素材圖片
  const handleDeleteImage = useCallback(
    (imageId: string) => {
      if (!selectedSlideId || !selectedSlide) return;

      const updatedImages = (selectedSlide.images || []).filter(
        (img) => img.id !== imageId
      );
      onUpdateSlide(selectedSlideId, { images: updatedImages });
    },
    [selectedSlideId, selectedSlide, onUpdateSlide]
  );

  // 複製 slide
  const handleDuplicateSlide = useCallback(
    (slideId: string) => {
      const slideToDuplicate = slides.find((s) => s.id === slideId);
      if (!slideToDuplicate) return;

      const newSlide = onAddSlide({
        title: `${slideToDuplicate.title} (複製)`,
        subtitle: slideToDuplicate.subtitle,
        body: slideToDuplicate.body,
        bulletPoints: [...(slideToDuplicate.bulletPoints || [])],
        images: slideToDuplicate.images
          ? slideToDuplicate.images.map((img) => ({
              ...img,
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            }))
          : undefined,
      });

      setSelectedSlideId(newSlide.id);
    },
    [slides, onAddSlide]
  );

  // 刪除並選擇下一張
  const handleDeleteSlide = useCallback(
    (slideId: string) => {
      const index = slides.findIndex((s) => s.id === slideId);
      onDeleteSlide(slideId);

      // 選擇下一張或上一張
      if (slides.length > 1) {
        const nextIndex = index >= slides.length - 1 ? index - 1 : index;
        const nextSlide = slides.filter((s) => s.id !== slideId)[nextIndex];
        if (nextSlide) {
          setSelectedSlideId(nextSlide.id);
        }
      }
    },
    [slides, onDeleteSlide]
  );

  // 移動 slide
  const handleMoveUp = useCallback(() => {
    if (selectedIndex > 0) {
      onReorderSlides(selectedIndex, selectedIndex - 1);
    }
  }, [selectedIndex, onReorderSlides]);

  const handleMoveDown = useCallback(() => {
    if (selectedIndex < slides.length - 1) {
      onReorderSlides(selectedIndex, selectedIndex + 1);
    }
  }, [selectedIndex, slides.length, onReorderSlides]);

  // 新增空白 slide
  const handleAddSlide = useCallback(() => {
    const newSlide = onAddSlide();
    setSelectedSlideId(newSlide.id);
  }, [onAddSlide]);

  return (
    <div className="confirm-step">
      {/* 左側：圖層面板 */}
      <div className="confirm-sidebar">
        <div className="sidebar-header">
          <button className="btn-add-slide" onClick={handleAddSlide}>
            + 新增卡片
          </button>
        </div>
        <LayersPanel
          slides={slides}
          selectedSlideId={selectedSlideId}
          onSelect={setSelectedSlideId}
          onReorder={onReorderSlides}
          onDelete={handleDeleteSlide}
          onDuplicate={handleDuplicateSlide}
        />
      </div>

      {/* 右側：編輯區 */}
      <div className="slide-editor">
        {selectedSlide ? (
          <>
            <div className="editor-header">
              <h3>編輯第 {selectedIndex + 1} 張</h3>
              <div className="editor-actions">
                <button
                  className="btn-icon"
                  onClick={handleMoveUp}
                  disabled={selectedIndex === 0}
                  title="上移"
                >
                  ↑
                </button>
                <button
                  className="btn-icon"
                  onClick={handleMoveDown}
                  disabled={selectedIndex === slides.length - 1}
                  title="下移"
                >
                  ↓
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDuplicateSlide(selectedSlide.id)}
                  title="複製"
                >
                  ⧉
                </button>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => handleDeleteSlide(selectedSlide.id)}
                  disabled={slides.length <= 1}
                  title="刪除"
                >
                  🗑
                </button>
              </div>
            </div>

            <div className="editor-form">
              <div className="form-group">
                <label>標題</label>
                <input
                  type="text"
                  value={selectedSlide.title}
                  onChange={(e) =>
                    onUpdateSlide(selectedSlide.id, { title: e.target.value })
                  }
                  placeholder="輸入標題"
                />
              </div>

              <div className="form-group">
                <label>副標題（可選）</label>
                <input
                  type="text"
                  value={selectedSlide.subtitle || ''}
                  onChange={(e) =>
                    onUpdateSlide(selectedSlide.id, { subtitle: e.target.value })
                  }
                  placeholder="輸入副標題"
                />
              </div>

              <div className="form-group">
                <label>內容</label>
                <textarea
                  value={selectedSlide.body}
                  onChange={(e) =>
                    onUpdateSlide(selectedSlide.id, { body: e.target.value })
                  }
                  placeholder="輸入主要內容"
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label>要點（每行一個）</label>
                <textarea
                  value={selectedSlide.bulletPoints?.join('\n') || ''}
                  onChange={(e) =>
                    onUpdateSlide(selectedSlide.id, {
                      bulletPoints: e.target.value
                        .split('\n')
                        .filter((s) => s.trim()),
                    })
                  }
                  placeholder="• 要點一&#10;• 要點二&#10;• 要點三"
                  rows={3}
                />
              </div>

              {/* 素材圖片 */}
              <div className="form-group embedded-images">
                <label>素材圖片</label>

                {/* 已上傳的圖片 */}
                {selectedSlide.images && selectedSlide.images.length > 0 && (
                  <div className="image-grid">
                    {selectedSlide.images.map((img) => (
                      <div key={img.id} className="image-grid-item">
                        <img src={img.thumbnailUrl} alt={img.name || ''} />
                        <button
                          className="btn-delete-image"
                          onClick={() => handleDeleteImage(img.id)}
                          title="刪除"
                        >
                          ×
                        </button>
                        {img.name && (
                          <span className="image-name">{img.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 上傳按鈕 */}
                <div className="upload-image-area">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    hidden
                  />
                  <button
                    className="btn-upload-image"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + 上傳圖片
                  </button>
                  <span className="upload-hint">
                    支援多選，圖片會顯示在卡片內容中
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="no-selection">
            <p>請從左側選擇一張卡片進行編輯</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfirmStep;
