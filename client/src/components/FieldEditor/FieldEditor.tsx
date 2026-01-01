import React, { useCallback, useEffect, useRef } from 'react';
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

  // Get selected field
  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  // Handle add new field
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
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, x, y } : f)));
    },
    [fields, onFieldsChange]
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
      onFieldsChange(fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    },
    [fields, onFieldsChange]
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
          <h3>Field Definition</h3>
          <span className="field-editor-canvas-hint">
            Click and drag to position fields
          </span>
        </div>

        <div className="field-editor-canvas-wrapper">
          <div
            ref={canvasRef}
            className="field-editor-canvas"
            style={{
              width: canvasSettings.width,
              height: canvasSettings.height,
              backgroundImage: image?.originalImage
                ? `url(${image.originalImage})`
                : undefined,
              backgroundColor: canvasSettings.backgroundColor,
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
                onUpdate={(updates) => handleFieldUpdate(field.id, updates)}
                canvasBounds={{
                  width: canvasSettings.width,
                  height: canvasSettings.height,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <div className="field-editor-panel">
        {/* Field List Section */}
        <h3>Fields</h3>
        <FieldList
          fields={fields}
          selectedFieldId={selectedFieldId}
          onSelectField={onSelectField}
          onAddField={handleAddField}
          onDeleteField={handleDeleteField}
          onReorderFields={handleReorderFields}
        />

        {/* Field Settings Section */}
        <h3>Selected Field Settings</h3>
        {selectedField ? (
          <div className="field-settings">
            {/* Name */}
            <div className="field-settings-row">
              <label>Name</label>
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
              <label>Width</label>
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
              <label>Size</label>
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
              <label>Weight</label>
              <select
                value={selectedField.fontWeight}
                onChange={(e) =>
                  handleFieldUpdate(selectedField.id, {
                    fontWeight: e.target.value as FieldTemplate['fontWeight'],
                  })
                }
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="300">300</option>
                <option value="400">400</option>
                <option value="500">500</option>
                <option value="600">600</option>
                <option value="700">700</option>
                <option value="800">800</option>
                <option value="900">900</option>
              </select>
            </div>

            {/* Color */}
            <div className="field-settings-row">
              <label>Color</label>
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
              <label>Align</label>
              <div className="field-settings-align">
                <button
                  className={selectedField.textAlign === 'left' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'left' })
                  }
                >
                  Left
                </button>
                <button
                  className={selectedField.textAlign === 'center' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'center' })
                  }
                >
                  Center
                </button>
                <button
                  className={selectedField.textAlign === 'right' ? 'active' : ''}
                  onClick={() =>
                    handleFieldUpdate(selectedField.id, { textAlign: 'right' })
                  }
                >
                  Right
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="field-settings-empty">
            Select a field to edit its settings
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div className="field-editor-shortcuts">
          <div className="field-editor-shortcuts-title">Keyboard Shortcuts</div>
          <div className="field-editor-shortcuts-list">
            <span className="field-editor-shortcut-item">
              <kbd>Arrow</kbd> Move 1px
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Shift+Arrow</kbd> Move 10px
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Delete</kbd> Remove
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Ctrl+D</kbd> Duplicate
            </span>
            <span className="field-editor-shortcut-item">
              <kbd>Esc</kbd> Deselect
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
