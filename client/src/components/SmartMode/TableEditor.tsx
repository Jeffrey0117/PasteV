import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import type { ImageData, FieldTemplate, FieldContent } from '../../types';
import './TableEditor.css';

/**
 * TableEditor Props
 */
export interface TableEditorProps {
  /** All images */
  images: ImageData[];
  /** Field templates */
  fields: FieldTemplate[];
  /** Currently active field ID */
  activeFieldId: string;
  /** Field change handler */
  onActiveFieldChange: (fieldId: string) => void;
  /** Content change handler */
  onContentChange: (imageId: string, fieldId: string, content: FieldContent) => void;
  /** Translate single field handler */
  onTranslateField: (fieldId: string) => Promise<void>;
  /** Translate all fields handler */
  onTranslateAll: () => Promise<void>;
  /** Translation loading state */
  isTranslating: boolean;
}

/** Row data for the table */
interface RowData {
  imageId: string;
  thumbnail: string;
  original: string;
  translated: string;
}

/**
 * FieldTabs - Tab bar for switching between fields
 */
interface FieldTabsProps {
  fields: FieldTemplate[];
  activeFieldId: string;
  onSelect: (fieldId: string) => void;
}

const FieldTabs: React.FC<FieldTabsProps> = ({ fields, activeFieldId, onSelect }) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, currentIndex: number) => {
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
    },
    [fields, onSelect]
  );

  if (fields.length === 0) {
    return (
      <div className="sm-field-tabs">
        <div className="sm-field-tabs-empty">尚未定義欄位</div>
      </div>
    );
  }

  return (
    <div className="sm-field-tabs" role="tablist" aria-label="欄位切換">
      {fields.map((field, index) => {
        const isActive = field.id === activeFieldId;
        return (
          <div
            key={field.id}
            className={`sm-field-tab ${isActive ? 'active' : ''}`}
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

/**
 * EditableCell - Editable table cell component
 */
interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onTranslateCell?: () => void;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onChange,
  placeholder = '',
  multiline = true,
  onNavigate,
  onTranslateCell,
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    },
    [multiline, handleBlur, onNavigate, onTranslateCell, editValue.length, value]
  );

  return (
    <div className={`sm-editable-cell ${isEditing ? 'editing' : ''}`} onClick={handleClick}>
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
        <div className="sm-cell-display">
          {value || <span className="sm-cell-placeholder">{placeholder}</span>}
        </div>
      )}
    </div>
  );
};

/**
 * TableEditor - Main table editing component for Smart Mode
 *
 * Features:
 * - Field tab switching
 * - Table view with thumbnail, original, and translated columns
 * - Editable cells for original and translated text
 * - Single field translation button
 * - Translate all button
 * - Keyboard navigation support
 * - Loading state during translation
 */
export const TableEditor: React.FC<TableEditorProps> = ({
  images,
  fields,
  activeFieldId,
  onActiveFieldChange,
  onContentChange,
  onTranslateField,
  onTranslateAll,
  isTranslating,
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Get active field info
  const activeField = useMemo(() => {
    return fields.find((f) => f.id === activeFieldId);
  }, [fields, activeFieldId]);

  // Transform images data for the current field
  const tableData: RowData[] = useMemo(() => {
    return images.map((img) => ({
      imageId: img.id,
      thumbnail: img.originalImage,
      original: img.fields[activeFieldId]?.original || '',
      translated: img.fields[activeFieldId]?.translated || '',
    }));
  }, [images, activeFieldId]);

  // Count untranslated items in current field
  const untranslatedCount = useMemo(() => {
    return tableData.filter((row) => row.original && !row.translated).length;
  }, [tableData]);

  // Count total untranslated across all fields
  const totalUntranslated = useMemo(() => {
    let count = 0;
    fields.forEach((field) => {
      images.forEach((img) => {
        const content = img.fields[field.id];
        if (content?.original && !content?.translated) {
          count++;
        }
      });
    });
    return count;
  }, [fields, images]);

  // Handle cell content change
  const handleCellChange = useCallback(
    (imageId: string, type: 'original' | 'translated', value: string) => {
      const currentImage = images.find((img) => img.id === imageId);
      const currentContent = currentImage?.fields[activeFieldId] || { original: '', translated: '' };

      onContentChange(imageId, activeFieldId, {
        original: type === 'original' ? value : currentContent.original,
        translated: type === 'translated' ? value : currentContent.translated,
      });
    },
    [images, activeFieldId, onContentChange]
  );

  // Handle translate current field
  const handleTranslateField = useCallback(async () => {
    if (isTranslating) return;
    await onTranslateField(activeFieldId);
  }, [isTranslating, onTranslateField, activeFieldId]);

  // Handle translate all
  const handleTranslateAll = useCallback(async () => {
    if (isTranslating) return;
    await onTranslateAll();
  }, [isTranslating, onTranslateAll]);

  // Keyboard navigation handler
  const handleNavigate = useCallback(
    (rowIndex: number, columnType: 'original' | 'translated', direction: 'up' | 'down' | 'left' | 'right') => {
      let newRowIndex = rowIndex;
      let newColumnType = columnType;

      switch (direction) {
        case 'up':
          newRowIndex = Math.max(0, rowIndex - 1);
          break;
        case 'down':
          newRowIndex = Math.min(tableData.length - 1, rowIndex + 1);
          break;
        case 'left':
          if (columnType === 'translated') {
            newColumnType = 'original';
          } else if (rowIndex > 0) {
            newRowIndex = rowIndex - 1;
            newColumnType = 'translated';
          }
          break;
        case 'right':
          if (columnType === 'original') {
            newColumnType = 'translated';
          } else if (rowIndex < tableData.length - 1) {
            newRowIndex = rowIndex + 1;
            newColumnType = 'original';
          }
          break;
      }

      // Focus the target cell
      const targetKey = `${tableData[newRowIndex]?.imageId}-${newColumnType}`;
      const targetCell = cellRefs.current.get(targetKey);
      if (targetCell) {
        targetCell.click();
      }
    },
    [tableData]
  );

  // Register cell ref
  const registerCellRef = useCallback((imageId: string, type: string, element: HTMLElement | null) => {
    const key = `${imageId}-${type}`;
    if (element) {
      cellRefs.current.set(key, element);
    } else {
      cellRefs.current.delete(key);
    }
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+T: Translate current field
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        handleTranslateField();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTranslateField]);

  // Get image src with data URL prefix
  const getImageSrc = (base64: string): string => {
    if (!base64) return '';
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  };

  return (
    <div className="sm-table-editor">
      {/* Field Tabs */}
      <FieldTabs fields={fields} activeFieldId={activeFieldId} onSelect={onActiveFieldChange} />

      {/* Field Header */}
      <div className="sm-table-editor-header">
        <div className="sm-field-info">
          <span className="sm-field-label">當前欄位：</span>
          <span className="sm-field-name">{activeField?.name || '未知'}</span>
          {untranslatedCount > 0 && (
            <span className="sm-untranslated-badge">{untranslatedCount} 待翻譯</span>
          )}
        </div>
        <button
          className="btn primary sm-translate-field-btn"
          onClick={handleTranslateField}
          disabled={isTranslating || untranslatedCount === 0}
        >
          {isTranslating ? '翻譯中...' : '翻譯此欄位所有內容'}
        </button>
      </div>

      {/* Data Table */}
      <div className="sm-table-container">
        <table className="sm-data-table" ref={tableRef}>
          <thead>
            <tr>
              <th className="sm-thumbnail-header">圖片</th>
              <th className="sm-content-header">英文原文</th>
              <th className="sm-content-header">中文翻譯</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={3} className="sm-empty-row">
                  尚無圖片可顯示
                </td>
              </tr>
            ) : (
              tableData.map((row, rowIndex) => (
                <tr key={row.imageId}>
                  {/* Thumbnail */}
                  <td className="sm-thumbnail-cell">
                    <div className="sm-thumbnail-wrapper">
                      <img src={getImageSrc(row.thumbnail)} alt={`圖片 ${rowIndex + 1}`} loading="lazy" />
                      <span className="sm-thumbnail-number">{rowIndex + 1}</span>
                    </div>
                  </td>

                  {/* Original Text */}
                  <td className="sm-content-cell" ref={(el) => registerCellRef(row.imageId, 'original', el)}>
                    <EditableCell
                      value={row.original}
                      onChange={(value) => handleCellChange(row.imageId, 'original', value)}
                      placeholder="輸入原文..."
                      multiline={true}
                      onNavigate={(dir) => handleNavigate(rowIndex, 'original', dir)}
                    />
                  </td>

                  {/* Translated Text */}
                  <td className="sm-content-cell" ref={(el) => registerCellRef(row.imageId, 'translated', el)}>
                    <EditableCell
                      value={row.translated}
                      onChange={(value) => handleCellChange(row.imageId, 'translated', value)}
                      placeholder="輸入翻譯..."
                      multiline={true}
                      onNavigate={(dir) => handleNavigate(rowIndex, 'translated', dir)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Actions */}
      <div className="sm-table-editor-footer">
        <button
          className="btn primary sm-translate-all-btn"
          onClick={handleTranslateAll}
          disabled={isTranslating || totalUntranslated === 0}
        >
          {isTranslating ? (
            <>
              <span className="sm-spinner-small"></span>
              翻譯中...
            </>
          ) : (
            `翻譯全部欄位 (${totalUntranslated})`
          )}
        </button>

        <div className="sm-keyboard-hints">
          <span className="sm-hint">Tab: 下一個儲存格</span>
          <span className="sm-hint">Shift+Tab: 上一個儲存格</span>
          <span className="sm-hint">Ctrl+Shift+T: 翻譯當前欄位</span>
        </div>
      </div>
    </div>
  );
};

export default TableEditor;
