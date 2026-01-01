import { useState, useMemo, useCallback } from 'react';
import type { LayoutGroup, ImageData } from '../../types';
import './LayoutGroupModal.css';

interface LayoutGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: LayoutGroup[];
  images: ImageData[];
  onConfirm: (groups: LayoutGroup[], applyUnifiedLayout: boolean[]) => void;
}

/**
 * LayoutGroupModal - Modal for confirming layout group detection results
 *
 * Displays detected layout groups with thumbnails and allows users to:
 * - Review grouped images by layout similarity
 * - Choose whether to apply unified layout from representative image
 * - Confirm or cancel the grouping
 */
export function LayoutGroupModal({
  isOpen,
  onClose,
  groups,
  images,
  onConfirm,
}: LayoutGroupModalProps) {
  // Track which groups should use unified layout
  const [unifiedLayoutFlags, setUnifiedLayoutFlags] = useState<boolean[]>(() =>
    groups.map((group) => group.imageIds.length > 1)
  );

  // Reset flags when groups change
  useMemo(() => {
    setUnifiedLayoutFlags(groups.map((group) => group.imageIds.length > 1));
  }, [groups]);

  // Get image by ID
  const getImageById = useCallback(
    (id: string): ImageData | undefined => {
      return images.find((img) => img.id === id);
    },
    [images]
  );

  // Handle checkbox toggle
  const handleToggleUnified = useCallback((index: number) => {
    setUnifiedLayoutFlags((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    onConfirm(groups, unifiedLayoutFlags);
  }, [groups, unifiedLayoutFlags, onConfirm]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalImages = images.length;
    const groupedImages = groups.reduce(
      (acc, g) => acc + (g.imageIds.length > 1 ? g.imageIds.length : 0),
      0
    );
    const independentImages = totalImages - groupedImages;
    return { totalImages, groupedImages, independentImages, groupCount: groups.length };
  }, [groups, images]);

  // Get similarity badge class
  const getSimilarityClass = (similarity: number): string => {
    if (similarity >= 0.85) return '';
    if (similarity >= 0.7) return 'medium';
    return 'low';
  };

  // Format group name
  const getGroupName = (index: number, group: LayoutGroup): string => {
    if (group.imageIds.length === 1) {
      return '獨立圖片';
    }
    // Use letters: A, B, C, ...
    const letter = String.fromCharCode(65 + index);
    return `版型 ${letter}`;
  };

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  // Maximum thumbnails to show per group
  const MAX_THUMBNAILS = 8;

  return (
    <div className="layout-group-modal-overlay" onClick={onClose}>
      <div
        className="layout-group-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-group-modal-title"
      >
        {/* Header */}
        <div className="layout-group-modal-header">
          <h2 id="layout-group-modal-title">
            偵測完成！發現以下版型分組
            <span className="modal-subtitle">
              共 {summaryStats.groupCount} 組
            </span>
          </h2>
          <button
            className="layout-group-modal-close"
            onClick={onClose}
            aria-label="關閉"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="layout-group-modal-body">
          {/* Summary */}
          <div className="layout-group-summary">
            <div className="layout-group-summary-item">
              <span className="summary-value">{summaryStats.totalImages}</span>
              <span className="summary-label">總圖片數</span>
            </div>
            <div className="layout-group-summary-item">
              <span className="summary-value">{summaryStats.groupCount}</span>
              <span className="summary-label">版型分組</span>
            </div>
            <div className="layout-group-summary-item">
              <span className="summary-value">{summaryStats.groupedImages}</span>
              <span className="summary-label">已分組</span>
            </div>
            <div className="layout-group-summary-item">
              <span className="summary-value">{summaryStats.independentImages}</span>
              <span className="summary-label">獨立圖片</span>
            </div>
          </div>

          {/* Groups */}
          {groups.length === 0 ? (
            <div className="layout-group-empty">
              <div className="layout-group-empty-icon">📂</div>
              <p>未偵測到任何版型分組</p>
            </div>
          ) : (
            groups.map((group, groupIndex) => {
              const isIndependent = group.imageIds.length === 1;
              const displayedImageIds = group.imageIds.slice(0, MAX_THUMBNAILS);
              const remainingCount = group.imageIds.length - MAX_THUMBNAILS;

              return (
                <div
                  key={group.id}
                  className={`layout-group-card ${isIndependent ? 'independent' : ''}`}
                >
                  {/* Group Header */}
                  <div className="layout-group-header">
                    <div className="layout-group-info">
                      <span className="layout-group-icon">
                        {isIndependent ? '📄' : '📁'}
                      </span>
                      <span className="layout-group-name">
                        {getGroupName(groupIndex, group)}
                      </span>
                      <span className="layout-group-count">
                        {group.imageIds.length} 張
                      </span>
                    </div>
                    {!isIndependent && (
                      <div className="layout-group-similarity">
                        相似度
                        <span
                          className={`similarity-badge ${getSimilarityClass(group.similarity)}`}
                        >
                          {Math.round(group.similarity * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Thumbnails */}
                  <div className="layout-group-thumbnails">
                    {displayedImageIds.map((imageId, imgIndex) => {
                      const image = getImageById(imageId);
                      const isRepresentative = imageId === group.representativeImageId;

                      if (!image) return null;

                      return (
                        <div
                          key={imageId}
                          className={`layout-group-thumbnail ${isRepresentative ? 'representative' : ''}`}
                          title={`圖片 ${images.findIndex((i) => i.id === imageId) + 1}`}
                        >
                          <img
                            src={image.originalImage}
                            alt={`圖片 ${imgIndex + 1}`}
                            loading="lazy"
                          />
                          {isRepresentative && !isIndependent && (
                            <span className="representative-badge">代表</span>
                          )}
                          <span className="thumbnail-index">
                            {images.findIndex((i) => i.id === imageId) + 1}
                          </span>
                        </div>
                      );
                    })}
                    {remainingCount > 0 && (
                      <div className="layout-group-thumbnail more-indicator">
                        <span>+{remainingCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Unified Layout Option */}
                  {!isIndependent && (
                    <div className="layout-group-option">
                      <input
                        type="checkbox"
                        id={`unified-${group.id}`}
                        checked={unifiedLayoutFlags[groupIndex] ?? true}
                        onChange={() => handleToggleUnified(groupIndex)}
                      />
                      <label htmlFor={`unified-${group.id}`}>
                        統一使用第一張的佈局
                      </label>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="layout-group-modal-footer">
          <button className="btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={handleConfirm}>
            確認並繼續
          </button>
        </div>
      </div>
    </div>
  );
}

export default LayoutGroupModal;
