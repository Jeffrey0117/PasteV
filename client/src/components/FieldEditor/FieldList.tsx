import React, { useState, useCallback, useRef } from 'react';
import type { FieldTemplate } from '../../types';

interface FieldListProps {
  fields: FieldTemplate[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onAddField: () => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
}

/**
 * FieldList - Displays all fields with drag-to-reorder support
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
  const draggedItemRef = useRef<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    draggedItemRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = draggedItemRef.current;

      if (fromIndex !== null && fromIndex !== toIndex) {
        onReorderFields(fromIndex, toIndex);
      }

      setDraggedIndex(null);
      setDragOverIndex(null);
      draggedItemRef.current = null;
    },
    [onReorderFields]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedItemRef.current = null;
  }, []);

  // Format field info text
  const formatFieldInfo = (field: FieldTemplate) => {
    const weight = field.fontWeight === 'bold' || Number(field.fontWeight) >= 600 ? 'Bold' : 'Normal';
    return `${field.fontSize}px ${weight} | ${field.textAlign}`;
  };

  return (
    <div className="field-list">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className={`field-list-item ${
            selectedFieldId === field.id ? 'selected' : ''
          } ${draggedIndex === index ? 'dragging' : ''} ${
            dragOverIndex === index ? 'drag-over' : ''
          }`}
          draggable
          onClick={() => onSelectField(field.id)}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
        >
          {/* Drag handle */}
          <div className="field-list-item-drag-handle" title="Drag to reorder">
            &#x2630;
          </div>

          {/* Field content */}
          <div className="field-list-item-content">
            <div className="field-list-item-name">
              {index + 1}. {field.name}
            </div>
            <div className="field-list-item-info">{formatFieldInfo(field)}</div>
          </div>

          {/* Delete button */}
          <button
            className="field-list-item-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteField(field.id);
            }}
            title="Delete field"
          >
            &times;
          </button>
        </div>
      ))}

      {/* Add field button */}
      <button className="field-list-add-btn" onClick={onAddField}>
        + Add Field
      </button>
    </div>
  );
}
