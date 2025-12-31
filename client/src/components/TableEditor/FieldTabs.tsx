import React, { useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import type { FieldTemplate } from '../../types';

/**
 * FieldTabs Props
 */
export interface FieldTabsProps {
  /** Available fields */
  fields: FieldTemplate[];
  /** Currently active field ID */
  activeFieldId: string;
  /** Field selection handler */
  onSelect: (fieldId: string) => void;
}

/**
 * FieldTabs - Tab bar for switching between fields
 *
 * Displays a horizontal tab bar showing all available fields.
 * Active field is highlighted with primary color.
 * Supports keyboard navigation with arrow keys.
 */
export const FieldTabs: React.FC<FieldTabsProps> = ({
  fields,
  activeFieldId,
  onSelect,
}) => {
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>, currentIndex: number) => {
    let newIndex = currentIndex;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : fields.length - 1;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = currentIndex < fields.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === 'Home') {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      newIndex = fields.length - 1;
    }

    if (newIndex !== currentIndex && fields[newIndex]) {
      onSelect(fields[newIndex].id);
    }
  }, [fields, onSelect]);

  if (fields.length === 0) {
    return (
      <div className="field-tabs">
        <div className="field-tabs-empty">No fields defined</div>
      </div>
    );
  }

  return (
    <div className="field-tabs" role="tablist" aria-label="Field tabs">
      {fields.map((field, index) => {
        const isActive = field.id === activeFieldId;
        return (
          <div
            key={field.id}
            className={`field-tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`field-panel-${field.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(field.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {field.name}
          </div>
        );
      })}
    </div>
  );
};

export default FieldTabs;
