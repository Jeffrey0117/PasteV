import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import type { ImageData, FieldTemplate, CanvasSettings } from '../../types';
import { generateId } from '../../types';
import { FieldItem } from './FieldItem';
import { FieldList } from './FieldList';
import './FieldEditor.css';

interface FieldEditorProps {
  /** The first image to use as template background */
  image: ImageData;

  /** Field template list */
  fields: FieldTemplate[];

  /** Callback when fields change */
  onFieldsChange: (fields: FieldTemplate[]) => void;

  /** Currently selected field ID */
  selectedFieldId: string | null;

  /** Callback when selection changes */
  onSelectField: (fieldId: string | null) => void;

  /** Canvas settings */
  canvasSettings: CanvasSettings;
}

/**
 * FieldEditor - Main component for defining field templates on the first image
 * Provides a visual canvas for positioning fields and a settings panel for styling
 */
export function FieldEditor({
  image,
  fields,
  onFieldsChange,
  selectedFieldId,
  onSelectField,
  canvasSettings,
}: FieldEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Get the selected field
  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) || null,
    [fields, selectedFieldId]
  );

  // Calculate scale to fit image in container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const padding = 32;
      const availableWidth = containerRect.width - padding;
      const availableHeight = containerRect.height - padding;

      const scaleX = availableWidth / image.width;
      const scaleY = availableHeight / image.height;
      const newScale = Math.min(scaleX, scaleY, 1);

      setScale(newScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [image.width, image.height]);

  // Canvas bounds for dragging constraints
  const canvasBounds = useMemo(
    () => ({
      width: canvasSettings.width || image.width,
      height: canvasSettings.height || image.height,
    }),
    [canvasSettings.width, canvasSettings.height, image.width, image.height]
  );

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        onSelectField(null);
      }
    },
    [onSelectField]
  );

  // Update a specific field
  const updateField = useCallback(
    (fieldId: string, updates: Partial<FieldTemplate>) => {
      const newFields = fields.map((field) =>
        field.id === fieldId ? { ...field, ...updates } : field
      );
      onFieldsChange(newFields);
    },
    [fields, onFieldsChange]
  );

  // Handle field drag
  const handleFieldDrag = useCallback(
    (fieldId: string, x: number, y: number) => {
      updateField(fieldId, { x, y });
    },
    [updateField]
  );

  // Handle field resize (width only for text fields)
  const handleFieldResize = useCallback(
    (fieldId: string, width: number) => {
      updateField(fieldId, { width });
    },
    [updateField]
  );

  // Add new field
  const handleAddField = useCallback(() => {
    const newField: FieldTemplate = {
      id: generateId('field'),
      name: `Field ${fields.length + 1}`,
      x: 50,
      y: 50 + fields.length * 60,
      width: 300,
      fontSize: 20,
      fontWeight: 'normal',
      color: '#ffffff',
      textAlign: 'left',
    };

    onFieldsChange([...fields, newField]);
    onSelectField(newField.id);
  }, [fields, onFieldsChange, onSelectField]);

  // Delete field
  const handleDeleteField = useCallback(
    (fieldId: string) => {
      const newFields = fields.filter((f) => f.id !== fieldId);
      onFieldsChange(newFields);
      if (selectedFieldId === fieldId) {
        onSelectField(null);
      }
    },
    [fields, onFieldsChange, selectedFieldId, onSelectField]
  );

  // Reorder fields via drag and drop
  const handleReorderFields = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newFields = [...fields];
      const [removed] = newFields.splice(fromIndex, 1);
      newFields.splice(toIndex, 0, removed);
      onFieldsChange(newFields);
    },
    [fields, onFieldsChange]
  );

  // Duplicate selected field
  const handleDuplicateField = useCallback(() => {
    if (!selectedField) return;

    const newField: FieldTemplate = {
      ...selectedField,
      id: generateId('field'),
      name: `${selectedField.name} (copy)`,
      x: selectedField.x + 20,
      y: selectedField.y + 20,
    };

    onFieldsChange([...fields, newField]);
    onSelectField(newField.id);
  }, [selectedField, fields, onFieldsChange, onSelectField]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!selectedField) return;

      const step = e.shiftKey ? 10 : 1;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          handleDeleteField(selectedField.id);
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateField(selectedField.id, {
            y: Math.max(0, selectedField.y - step),
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateField(selectedField.id, {
            y: Math.min(canvasBounds.height - 30, selectedField.y + step),
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          updateField(selectedField.id, {
            x: Math.max(0, selectedField.x - step),
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          updateField(selectedField.id, {
            x: Math.min(canvasBounds.width - 50, selectedField.x + step),
          });
          break;
        case 'Escape':
          e.preventDefault();
          onSelectField(null);
          break;
        case 'd':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleDuplicateField();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedField,
    handleDeleteField,
    updateField,
    canvasBounds,
    onSelectField,
    handleDuplicateField,
  ]);

  // Get background image src
  const backgroundImage = useMemo(() => {
    const src = image.originalImage;
    return src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
  }, [image.originalImage]);

  return (
    <div className="field-editor">
      {/* Left: Canvas Area */}
      <div className="field-editor-canvas-section">
        <div className="field-editor-canvas-header">
          <h3>Template Preview</h3>
          <span className="field-editor-scale">{Math.round(scale * 100)}%</span>
        </div>

        <div className="field-editor-canvas-wrapper" ref={containerRef}>
          <div
            ref={canvasRef}
            className="field-editor-canvas"
            style={{
              width: canvasBounds.width * scale,
              height: canvasBounds.height * scale,
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
            }}
            onClick={handleCanvasClick}
          >
            {fields.map((field) => (
              <FieldItem
                key={field.id}
                field={field}
                isSelected={field.id === selectedFieldId}
                onSelect={() => onSelectField(field.id)}
                onDrag={(x, y) => handleFieldDrag(field.id, x, y)}
                onResize={(width) => handleFieldResize(field.id, width)}
                canvasBounds={canvasBounds}
                scale={scale}
              />
            ))}
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="field-editor-shortcuts">
          <span>Arrow keys: Move</span>
          <span>Shift+Arrow: Move 10px</span>
          <span>Delete: Remove</span>
          <span>Ctrl+D: Duplicate</span>
        </div>
      </div>

      {/* Right: Field List and Settings Panel */}
      <div className="field-editor-panel">
        {/* Field List */}
        <FieldList
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={onSelectField}
          onAddField={handleAddField}
          onDeleteField={handleDeleteField}
          onReorderFields={handleReorderFields}
        />

        {/* Field Settings */}
        {selectedField && (
          <div className="field-settings">
            <h4>Field Settings</h4>

            {/* Name */}
            <div className="field-setting-group">
              <label>Name</label>
              <input
                type="text"
                value={selectedField.name}
                onChange={(e) =>
                  updateField(selectedField.id, { name: e.target.value })
                }
                className="field-input"
              />
            </div>

            {/* Position */}
            <div className="field-setting-row">
              <div className="field-setting-group">
                <label>X</label>
                <input
                  type="number"
                  value={selectedField.x}
                  onChange={(e) =>
                    updateField(selectedField.id, {
                      x: parseInt(e.target.value) || 0,
                    })
                  }
                  className="field-input field-input-number"
                />
              </div>
              <div className="field-setting-group">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedField.y}
                  onChange={(e) =>
                    updateField(selectedField.id, {
                      y: parseInt(e.target.value) || 0,
                    })
                  }
                  className="field-input field-input-number"
                />
              </div>
            </div>

            {/* Width */}
            <div className="field-setting-group">
              <label>Width</label>
              <input
                type="number"
                value={selectedField.width}
                onChange={(e) =>
                  updateField(selectedField.id, {
                    width: parseInt(e.target.value) || 100,
                  })
                }
                className="field-input field-input-number"
              />
            </div>

            {/* Font Size */}
            <div className="field-setting-group">
              <label>Font Size (px)</label>
              <input
                type="number"
                value={selectedField.fontSize}
                min={8}
                max={200}
                onChange={(e) =>
                  updateField(selectedField.id, {
                    fontSize: parseInt(e.target.value) || 16,
                  })
                }
                className="field-input field-input-number"
              />
            </div>

            {/* Font Weight */}
            <div className="field-setting-group">
              <label>Font Weight</label>
              <select
                value={selectedField.fontWeight}
                onChange={(e) =>
                  updateField(selectedField.id, {
                    fontWeight: e.target.value as FieldTemplate['fontWeight'],
                  })
                }
                className="field-select"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="100">100 - Thin</option>
                <option value="200">200 - Extra Light</option>
                <option value="300">300 - Light</option>
                <option value="400">400 - Regular</option>
                <option value="500">500 - Medium</option>
                <option value="600">600 - Semi Bold</option>
                <option value="700">700 - Bold</option>
                <option value="800">800 - Extra Bold</option>
                <option value="900">900 - Black</option>
              </select>
            </div>

            {/* Color */}
            <div className="field-setting-group">
              <label>Color</label>
              <div className="field-color-picker">
                <input
                  type="color"
                  value={selectedField.color}
                  onChange={(e) =>
                    updateField(selectedField.id, { color: e.target.value })
                  }
                  className="field-color-input"
                />
                <input
                  type="text"
                  value={selectedField.color}
                  onChange={(e) =>
                    updateField(selectedField.id, { color: e.target.value })
                  }
                  className="field-input field-color-text"
                />
              </div>
            </div>

            {/* Text Align */}
            <div className="field-setting-group">
              <label>Alignment</label>
              <div className="field-align-buttons">
                <button
                  className={`field-align-btn ${
                    selectedField.textAlign === 'left' ? 'active' : ''
                  }`}
                  onClick={() =>
                    updateField(selectedField.id, { textAlign: 'left' })
                  }
                  title="Align Left"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path
                      fill="currentColor"
                      d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z"
                    />
                  </svg>
                </button>
                <button
                  className={`field-align-btn ${
                    selectedField.textAlign === 'center' ? 'active' : ''
                  }`}
                  onClick={() =>
                    updateField(selectedField.id, { textAlign: 'center' })
                  }
                  title="Align Center"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path
                      fill="currentColor"
                      d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z"
                    />
                  </svg>
                </button>
                <button
                  className={`field-align-btn ${
                    selectedField.textAlign === 'right' ? 'active' : ''
                  }`}
                  onClick={() =>
                    updateField(selectedField.id, { textAlign: 'right' })
                  }
                  title="Align Right"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path
                      fill="currentColor"
                      d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Line Height (optional) */}
            <div className="field-setting-group">
              <label>Line Height</label>
              <input
                type="number"
                value={selectedField.lineHeight || 1.2}
                step={0.1}
                min={0.8}
                max={3}
                onChange={(e) =>
                  updateField(selectedField.id, {
                    lineHeight: parseFloat(e.target.value) || 1.2,
                  })
                }
                className="field-input field-input-number"
              />
            </div>

            {/* Font Family (optional) */}
            <div className="field-setting-group">
              <label>Font Family</label>
              <select
                value={selectedField.fontFamily || 'sans-serif'}
                onChange={(e) =>
                  updateField(selectedField.id, { fontFamily: e.target.value })
                }
                className="field-select"
              >
                <option value="sans-serif">Sans Serif</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
                <option value="Noto Sans TC">Noto Sans TC</option>
                <option value="Noto Serif TC">Noto Serif TC</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FieldEditor;
