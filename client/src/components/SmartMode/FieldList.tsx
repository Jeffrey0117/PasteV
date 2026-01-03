import React, { useState, useCallback, useRef } from 'react';
import type { FieldTemplate } from '../../types';

interface FieldListProps {
  /** List of field templates */
  fields: FieldTemplate[];

  /** Currently selected field ID */
  selectedFieldId: string | null;

  /** Callback when a field is selected */
  onSelectField: (fieldId: string) => void;

  /** Callback to add a new field */
  onAddField: () => void;

  /** Callback to delete a field */
  onDeleteField: (fieldId: string) => void;

  /** Callback to reorder fields via drag and drop */
  onReorderFields: (fromIndex: number, toIndex: number) => void;
}

/**
 * FieldList - Displays a list of field templates with drag-and-drop reordering
 * Allows selecting, deleting, and reordering fields
 */
export function FieldList({
  fields,
  selectedFieldId,
  onSelectField,
  onAddField,
  onDeleteField,
  onReorderFields,
}: FieldListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      dragStartIndexRef.current = index;
      setDraggedIndex(index);

      // Add a slight delay to apply dragging style
      requestAnimationFrame(() => {
        setDraggedIndex(index);
      });
    },
    []
  );

  // Handle drag over
  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggedIndex !== null && index !== draggedIndex) {
        setDragOverIndex(index);
      }
    },
    [draggedIndex]
  );

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();

      const fromIndex = dragStartIndexRef.current;
      if (fromIndex !== null && fromIndex !== targetIndex) {
        onReorderFields(fromIndex, targetIndex);
      }

      setDraggedIndex(null);
      setDragOverIndex(null);
      dragStartIndexRef.current = null;
    },
    [onReorderFields]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragStartIndexRef.current = null;
  }, []);

  // Handle delete click with confirmation
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, fieldId: string, fieldName: string) => {
      e.stopPropagation();
      // Simple confirmation
      if (window.confirm(`Delete field "${fieldName}"?`)) {
        onDeleteField(fieldId);
      }
    },
    [onDeleteField]
  );

  // Get font weight display text
  const getFontWeightText = (weight: FieldTemplate['fontWeight']) => {
    switch (weight) {
      case 'normal':
        return 'Normal';
      case 'bold':
        return 'Bold';
      default:
        return weight;
    }
  };

  return (
    <div className="field-list">
      <div className="field-list-header">
        <h4>Fields</h4>
        <button className="field-add-btn" onClick={onAddField} title="Add Field">
          +
        </button>
      </div>

      <div className="field-list-items">
        {fields.length === 0 ? (
          <div className="field-list-empty">
            <p>No fields defined</p>
            <button className="field-add-empty-btn" onClick={onAddField}>
              + Add First Field
            </button>
          </div>
        ) : (
          fields.map((field, index) => (
            <div
              key={field.id}
              className={`field-list-item ${
                selectedFieldId === field.id ? 'selected' : ''
              } ${draggedIndex === index ? 'dragging' : ''} ${
                dragOverIndex === index ? 'drag-over' : ''
              }`}
              onClick={() => onSelectField(field.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag handle */}
              <div className="field-list-drag-handle" title="Drag to reorder">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path
                    fill="currentColor"
                    d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"
                  />
                </svg>
              </div>

              {/* Field info */}
              <div className="field-list-info">
                <div className="field-list-name">
                  <span className="field-list-index">{index + 1}.</span>
                  {field.name}
                </div>
                <div className="field-list-meta">
                  <span
                    className="field-list-color"
                    style={{ backgroundColor: field.color }}
                    title={field.color}
                  />
                  <span>{field.fontSize}px</span>
                  <span>{getFontWeightText(field.fontWeight)}</span>
                </div>
              </div>

              {/* Delete button */}
              <button
                className="field-list-delete-btn"
                onClick={(e) => handleDeleteClick(e, field.id, field.name)}
                title="Delete field"
              >
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {fields.length > 0 && (
        <button className="field-add-more-btn" onClick={onAddField}>
          + Add Field
        </button>
      )}
    </div>
  );
}

export default FieldList;
