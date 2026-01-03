import React, { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import type { ImageData, TextBlock } from '../../types';
import './Preview.css';

/**
 * Preview Props for Smart Mode
 */
export interface PreviewProps {
  /** All images with detected blocks */
  images: ImageData[];

  /** Current image index */
  currentIndex: number;

  /** Callback when index changes */
  onIndexChange: (index: number) => void;

  /** Callback to go back to editor */
  onBack: () => void;

  /** Optional: update block translations */
  onBlockTranslationsChange?: (imageId: string, translations: Record<string, string>) => void;
}

/**
 * Smart Mode Preview Component
 * Displays the preview of translated images with inpainted background
 */
export const Preview: React.FC<PreviewProps> = ({
  images,
  currentIndex,
  onIndexChange,
  onBack,
  onBlockTranslationsChange,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [autoFitZoom, setAutoFitZoom] = useState(1);

  // View mode: 'translated' | 'original' | 'comparison'
  const [viewMode, setViewMode] = useState<'translated' | 'original' | 'comparison'>('translated');

  // Selected block for editing
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Current image data
  const currentImage = images[currentIndex];
  const blocks = currentImage?.detectedBlocks || [];
  const translations = currentImage?.blockTranslations || {};

  // Get image source with data URL prefix
  const getImageSrc = (base64: string): string => {
    if (!base64) return '';
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  };

  // Calculate auto-fit zoom
  useEffect(() => {
    const calculateAutoFit = () => {
      if (!canvasAreaRef.current || !currentImage) return;

      const area = canvasAreaRef.current;
      const padding = 80;
      const availableWidth = area.clientWidth - padding;
      const availableHeight = area.clientHeight - padding;

      const scaleX = availableWidth / currentImage.width;
      const scaleY = availableHeight / currentImage.height;
      const fitScale = Math.min(scaleX, scaleY, 1);

      setAutoFitZoom(Math.round(fitScale * 100) / 100);
      setZoom(Math.round(fitScale * 100) / 100);
    };

    calculateAutoFit();
    window.addEventListener('resize', calculateAutoFit);
    return () => window.removeEventListener('resize', calculateAutoFit);
  }, [currentImage]);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
      setSelectedBlockId(null);
    }
  }, [currentIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onIndexChange(currentIndex + 1);
      setSelectedBlockId(null);
    }
  }, [currentIndex, images.length, onIndexChange]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.1)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.1, z - 0.1)), []);
  const zoomFit = useCallback(() => setZoom(autoFitZoom), [autoFitZoom]);

  // Update block translation
  const updateBlockTranslation = useCallback(
    (blockId: string, newText: string) => {
      if (!onBlockTranslationsChange || !currentImage) return;
      const newTranslations = { ...translations, [blockId]: newText };
      onBlockTranslationsChange(currentImage.id, newTranslations);
    },
    [currentImage, translations, onBlockTranslationsChange]
  );

  // Export single image
  const exportSingle = useCallback(async () => {
    if (!canvasRef.current || exporting) return;

    // Clear selection and reset zoom for export
    setSelectedBlockId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);

    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `pastev-smart-${currentIndex + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setZoom(originalZoom);
    }
  }, [currentIndex, exporting, zoom]);

  // Export all images as ZIP
  const exportAll = useCallback(async () => {
    if (exporting) return;

    setSelectedBlockId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);
    setExportProgress(0);

    const originalIndex = currentIndex;

    try {
      const zip = new JSZip();
      const folder = zip.folder('pastev-smart-export');

      for (let i = 0; i < images.length; i++) {
        setExportProgress(Math.round((i / images.length) * 100));
        onIndexChange(i);
        await new Promise((resolve) => setTimeout(resolve, 150));

        if (!canvasRef.current) continue;

        const canvas = await html2canvas(canvasRef.current, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
          logging: false,
        });

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        folder?.file(`image-${String(i + 1).padStart(2, '0')}.png`, blob);
      }

      setExportProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.download = `pastev-smart-export-${Date.now()}.zip`;
      link.href = URL.createObjectURL(content);
      link.click();

      URL.revokeObjectURL(link.href);
      onIndexChange(originalIndex);
    } catch (error) {
      console.error('Export all failed:', error);
      alert('Batch export failed. Please try again.');
    } finally {
      setExporting(false);
      setExportProgress(0);
      setZoom(originalZoom);
    }
  }, [currentIndex, exporting, images.length, onIndexChange, zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case 'Home':
          e.preventDefault();
          onIndexChange(0);
          break;
        case 'End':
          e.preventDefault();
          onIndexChange(images.length - 1);
          break;
        case 'Escape':
          setSelectedBlockId(null);
          break;
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? exportAll() : exportSingle();
          }
          break;
        case '=':
        case '+':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomFit();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, onIndexChange, images.length, exportSingle, exportAll, zoomIn, zoomOut, zoomFit]);

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedBlockId(null);
    }
  }, []);

  // Render dot indicator for navigation
  const renderDotIndicator = () => {
    const maxDots = 7;
    const total = images.length;

    if (total <= maxDots) {
      return (
        <div className="smart-preview-dots">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              className={`dot ${i === currentIndex ? 'active' : ''}`}
              onClick={() => onIndexChange(i)}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      );
    }

    // Show limited dots with ellipsis for many images
    const dots: React.ReactNode[] = [];
    const showStart = currentIndex <= 2;
    const showEnd = currentIndex >= total - 3;

    if (showStart) {
      for (let i = 0; i < Math.min(5, total); i++) {
        dots.push(
          <button
            key={i}
            className={`dot ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onIndexChange(i)}
            aria-label={`Go to image ${i + 1}`}
          />
        );
      }
      if (total > 5) {
        dots.push(<span key="ellipsis" className="dot-ellipsis">...</span>);
        dots.push(
          <button
            key={total - 1}
            className={`dot ${total - 1 === currentIndex ? 'active' : ''}`}
            onClick={() => onIndexChange(total - 1)}
            aria-label={`Go to image ${total}`}
          />
        );
      }
    } else if (showEnd) {
      dots.push(
        <button
          key={0}
          className={`dot ${0 === currentIndex ? 'active' : ''}`}
          onClick={() => onIndexChange(0)}
          aria-label="Go to image 1"
        />
      );
      dots.push(<span key="ellipsis" className="dot-ellipsis">...</span>);
      for (let i = total - 5; i < total; i++) {
        dots.push(
          <button
            key={i}
            className={`dot ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onIndexChange(i)}
            aria-label={`Go to image ${i + 1}`}
          />
        );
      }
    } else {
      dots.push(
        <button
          key={0}
          className={`dot ${0 === currentIndex ? 'active' : ''}`}
          onClick={() => onIndexChange(0)}
          aria-label="Go to image 1"
        />
      );
      dots.push(<span key="ellipsis1" className="dot-ellipsis">...</span>);
      for (let i = currentIndex - 1; i <= currentIndex + 1; i++) {
        dots.push(
          <button
            key={i}
            className={`dot ${i === currentIndex ? 'active' : ''}`}
            onClick={() => onIndexChange(i)}
            aria-label={`Go to image ${i + 1}`}
          />
        );
      }
      dots.push(<span key="ellipsis2" className="dot-ellipsis">...</span>);
      dots.push(
        <button
          key={total - 1}
          className={`dot ${total - 1 === currentIndex ? 'active' : ''}`}
          onClick={() => onIndexChange(total - 1)}
          aria-label={`Go to image ${total}`}
        />
      );
    }

    return <div className="smart-preview-dots">{dots}</div>;
  };

  // Get text to display for a block based on view mode
  const getBlockDisplayText = (block: TextBlock): string => {
    if (viewMode === 'original') {
      return block.text;
    }
    // For translated and comparison modes, show translation if available
    return translations[block.id] || block.text;
  };

  // Filter blocks to show (exclude blocks marked as 'exclude')
  const visibleBlocks = blocks.filter((block) => block.status !== 'exclude');

  // Get background image based on view mode
  const getBackgroundImage = (): string => {
    if (viewMode === 'original') {
      return getImageSrc(currentImage?.originalImage || '');
    }
    // Use inpainted image for translated view if available
    return getImageSrc(currentImage?.inpaintedImage || currentImage?.originalImage || '');
  };

  // Get selected block
  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  if (!currentImage) {
    return (
      <div className="smart-preview-wrapper">
        <div className="smart-preview-empty">
          <p>No images to preview</p>
          <button className="btn-secondary" onClick={onBack}>
            Back to Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="smart-preview-wrapper">
      {/* Navigation bar */}
      <div className="smart-preview-nav">
        <button
          className="nav-arrow"
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          aria-label="Previous image"
        >
          &#8592; Prev
        </button>

        {renderDotIndicator()}

        <div className="page-counter">
          <span className="page-current">{currentIndex + 1}</span>
          <span className="page-separator">/</span>
          <span className="page-total">{images.length}</span>
        </div>

        <button
          className="nav-arrow"
          onClick={goToNext}
          disabled={currentIndex === images.length - 1}
          aria-label="Next image"
        >
          Next &#8594;
        </button>
      </div>

      {/* Main content */}
      <div className="smart-preview-content">
        {/* Canvas area */}
        <div className="smart-preview-canvas-area" ref={canvasAreaRef}>
          <div
            className="canvas-zoom-wrapper"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <div
              ref={canvasRef}
              className="smart-preview-canvas"
              style={{
                width: currentImage.width,
                height: currentImage.height,
                backgroundImage: `url(${getBackgroundImage()})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
              }}
              onClick={handleCanvasClick}
            >
              {/* Render text blocks */}
              {viewMode !== 'original' &&
                visibleBlocks.map((block) => {
                  const isSelected = block.id === selectedBlockId;
                  const displayText = getBlockDisplayText(block);

                  // Don't render blocks marked as 'keep' with original text
                  if (block.status === 'keep' && viewMode === 'translated') {
                    return null;
                  }

                  return (
                    <div
                      key={block.id}
                      className={`smart-preview-block ${isSelected ? 'selected' : ''} ${
                        block.status === 'keep' ? 'keep' : ''
                      }`}
                      style={{
                        position: 'absolute',
                        left: block.bbox.x,
                        top: block.bbox.y,
                        width: block.bbox.width,
                        minHeight: block.bbox.height,
                        fontSize: block.estimatedFontSize,
                        color: block.estimatedColor,
                        writingMode: block.direction === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
                        fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                        lineHeight: 1.3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        wordBreak: 'break-word',
                        cursor: onBlockTranslationsChange ? 'pointer' : 'default',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onBlockTranslationsChange) {
                          setSelectedBlockId(block.id);
                        }
                      }}
                    >
                      {displayText}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="smart-preview-sidebar">
          {/* Original image thumbnail */}
          <div className="sidebar-section">
            <h3>Original</h3>
            <div className="original-thumbnail">
              <img
                src={getImageSrc(currentImage.originalImage)}
                alt={`Original ${currentIndex + 1}`}
              />
            </div>
          </div>

          {/* View mode toggle */}
          <div className="sidebar-section">
            <h3>View Mode</h3>
            <div className="view-mode-toggle">
              <button
                className={viewMode === 'translated' ? 'active' : ''}
                onClick={() => setViewMode('translated')}
              >
                Translated
              </button>
              <button
                className={viewMode === 'original' ? 'active' : ''}
                onClick={() => setViewMode('original')}
              >
                Original
              </button>
              <button
                className={viewMode === 'comparison' ? 'active' : ''}
                onClick={() => setViewMode('comparison')}
              >
                Compare
              </button>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="sidebar-section">
            <h3>Zoom</h3>
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={zoomOut} disabled={zoom <= 0.1}>
                -
              </button>
              <span className="zoom-level" onClick={zoomFit} title="Click to fit">
                {Math.round(zoom * 100)}%
              </span>
              <button className="zoom-btn" onClick={zoomIn} disabled={zoom >= 3}>
                +
              </button>
            </div>
          </div>

          {/* Block list with translations */}
          <div className="sidebar-section blocks-section">
            <h3>Text Blocks ({visibleBlocks.length})</h3>
            <div className="block-list">
              {visibleBlocks.map((block) => {
                const translation = translations[block.id] || '';
                const isSelected = block.id === selectedBlockId;

                return (
                  <div
                    key={block.id}
                    className={`block-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedBlockId(block.id)}
                  >
                    <div className="block-item-header">
                      <span className="block-status-badge" data-status={block.status}>
                        {block.status === 'translate' ? 'Trans' : block.status === 'keep' ? 'Keep' : 'Excl'}
                      </span>
                      <span className="block-confidence">
                        {Math.round(block.confidence * 100)}%
                      </span>
                    </div>
                    <div className="block-original">{block.text}</div>
                    {block.status === 'translate' && (
                      <div className="block-translated">
                        {translation || <em className="no-translation">No translation</em>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected block editor */}
          {selectedBlock && onBlockTranslationsChange && (
            <div className="sidebar-section">
              <h3>Edit Translation</h3>
              <div className="block-editor">
                <label>Original:</label>
                <p className="block-original-text">{selectedBlock.text}</p>
                <label>Translation:</label>
                <textarea
                  value={translations[selectedBlock.id] || ''}
                  onChange={(e) => updateBlockTranslation(selectedBlock.id, e.target.value)}
                  placeholder="Enter translation..."
                  rows={3}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="smart-preview-actions">
        <button className="btn-back" onClick={onBack}>
          &#8592; Back to Editor
        </button>

        <div className="export-buttons">
          <button
            className="export-btn secondary"
            onClick={exportSingle}
            disabled={exporting}
            title="Ctrl+S"
          >
            {exporting && exportProgress === 0 ? (
              <>
                <span className="export-spinner" />
                Exporting...
              </>
            ) : (
              'Export This'
            )}
          </button>

          <div className="export-button-wrapper">
            <button
              className="export-btn primary"
              onClick={exportAll}
              disabled={exporting}
              title="Ctrl+Shift+S"
            >
              {exporting && exportProgress > 0 ? (
                <>
                  <span className="export-spinner" />
                  Exporting... {exportProgress}%
                </>
              ) : (
                `Export All ZIP (${images.length})`
              )}
            </button>
            {exporting && exportProgress > 0 && (
              <div className="export-progress">
                <div
                  className="export-progress-bar"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
