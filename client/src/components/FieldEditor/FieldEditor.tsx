import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldTemplate, ImageData, CanvasSettings } from '../../types';
import { generateId } from '../../types';
import { FieldItem } from './FieldItem';
import { FieldList } from './FieldList';
import './FieldEditor.css';

interface FieldEditorProps {
  /** First image for background reference */
  image: ImageData;

  /** Field template list */
  fields: FieldTemplate[];

  /** Field change callback */
  onFieldsChange: (fields: FieldTemplate[]) => void;

  /** Selected field ID */
  selectedFieldId: string | null;

  /** Selection change callback */
  onSelectField: (fieldId: string | null) => void;

  /** Canvas settings */
  canvasSettings: CanvasSettings;
}

/**
 * FieldEditor - Main component for defining field positions and styles
 */
export function FieldEditor({
  image,
  fields,
  onFieldsChange,
  selectedFieldId,
  onSelectField,
  canvasSettings,
}: FieldEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [autoFitZoom, setAutoFitZoom] = useState(1);

  // Calculate auto-fit zoom when wrapper size or canvas size changes
  useEffect(() => {
    const calculateAutoFit = () => {
      if (!wrapperRef.current) return;
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const availableWidth = wrapperRect.width - 32; // padding
      const availableHeight = wrapperRect.height - 32;

      const scaleX = availableWidth / canvasSettings.width;
      const scaleY = availableHeight / canvasSettings.height;
      const fitZoom = Math.min(scaleX, scaleY, 1); // Don't go above 100%

      setAutoFitZoom(Math.max(0.1, fitZoom));
      setZoom(Math.max(0.1, fitZoom));
    };

    calculateAutoFit();
    window.addEventListener('resize', calculateAutoFit);
    return () => window.removeEventListener('resize', calculateAutoFit);
  }, [canvasSettings.width, canvasSettings.height]);

  // Clamp field positions when canvas size changes or fields go outside bounds
  useEffect(() => {
    const clampedFields = fields.map((field) => {
      const maxX = Math.max(0, canvasSettings.width - 50);
      const maxY = Math.max(0, canvasSettings.height - 30);
      const clampedX = Math.max(0, Math.min(field.x, maxX));
      const clampedY = Math.max(0, Math.min(field.y, maxY));

      if (field.x !== clampedX || field.y !== clampedY) {
        return { ...field, x: clampedX, y: clampedY };
      }
      return field;
    });

    // Only update if any field was clamped
    const needsUpdate = clampedFields.some((f, i) =>
      f.x !== fields[i].x || f.y !== fields[i].y
    );

    if (needsUpdate) {
      onFieldsChange(clampedFields);
    }
  }, [canvasSettings.width, canvasSettings.height, fields, onFieldsChange]);

  // Get selected field
  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // Handle add new field
  const handleAddField = useCallback(() => {
    // Calculate position ensuring it stays within canvas bounds
    const baseY = 50 + fields.length * 80;
    const maxX = Math.max(0, canvasSettings.width - 300 - 50); // width of field + padding
    const maxY = Math.max(0, canvasSettings.height - 30);

    const newField: FieldTemplate = {
      id: generateId('field'),
      name: `欄位 ${fields.length + 1}`,
      x: Math.min(50, maxX),
      y: Math.min(baseY, maxY),
      width: Math.min(300, canvasSettings.width - 50),
      fontSize: 20,
      fontWeight: 'normal',
      color: '#ffffff',
      textAlign: 'left',
    };

    onFieldsChange([...fields, newField]);
    onSelectField(newField.id);
  }, [fields, onFieldsChange, onSelectField, canvasSettings.width, canvasSettings.height]);

  // Handle delete field
  const handleDeleteField = useCallback(
    (fieldId: string) => {
      onFieldsChange(fields.filter((f) => f.id !== fieldId));
      if (selectedFieldId === fieldId) {
        onSelectField(null);
      }
    },
    [fields, onFieldsChange, selectedFieldId, onSelectField]
  );

  // Handle reorder fields
  const handleReorderFields = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newFields = [...fields];
      const [movedField] = newFields.splice(fromIndex, 1);
      newFields.splice(toIndex, 0, movedField);
      onFieldsChange(newFields);
    },
    [fields, onFieldsChange]
  );

  // Handle field drag (position change)
  const handleFieldDrag = useCallback(
    (fieldId: string, x: number, y: number) => {
      // Clamp position within canvas bounds
      const clampedX = Math.max(0, Math.min(x, canvasSettings.width - 50));
      const clampedY = Math.max(0, Math.min(y, canvasSettings.height - 30));
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, x: clampedX, y: clampedY } : f)));
    },
    [fields, onFieldsChange, canvasSettings.width, canvasSettings.height]
  );

  // Handle field resize (width change)
  const handleFieldResize = useCallback(
    (fieldId: string, width: number) => {
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, width } : f)));
    },
    [fields, onFieldsChange]
  );

  // Handle field style update
  const handleFieldUpdate = useCallback(
    (fieldId: string, updates: Partial<FieldTemplate>) => {
      // Clamp position values if they're being updated
      const clampedUpdates = { ...updates };
      if (clampedUpdates.x !== undefined) {
        clampedUpdates.x = Math.max(0, Math.min(clampedUpdates.x, canvasSettings.width - 50));
      }
      if (clampedUpdates.y !== undefined) {
        clampedUpdates.y = Math.max(0, Math.min(clampedUpdates.y, canvasSettings.height - 30));
      }
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, ...clampedUpdates } : f)));
    },
    [fields, onFieldsChange, canvasSettings.width, canvasSettings.height]
  );

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        onSelectField(null);
      }
    },
    [onSelectField]
  );

  // Zoom controls - allow down to 10% for very large canvases
  const zoomIn = useCallback(() => setZoom((z) => Math.min(2, z + 0.1)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.1, z - 0.1)), []);
  const zoomFit = useCallback(() => setZoom(autoFitZoom), [autoFitZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when a field is selected
      if (!selectedFieldId) return;

      const field = fields.find((f) => f.id === selectedFieldId);
      if (!field) return;

      const step = e.shiftKey ? 10 : 1;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          // Don't delete if user is typing in an input
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          ) {
            return;
          }
          e.preventDefault();
          handleDeleteField(selectedFieldId);
          break;

        case 'ArrowUp':
          e.preventDefault();
          handleFieldDrag(selectedFieldId, field.x, Math.max(0, field.y - step));
          break;

        case 'ArrowDown':
          e.preventDefault();
          handleFieldDrag(
            selectedFieldId,
            field.x,
            Math.min(canvasSettings.height - 30, field.y + step)
          );
          break;

        case 'ArrowLeft':
          e.preventDefault();
          handleFieldDrag(selectedFieldId, Math.max(0, field.x - step), field.y);
          break;

        case 'ArrowRight':
          e.preventDefault();
          handleFieldDrag(
            selectedFieldId,
            Math.min(canvasSettings.width - 50, field.x + step),
            field.y
          );
          break;

        case 'Escape':
          e.preventDefault();
          onSelectField(null);
          break;

        case 'd':
        case 'D':
          // Duplicate field (Ctrl+D / Cmd+D)
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const duplicatedField: FieldTemplate = {
              ...field,
              id: generateId('field'),
              name: `${field.name} Copy`,
              x: field.x + 20,
              y: field.y + 20,
            };
            onFieldsChange([...fields, duplicatedField]);
            onSelectField(duplicatedField.id);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedFieldId,
    fields,
    canvasSettings,
    handleDeleteField,
    handleFieldDrag,
    onSelectField,
    onFieldsChange,
  ]);

  return (
    <div className="field-editor">
      {/* Canvas Area */}
      <div className="field-editor-canvas-area">
        <div className="field-editor-canvas-header">
          <h3>欄位定義</h3>
          <div className="canvas-zoom-controls">
            <button className="zoom-btn" onClick={zoomOut} disabled={zoom <= 0.1}>-</button>
            <span className="zoom-level" onClick={zoomFit} title="點擊重設縮放">
              {Math.round(zoom * 100)}%
            </span>
            <button className="zoom-btn" onClick={zoomIn} disabled={zoom >= 2}>+</button>
          </div>
        </div>
        <span className="field-editor-canvas-hint">
          點擊拖曳調整欄位位置
        </span>

        <div className="field-editor-canvas-wrapper" ref={wrapperRef}>
          <div
            className="field-editor-canvas-zoom-wrapper"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <div
              ref={canvasRef}
              className="field-editor-canvas"
              style={{
                width: canvasSettings.width,
                height: canvasSettings.height,
                backgroundColor: canvasSettings.backgroundColor,
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={handleCanvasClick}
            >
              {/* Background image */}
              {image?.originalImage && (
                <img
                  src={image.originalImage}
                  alt="Background"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}
              {fields.map((field) => (
              <FieldItem
                key={field.id}
                field={field}
                isSelected={field.id === selectedFieldId}
                onSelect={() => onSelectField(field.id)}
                onDrag={(x, y) => handleFieldDrag(field.id, x, y)}
                onResize={(width) => handleFieldResize(field.id, width)}
                onUpdate={(updates) => handleFieldUpdate(field.id, updates)}
                canvasBounds={{
                  width: canvasSettings.width,
                  height: canvasSettings.height,
                }}
                zoom={zoom}
              />
            ))}
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className="field-editor-panel">
        {/* Field List Section */}
        <h3>欄位列表</h3>
        <FieldList
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={onSelectField}
          onAddField={handleAddField}
          onDeleteField={handleDeleteField}
          onReorderFields={handleReorderFields}
        />

        {/* Field Settings Section */}
        <h3>欄位設定</h3>
        {selectedField ? (
          <div className="field-settings">
            {/* Name */}
            <div className="field-settings-row">
              <label>名稱</label>
              <input
                type="text"
                value={selectedField.name}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { name: e.target.value })
                }
              />
            </div>

            {/* Position */}
            <div className="field-settings-row">
              <label>X</label>
              <input
                type="number"
                value={selectedField.x}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { x: Number(e.target.value) })
                }
              />
              <label>Y</label>
              <input
                type="number"
                value={selectedField.y}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { y: Number(e.target.value) })
                }
              />
            </div>

            {/* Width */}
            <div className="field-settings-row">
              <label>寬度</label>
              <input
                type="number"
                value={selectedField.width}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { width: Number(e.target.value) })
                }
              />
            </div>

            {/* Font Size */}
            <div className="field-settings-row">
              <label>字型大小</label>
              <input
                type="number"
                value={selectedField.fontSize}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { fontSize: Number(e.target.value) })
                }
              />
              <span>px</span>
            </div>

            {/* Font Weight */}
            <div className="field-settings-row">
              <label>粗細</label>
              <select
                value={selectedField.fontWeight}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, {
                    fontWeight: e.target.value as FieldTemplate['fontWeight'],
                  })
                }
              >
                <option value="normal">正常</option>
                <option value="bold">粗體</option>
                <option value="300">細</option>
                <option value="500">中等</option>
                <option value="600">半粗</option>
                <option value="700">粗</option>
                <option value="800">特粗</option>
              </select>
            </div>

            {/* Color */}
            <div className="field-settings-row">
              <label>顏色</label>
              <input
                type="color"
                value={selectedField.color}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { color: e.target.value })
                }
              />
              <input
                type="text"
                value={selectedField.color}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, { color: e.target.value })
                }
                style={{ flex: 1 }}
              />
            </div>

            {/* Text Align */}
            <div className="field-settings-row">
              <label>對齊</label>
              <div className="field-settings-align">
                <button
                  className={selectedField.textAlign === 'left' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'left' })
                  }
                >
                  左
                </button>
                <button
                  className={selectedField.textAlign === 'center' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'center' })
                  }
                >
                  中
                </button>
                <button
                  className={selectedField.textAlign === 'right' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'right' })
                  }
                >
                  右
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="field-settings-empty">
            選擇欄位以編輯設定
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div className="field-editor-shortcuts">
          <div className="field-editor-shortcuts-title">快捷鍵</div>
          <div className="field-editor-shortcuts-list">
            <span className="field-editor-shortcut-item">
              <kbd>方向鍵</kbd> 移動 1px
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Shift+方向</kbd> 移動 10px
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Delete</kbd> 刪除
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Ctrl+D</kbd> 複製
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Esc</kbd> 取消選取
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
