import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { ImageData, FieldTemplate, FieldContent, CroppedImage, CanvasSettings } from '../../types';
import { FieldTabs } from './FieldTabs';
import { EditableCell } from './EditableCell';
import { ImageCropModal } from './ImageCropModal';
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
  /** Canvas settings for crop positioning */
  canvasSettings?: CanvasSettings;
  /** Handler for adding cropped image */
  onAddCroppedImage?: (imageId: string, croppedImage: CroppedImage) => void;
  /** Handler for deleting cropped image */
  onDeleteCroppedImage?: (imageId: string, cropId: string) => void;
}

/** Row data for the table */
interface RowData {
  imageId: string;
  thumbnail: string;
  original: string;
  translated: string;
  imageWidth: number;
  imageHeight: number;
  croppedImages: CroppedImage[];
}

/**
 * TableEditor - Main table editing component
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
  canvasSettings,
  onAddCroppedImage,
  onDeleteCroppedImage,
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Crop modal state
  const [cropModalImage, setCropModalImage] = useState<RowData | null>(null);

  // Get active field info
  const activeField = useMemo(() => {
    return fields.find(f => f.id === activeFieldId);
  }, [fields, activeFieldId]);

  // Transform images data for the current field
  const tableData: RowData[] = useMemo(() => {
    return images.map(img => ({
      imageId: img.id,
      thumbnail: img.originalImage,
      original: img.fields[activeFieldId]?.original || '',
      translated: img.fields[activeFieldId]?.translated || '',
      imageWidth: img.width,
      imageHeight: img.height,
      croppedImages: img.croppedImages || [],
    }));
  }, [images, activeFieldId]);

  // Count untranslated items in current field
  const untranslatedCount = useMemo(() => {
    return tableData.filter(row => row.original && !row.translated).length;
  }, [tableData]);

  // Count total untranslated across all fields
  const totalUntranslated = useMemo(() => {
    let count = 0;
    fields.forEach(field => {
      images.forEach(img => {
        const content = img.fields[field.id];
        if (content?.original && !content?.translated) {
          count++;
        }
      });
    });
    return count;
  }, [fields, images]);

  // Handle cell content change
  const handleCellChange = useCallback((
    imageId: string,
    type: 'original' | 'translated',
    value: string
  ) => {
    const currentImage = images.find(img => img.id === imageId);
    const currentContent = currentImage?.fields[activeFieldId] || { original: '', translated: '' };

    onContentChange(imageId, activeFieldId, {
      original: type === 'original' ? value : currentContent.original,
      translated: type === 'translated' ? value : currentContent.translated,
    });
  }, [images, activeFieldId, onContentChange]);

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
  const handleNavigate = useCallback((
    rowIndex: number,
    columnType: 'original' | 'translated',
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
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
  }, [tableData]);

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

  return (
    <div className="table-editor">
      {/* Field Tabs */}
      <FieldTabs
        fields={fields}
        activeFieldId={activeFieldId}
        onSelect={onActiveFieldChange}
      />

      {/* Field Header */}
      <div className="table-editor-header">
        <div className="field-info">
          <span className="field-label">目前欄位：</span>
          <span className="field-name">{activeField?.name || '未知'}</span>
          {untranslatedCount > 0 && (
            <span className="untranslated-badge">
              {untranslatedCount} 個未翻譯
            </span>
          )}
        </div>
        <button
          className="btn primary translate-field-btn"
          onClick={handleTranslateField}
          disabled={isTranslating || untranslatedCount === 0}
        >
          {isTranslating ? '翻譯中...' : '翻譯此欄位'}
        </button>
      </div>

      {/* Data Table */}
      <div className="table-container">
        <table className="data-table" ref={tableRef}>
          <thead>
            <tr>
              <th className="thumbnail-header">圖片</th>
              <th className="content-header">原文</th>
              <th className="content-header">翻譯</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-row">
                  沒有圖片可顯示
                </td>
              </tr>
            ) : (
              tableData.map((row, rowIndex) => (
                <tr key={row.imageId}>
                  {/* Thumbnail */}
                  <td className="thumbnail-cell">
                    <div className="thumbnail-wrapper">
                      <img
                        src={row.thumbnail}
                        alt={`Image ${rowIndex + 1}`}
                        loading="lazy"
                      />
                      <span className="thumbnail-number">{rowIndex + 1}</span>
                      {onAddCroppedImage && (
                        <button
                          className="thumbnail-crop-btn"
                          onClick={() => setCropModalImage(row)}
                          title="擷取圖片區域"
                        >
                          ✂
                        </button>
                      )}
                    </div>
                    {/* Cropped images list */}
                    {row.croppedImages.length > 0 && (
                      <div className="cropped-images-list">
                        {row.croppedImages.map((crop, cropIndex) => (
                          <div key={crop.id} className="cropped-image-item">
                            <img
                              src={crop.imageData}
                              alt={`Crop ${cropIndex + 1}`}
                              className="cropped-image-thumb"
                            />
                            {onDeleteCroppedImage && (
                              <button
                                className="cropped-image-delete"
                                onClick={() => onDeleteCroppedImage(row.imageId, crop.id)}
                                title="刪除擷取圖片"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Original Text */}
                  <td
                    className="content-cell"
                    ref={(el) => registerCellRef(row.imageId, 'original', el)}
                  >
                    <EditableCell
                      value={row.original}
                      onChange={(value) => handleCellChange(row.imageId, 'original', value)}
                      placeholder="輸入原文..."
                      multiline={true}
                      rowIndex={rowIndex}
                      columnType="original"
                      onNavigate={(dir) => handleNavigate(rowIndex, 'original', dir)}
                    />
                  </td>

                  {/* Translated Text */}
                  <td
                    className="content-cell"
                    ref={(el) => registerCellRef(row.imageId, 'translated', el)}
                  >
                    <EditableCell
                      value={row.translated}
                      onChange={(value) => handleCellChange(row.imageId, 'translated', value)}
                      placeholder="輸入翻譯..."
                      multiline={true}
                      rowIndex={rowIndex}
                      columnType="translated"
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
      <div className="table-editor-footer">
        <button
          className="btn primary translate-all-btn"
          onClick={handleTranslateAll}
          disabled={isTranslating || totalUntranslated === 0}
        >
          {isTranslating ? (
            <>
              <span className="spinner-small"></span>
              翻譯中...
            </>
          ) : (
            `翻譯全部欄位 (${totalUntranslated})`
          )}
        </button>

        <div className="keyboard-hints">
          <span className="hint">Tab：下一格</span>
          <span className="hint">Ctrl+Shift+T：翻譯欄位</span>
        </div>
      </div>

      {/* Image Crop Modal */}
      {cropModalImage && canvasSettings && onAddCroppedImage && (
        <ImageCropModal
          imageData={cropModalImage.thumbnail}
          imageWidth={cropModalImage.imageWidth}
          imageHeight={cropModalImage.imageHeight}
          canvasWidth={canvasSettings.width}
          canvasHeight={canvasSettings.height}
          onClose={() => setCropModalImage(null)}
          onConfirm={(croppedImage) => {
            onAddCroppedImage(cropModalImage.imageId, croppedImage);
            setCropModalImage(null);
          }}
        />
      )}
    </div>
  );
};

export default TableEditor;
