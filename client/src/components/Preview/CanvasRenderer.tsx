import React from 'react';
import type { ImageData, FieldTemplate, CanvasSettings } from '../../types';

/**
 * CanvasRenderer Props
 */
export interface CanvasRendererProps {
  /** Image data */
  image: ImageData;

  /** Field templates */
  fields: FieldTemplate[];

  /** Canvas settings */
  canvasSettings: CanvasSettings;

  /** Ref for export functionality */
  canvasRef: React.RefObject<HTMLDivElement>;
}

/**
 * CanvasRenderer component
 * Renders the preview canvas with translated text fields
 */
const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  image,
  fields,
  canvasSettings,
  canvasRef,
}) => {
  return (
    <div
      ref={canvasRef}
      className="preview-canvas"
      style={{
        width: canvasSettings.width,
        height: canvasSettings.height,
        backgroundColor: canvasSettings.backgroundColor,
        position: 'relative',
      }}
    >
      {fields.map((field) => {
        const content = image.fields[field.id];
        if (!content?.translated) return null;

        return (
          <div
            key={field.id}
            className="preview-field"
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
              fontFamily:
                field.fontFamily ||
                '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content.translated}
          </div>
        );
      })}
    </div>
  );
};

export default CanvasRenderer;
