import { useState, useCallback, useEffect } from 'react';
import type { SlideContent, ImageSearchResult } from './types';
import { LayersPanel, PropertyPanel } from './panels';

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

/**
 * Step 2: 確認內容
 * 使用 LayersPanel 管理圖層，PropertyPanel 編輯屬性
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

  const selectedSlide = slides.find((s) => s.id === selectedSlideId) || null;
  const selectedIndex = slides.findIndex((s) => s.id === selectedSlideId);

  // 當 slides 變更時，確保 selectedSlideId 有效
  useEffect(() => {
    if (slides.length > 0 && !slides.find(s => s.id === selectedSlideId)) {
      setSelectedSlideId(slides[0].id);
    }
  }, [slides, selectedSlideId]);

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

  // PropertyPanel 的更新回調
  const handleUpdate = useCallback(
    (updates: Partial<SlideContent>) => {
      if (selectedSlideId) {
        onUpdateSlide(selectedSlideId, updates);
      }
    },
    [selectedSlideId, onUpdateSlide]
  );

  // PropertyPanel 的複製回調
  const handleDuplicate = useCallback(() => {
    if (selectedSlideId) {
      handleDuplicateSlide(selectedSlideId);
    }
  }, [selectedSlideId, handleDuplicateSlide]);

  // PropertyPanel 的刪除回調
  const handleDelete = useCallback(() => {
    if (selectedSlideId) {
      handleDeleteSlide(selectedSlideId);
    }
  }, [selectedSlideId, handleDeleteSlide]);

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

      {/* 右側：屬性編輯面板 */}
      <div className="slide-editor">
        <PropertyPanel
          slide={selectedSlide}
          slideIndex={selectedIndex}
          totalSlides={slides.length}
          onUpdate={handleUpdate}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

export default ConfirmStep;
