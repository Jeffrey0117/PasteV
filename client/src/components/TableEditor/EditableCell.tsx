import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * EditableCell Props
 */
export interface EditableCellProps {
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Enable multiline editing */
  multiline?: boolean;
  /** Row index for keyboard navigation */
  rowIndex?: number;
  /** Column type for keyboard navigation */
  columnType?: 'original' | 'translated';
  /** Navigate to another cell */
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /** Translate current cell */
  onTranslateCell?: () => void;
}

/**
 * EditableCell - Editable table cell component
 *
 * Features:
 * - Click to edit mode
 * - Auto-save on blur
 * - Multiline support (textarea)
 * - Enter to submit, Shift+Enter for new line
 * - Keyboard navigation support
 */
export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onChange,
  placeholder = '',
  multiline = true,
  onNavigate,
  onTranslateCell,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Auto-focus and select all when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editValue, isEditing]);

  const handleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editValue !== value) {
      onChange(editValue);
    }
  }, [editValue, value, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter: Translate current cell
    if (e.ctrlKey && e.key === 'Enter' && onTranslateCell) {
      e.preventDefault();
      onTranslateCell();
      return;
    }

    // Enter: Submit (unless multiline with Shift)
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      handleBlur();
      return;
    }

    // Tab: Navigate to next/prev cell
    if (e.key === 'Tab') {
      e.preventDefault();
      handleBlur();
      if (onNavigate) {
        onNavigate(e.shiftKey ? 'left' : 'right');
      }
      return;
    }

    // Arrow keys for navigation (when at boundaries)
    if (onNavigate) {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      const isAtStart = selectionStart === 0 && selectionEnd === 0;
      const isAtEnd = selectionStart === editValue.length && selectionEnd === editValue.length;

      if (e.key === 'ArrowUp' && isAtStart) {
        e.preventDefault();
        handleBlur();
        onNavigate('up');
        return;
      }

      if (e.key === 'ArrowDown' && isAtEnd) {
        e.preventDefault();
        handleBlur();
        onNavigate('down');
        return;
      }
    }

    // Escape: Cancel editing
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(value);
      setIsEditing(false);
    }
  }, [multiline, handleBlur, onNavigate, onTranslateCell, editValue.length, value]);

  return (
    <div
      className={`editable-cell ${isEditing ? 'editing' : ''}`}
      onClick={handleClick}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />
      ) : (
        <div className="cell-display">
          {value || <span className="cell-placeholder">{placeholder}</span>}
        </div>
      )}
    </div>
  );
};

export default EditableCell;
