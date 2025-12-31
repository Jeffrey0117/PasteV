import React, { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import type { ImageData, FieldTemplate, CanvasSettings } from '../../types';
import ExportButton from './ExportButton';
import './Preview.css';

/**
 * Preview Props
 */
export interface PreviewProps {
  images: ImageData[];
  fields: FieldTemplate[];
  onFieldsChange?: (fields: FieldTemplate[]) => void;
  canvasSettings: CanvasSettings;
  onCanvasSettingsChange?: (settings: CanvasSettings) => void;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onBack: () => void;
}

/**
 * Preview component with editing capabilities
 */
const Preview: React.FC<PreviewProps> = ({
  images,
  fields,
  onFieldsChange,
  canvasSettings,
  onCanvasSettingsChange,
  currentIndex,
  onIndexChange,
  onBack,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [autoFitZoom, setAutoFitZoom] = useState(1);

  // Editing state
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartFieldPos, setDragStartFieldPos] = useState({ x: 0, y: 0 });

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'se' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, fontSize: 16 });

  const currentImage = images[currentIndex];
  const selectedField = fields.find((f) => f.id === selectedFieldId);

  // Calculate auto-fit zoom
  useEffect(() => {
    const calculateAutoFit = () => {
      if (!canvasAreaRef.current) return;

      const area = canvasAreaRef.current;
      const padding = 80;
      const availableWidth = area.clientWidth - padding;
      const availableHeight = area.clientHeight - padding;

      const scaleX = availableWidth / canvasSettings.width;
      const scaleY = availableHeight / canvasSettings.height;
      const fitScale = Math.min(scaleX, scaleY, 1);

      setAutoFitZoom(Math.round(fitScale * 100) / 100);
      setZoom(Math.round(fitScale * 100) / 100);
    };

    calculateAutoFit();
    window.addEventListener('resize', calculateAutoFit);
    return () => window.removeEventListener('resize', calculateAutoFit);
  }, [canvasSettings.width, canvasSettings.height]);

  // Update field
  const updateField = useCallback(
    (fieldId: string, updates: Partial<FieldTemplate>) => {
      if (!onFieldsChange) return;
      onFieldsChange(
        fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
      );
    },
    [fields, onFieldsChange]
  );

  // Get canvas position from mouse event
  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvasRect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - canvasRect.left) / zoom,
      y: (e.clientY - canvasRect.top) / zoom,
    };
  }, [zoom]);

  // Mouse down on field - start drag
  const handleFieldMouseDown = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!onFieldsChange) return;

      const field = fields.find(f => f.id === fieldId);
      if (!field) return;

      setSelectedFieldId(fieldId);
      const pos = getCanvasPos(e);
      setDragStartPos(pos);
      setDragStartFieldPos({ x: field.x, y: field.y });
      setIsDragging(true);
    },
    [onFieldsChange, fields, getCanvasPos]
  );

  // Mouse move - drag or resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedFieldId || !canvasRef.current) return;

      const pos = getCanvasPos(e);

      // Handle resize
      if (isResizing && resizeHandle === 'se') {
        const deltaX = pos.x - resizeStart.x;
        const deltaY = pos.y - resizeStart.y;

        // Use the larger delta for proportional scaling
        const scaleFactor = Math.max(
          (resizeStart.width + deltaX) / resizeStart.width,
          (resizeStart.height + deltaY) / resizeStart.height
        );

        const newWidth = Math.max(50, Math.round(resizeStart.width * scaleFactor));
        const newFontSize = Math.max(8, Math.min(200, Math.round(resizeStart.fontSize * scaleFactor)));

        updateField(selectedFieldId, {
          width: newWidth,
          fontSize: newFontSize,
        });
        return;
      }

      // Handle drag
      if (isDragging) {
        const deltaX = pos.x - dragStartPos.x;
        const deltaY = pos.y - dragStartPos.y;

        const newX = Math.max(0, Math.round(dragStartFieldPos.x + deltaX));
        const newY = Math.max(0, Math.round(dragStartFieldPos.y + deltaY));

        updateField(selectedFieldId, { x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, selectedFieldId, dragStartPos, dragStartFieldPos, resizeStart, resizeHandle, getCanvasPos, updateField]);

  // Resize handle mouse down
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!selectedFieldId) return;

      const field = fields.find((f) => f.id === selectedFieldId);
      if (!field) return;

      const pos = getCanvasPos(e);

      setResizeHandle('se');
      setIsResizing(true);
      setResizeStart({
        x: pos.x,
        y: pos.y,
        width: field.width,
        height: field.fontSize * 3, // Approximate height based on font size
        fontSize: field.fontSize,
      });
    },
    [selectedFieldId, fields, getCanvasPos]
  );

  // Canvas click - deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedFieldId(null);
    }
  }, []);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) onIndexChange(currentIndex - 1);
  }, [currentIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) onIndexChange(currentIndex + 1);
  }, [currentIndex, images.length, onIndexChange]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.1)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.1, z - 0.1)), []);
  const zoomFit = useCallback(() => setZoom(autoFitZoom), [autoFitZoom]);

  // Export single image
  const exportSingle = useCallback(async () => {
    if (!canvasRef.current || exporting) return;

    setSelectedFieldId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);

    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: canvasSettings.backgroundColor,
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = `pastev-${currentIndex + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setZoom(originalZoom);
    }
  }, [canvasSettings.backgroundColor, currentIndex, exporting, zoom]);

  // Export all images as ZIP
  const exportAll = useCallback(async () => {
    if (exporting) return;

    setSelectedFieldId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);
    setExportProgress(0);

    const originalIndex = currentIndex;

    try {
      const zip = new JSZip();
      const folder = zip.folder('pastev-export');

      for (let i = 0; i < images.length; i++) {
        setExportProgress(Math.round((i / images.length) * 100));
        onIndexChange(i);
        await new Promise((resolve) => setTimeout(resolve, 150));

        if (!canvasRef.current) continue;

        const canvas = await html2canvas(canvasRef.current, {
          backgroundColor: canvasSettings.backgroundColor,
          scale: 2,
          useCORS: true,
        });

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        folder?.file(`image-${String(i + 1).padStart(2, '0')}.png`, blob);
      }

      setExportProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.download = `pastev-export-${Date.now()}.zip`;
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
  }, [canvasSettings.backgroundColor, currentIndex, exporting, images.length, onIndexChange, zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Arrow keys for selected field position
      if (selectedFieldId && onFieldsChange) {
        const field = fields.find((f) => f.id === selectedFieldId);
        if (field && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          switch (e.key) {
            case 'ArrowUp': updateField(selectedFieldId, { y: Math.max(0, field.y - step) }); break;
            case 'ArrowDown': updateField(selectedFieldId, { y: field.y + step }); break;
            case 'ArrowLeft': updateField(selectedFieldId, { x: Math.max(0, field.x - step) }); break;
            case 'ArrowRight': updateField(selectedFieldId, { x: field.x + step }); break;
          }
          return;
        }
      }

      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); goToPrevious(); break;
        case 'ArrowRight': e.preventDefault(); goToNext(); break;
        case 'Escape': setSelectedFieldId(null); break;
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? exportAll() : exportSingle();
          }
          break;
        case '=':
        case '+':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomIn(); }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomOut(); }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomFit(); }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFieldId, fields, goToPrevious, goToNext, exportSingle, exportAll, updateField, onFieldsChange, zoomIn, zoomOut, zoomFit]);

  if (!currentImage) {
    return (
      <div className="preview-wrapper">
        <div className="preview-empty">
          <p>No images to preview</p>
          <button className="btn-secondary" onClick={onBack}>Back to Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-wrapper">
      {/* Top toolbar */}
      <div className="preview-toolbar">
        <div className="toolbar-left">
          <h2>Preview</h2>
          {onFieldsChange && (
            <span className="edit-hint">Click to select, drag to move</span>
          )}
        </div>

        <div className="toolbar-center">
          <button className="nav-btn" onClick={goToPrevious} disabled={currentIndex === 0}>
            &#8592;
          </button>

          <div className="page-indicator">
            <span className="page-current">{currentIndex + 1}</span>
            <span className="page-separator">/</span>
            <span className="page-total">{images.length}</span>
          </div>

          <button className="nav-btn" onClick={goToNext} disabled={currentIndex === images.length - 1}>
            &#8594;
          </button>
        </div>

        <div className="toolbar-right">
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={zoomOut} disabled={zoom <= 0.1}>-</button>
            <span className="zoom-level" onClick={zoomFit} title="Click to fit">
              {Math.round(zoom * 100)}%
            </span>
            <button className="zoom-btn" onClick={zoomIn} disabled={zoom >= 3}>+</button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="preview-content">
        {/* Canvas area */}
        <div className="canvas-area" ref={canvasAreaRef}>
          <div
            className="canvas-zoom-wrapper"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <div
              ref={canvasRef}
              className="preview-canvas"
              style={{
                width: canvasSettings.width,
                height: canvasSettings.height,
                backgroundColor: canvasSettings.backgroundColor,
                backgroundImage: canvasSettings.backgroundImage ? `url(${canvasSettings.backgroundImage})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
              }}
              onClick={handleCanvasClick}
            >
              {fields.map((field) => {
                const content = currentImage.fields[field.id];
                if (!content?.translated) return null;

                const isSelected = field.id === selectedFieldId;

                return (
                  <div
                    key={field.id}
                    className={`preview-field ${isSelected ? 'selected' : ''} ${onFieldsChange ? 'editable' : ''}`}
                    style={{
                      position: 'absolute',
                      left: field.x,
                      top: field.y,
                      width: field.width,
                      fontSize: field.fontSize,
                      fontWeight: field.fontWeight,
                      color: field.color,
                      textAlign: field.textAlign,
                      lineHeight: field.lineHeight || 1.4,
                      fontFamily: field.fontFamily || '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                      cursor: onFieldsChange && !isResizing ? 'move' : 'default',
                    }}
                    onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                  >
                    {content.translated}

                    {isSelected && onFieldsChange && (
                      <div
                        className="resize-handle resize-handle-se"
                        onMouseDown={handleResizeMouseDown}
                        title="Drag to resize and scale font"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="preview-sidebar">
          {/* Original thumbnail */}
          <div className="sidebar-section">
            <h3>Original</h3>
            <div className="original-thumbnail">
              <img src={currentImage.originalImage} alt={`Original ${currentIndex + 1}`} />
            </div>
          </div>

          {/* Canvas Settings */}
          {onCanvasSettingsChange && (
            <div className="sidebar-section">
              <h3>Canvas Settings</h3>
              <div className="field-settings">
                <div className="setting-row">
                  <label>Width</label>
                  <input
                    type="number"
                    value={canvasSettings.width}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, width: Number(e.target.value) })}
                  />
                </div>
                <div className="setting-row">
                  <label>Height</label>
                  <input
                    type="number"
                    value={canvasSettings.height}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, height: Number(e.target.value) })}
                  />
                </div>
                <div className="setting-row">
                  <label>Background</label>
                  <input
                    type="color"
                    value={canvasSettings.backgroundColor}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, backgroundColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Field settings (when selected) */}
          {selectedField && onFieldsChange && (
            <div className="sidebar-section field-settings">
              <h3>{selectedField.name}</h3>

              <div className="setting-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedField.x}
                  onChange={(e) => updateField(selectedField.id, { x: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedField.y}
                  onChange={(e) => updateField(selectedField.id, { y: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Width</label>
                <input
                  type="number"
                  value={selectedField.width}
                  onChange={(e) => updateField(selectedField.id, { width: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Font Size</label>
                <input
                  type="number"
                  value={selectedField.fontSize}
                  min={8}
                  max={200}
                  onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Weight</label>
                <select
                  value={selectedField.fontWeight}
                  onChange={(e) => updateField(selectedField.id, { fontWeight: e.target.value as FieldTemplate['fontWeight'] })}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="300">Light</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi Bold</option>
                  <option value="700">Bold</option>
                  <option value="800">Extra Bold</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Color</label>
                <input
                  type="color"
                  value={selectedField.color}
                  onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <label>Align</label>
                <div className="align-buttons">
                  <button
                    className={selectedField.textAlign === 'left' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'left' })}
                  >L</button>
                  <button
                    className={selectedField.textAlign === 'center' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'center' })}
                  >C</button>
                  <button
                    className={selectedField.textAlign === 'right' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'right' })}
                  >R</button>
                </div>
              </div>

              <p className="setting-hint">
                Arrow: move 1px | Shift+Arrow: 10px<br />
                Drag corner: resize + font scale
              </p>
            </div>
          )}

          {/* Field preview list */}
          {!selectedField && (
            <div className="sidebar-section">
              <h3>Fields</h3>
              <div className="field-preview-list">
                {fields.map((field) => {
                  const content = currentImage.fields[field.id];
                  return (
                    <div
                      key={field.id}
                      className="field-preview-item clickable"
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <span className="field-preview-label">{field.name}</span>
                      <span className="field-preview-content">
                        {content?.translated || <em className="no-content">(empty)</em>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="preview-actions">
        <button className="btn-back" onClick={onBack}>
          &#8592; Back
        </button>

        <div className="export-buttons">
          <ExportButton
            type="single"
            onClick={exportSingle}
            loading={exporting && exportProgress === 0}
          />
          <ExportButton
            type="all"
            onClick={exportAll}
            loading={exporting && exportProgress > 0}
            count={images.length}
            progress={exportProgress}
          />
        </div>
      </div>
    </div>
  );
};

export default Preview;
