import React, { useState, useCallback } from 'react';
import type { SlideContent, ImageSearchResult } from './types';

interface ConfirmStepProps {
  slides: SlideContent[];
  includeImages: boolean;
  onUpdateSlide: (slideId: string, updates: Partial<SlideContent>) => void;
  onDeleteSlide: (slideId: string) => void;
  onAddSlide: () => void;
  onReorderSlides: (fromIndex: number, toIndex: number) => void;
  onRegenerateSlide: (slideId: string) => void;
  onSearchImage: (slideId: string, query: string) => Promise<ImageSearchResult[]>;
}

/**
 * Step 2: 確認內容
 * 編輯、調整、選擇圖片
 */
export function ConfirmStep({
  slides,
  includeImages,
  onUpdateSlide,
  onDeleteSlide,
  onAddSlide,
  onReorderSlides,
  onRegenerateSlide,
  onSearchImage,
}: ConfirmStepProps) {
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(
    slides[0]?.id || null
  );
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [searchResults, setSearchResults] = useState<ImageSearchResult[]>([]);
  const [imageQuery, setImageQuery] = useState('');

  const selectedSlide = slides.find((s) => s.id === selectedSlideId);
  const selectedIndex = slides.findIndex((s) => s.id === selectedSlideId);

  // 搜尋圖片
  const handleImageSearch = useCallback(async () => {
    if (!selectedSlideId || !imageQuery.trim()) return;

    setIsSearchingImage(true);
    try {
      const results = await onSearchImage(selectedSlideId, imageQuery);
      setSearchResults(results);
    } finally {
      setIsSearchingImage(false);
    }
  }, [selectedSlideId, imageQuery, onSearchImage]);

  // 選擇圖片
  const handleSelectImage = useCallback(
    (image: ImageSearchResult) => {
      if (!selectedSlideId) return;
      onUpdateSlide(selectedSlideId, {
        suggestedImage: {
          id: image.id,
          url: image.url,
          thumbnailUrl: image.thumbnailUrl,
          author: image.author,
          source: image.source,
        },
      });
      setSearchResults([]);
      setImageQuery('');
    },
    [selectedSlideId, onUpdateSlide]
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

  return (
    <div className="confirm-step">
      {/* 左側：卡片列表 */}
      <div className="slides-list">
        <div className="slides-header">
          <h3>卡片列表 ({slides.length})</h3>
          <button className="btn-add-slide" onClick={onAddSlide}>
            + 新增
          </button>
        </div>
        <div className="slides-scroll">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`slide-item ${selectedSlideId === slide.id ? 'selected' : ''}`}
              onClick={() => setSelectedSlideId(slide.id)}
            >
              <div className="slide-index">{index + 1}</div>
              <div className="slide-preview">
                {slide.suggestedImage ? (
                  <img
                    src={slide.suggestedImage.thumbnailUrl}
                    alt=""
                    className="slide-thumb"
                  />
                ) : (
                  <div className="slide-thumb-placeholder">
                    {slide.title.charAt(0) || '?'}
                  </div>
                )}
                <div className="slide-info">
                  <span className="slide-title">{slide.title || '(無標題)'}</span>
                  <span className="slide-body-preview">
                    {slide.body?.slice(0, 40) || '(無內容)'}
                    {slide.body?.length > 40 ? '...' : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
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
                  className="btn-icon btn-danger"
                  onClick={() => {
                    onDeleteSlide(selectedSlide.id);
                    setSelectedSlideId(slides[0]?.id || null);
                  }}
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

              {/* 圖片選擇 */}
              {includeImages && (
                <div className="form-group image-picker">
                  <label>背景圖片</label>
                  {selectedSlide.suggestedImage ? (
                    <div className="selected-image">
                      <img
                        src={selectedSlide.suggestedImage.thumbnailUrl}
                        alt=""
                      />
                      <div className="image-info">
                        <span>by {selectedSlide.suggestedImage.author}</span>
                        <button
                          className="btn-remove-image"
                          onClick={() =>
                            onUpdateSlide(selectedSlide.id, {
                              suggestedImage: undefined,
                            })
                          }
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="image-search">
                      <div className="search-input-row">
                        <input
                          type="text"
                          value={imageQuery}
                          onChange={(e) => setImageQuery(e.target.value)}
                          placeholder="輸入關鍵字搜尋圖片..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleImageSearch();
                          }}
                        />
                        <button
                          className="btn-search"
                          onClick={handleImageSearch}
                          disabled={isSearchingImage}
                        >
                          {isSearchingImage ? '搜尋中...' : '搜尋'}
                        </button>
                      </div>
                      {selectedSlide.imageKeywords && (
                        <div className="suggested-keywords">
                          <span>建議：</span>
                          {selectedSlide.imageKeywords.map((kw) => (
                            <button
                              key={kw}
                              className="keyword-btn"
                              onClick={() => {
                                setImageQuery(kw);
                              }}
                            >
                              {kw}
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.length > 0 && (
                        <div className="search-results">
                          {searchResults.map((img) => (
                            <div
                              key={img.id}
                              className="search-result-item"
                              onClick={() => handleSelectImage(img)}
                            >
                              <img src={img.thumbnailUrl} alt="" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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
