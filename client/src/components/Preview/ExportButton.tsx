import React from 'react';

/**
 * ExportButton Props
 */
export interface ExportButtonProps {
  /** Export type: single image or all images */
  type: 'single' | 'all';

  /** Click handler */
  onClick: () => void;

  /** Loading state */
  loading?: boolean;

  /** Image count for 'all' mode */
  count?: number;

  /** Export progress (0-100) for batch export */
  progress?: number;
}

/**
 * ExportButton component
 * Button for exporting single or all images
 */
const ExportButton: React.FC<ExportButtonProps> = ({
  type,
  onClick,
  loading = false,
  count = 0,
  progress = 0,
}) => {
  const isSingle = type === 'single';

  const getButtonText = () => {
    if (loading) {
      if (isSingle) {
        return 'Exporting...';
      }
      return `Exporting... ${progress}%`;
    }

    if (isSingle) {
      return 'Export This';
    }
    return `Export All (${count})`;
  };

  const getShortcutHint = () => {
    if (isSingle) {
      return 'Ctrl+S';
    }
    return 'Ctrl+Shift+S';
  };

  return (
    <div className="export-button-wrapper">
      <button
        className={`export-btn ${isSingle ? '' : 'primary'}`}
        onClick={onClick}
        disabled={loading}
        title={getShortcutHint()}
      >
        {loading && (
          <span className="export-spinner" />
        )}
        <span>{getButtonText()}</span>
      </button>

      {loading && !isSingle && progress > 0 && (
        <div className="export-progress">
          <div
            className="export-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default ExportButton;
