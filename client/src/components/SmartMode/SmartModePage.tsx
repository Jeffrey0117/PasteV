import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ImageData, TextBlock, LayoutGroup } from '../../types';
import { createImageData } from '../../types';
import { groupImagesByLayout } from '../../utils/layoutSimilarity';
import { BlockEditor } from './BlockEditor';
import './SmartModePage.css';

interface SmartModePageProps {
  onBack?: () => void;
}

/**
 * SmartModePage - Smart Mode main page component
 * Handles image upload, block detection, layout grouping, and block editing
 */
export function SmartModePage({ onBack }: SmartModePageProps) {
  // State management
  const [images, setImages] = useState<ImageData[]>([]);
  const [layoutGroups, setLayoutGroups] = useState<LayoutGroup[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState({ current: 0, total: 0 });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDetection, setPendingDetection] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get selected image data
  const selectedImage = images.find((img) => img.id === selectedImageId) || null;

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Convert FileList to Array immediately to avoid issues with FileList being modified
    const fileArray = Array.from(files);

    setError(null);

    // Process each file using Promise.all for better reliability
    const processPromises = fileArray.map(async (file) => {
      if (!file.type.startsWith('image/')) {
        return null;
      }

      try {
        const base64 = await fileToBase64(file);
        const dimensions = await getImageDimensions(base64);
        const imageData = createImageData(base64, dimensions.width, dimensions.height);
        imageData.status = 'pending';
        return imageData;
      } catch (err) {
        console.error('Failed to process image:', file.name, err);
        return null;
      }
    });

    const results = await Promise.all(processPromises);
    const validImages = results.filter((img): img is ImageData => img !== null);

    if (validImages.length > 0) {
      setImages((prev) => [...prev, ...validImages]);
      // Trigger detection via useEffect
      setPendingDetection(true);
    }
  }, []);

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Get image dimensions
  const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = `data:image/png;base64,${base64}`;
    });
  };

  // Start block detection for all images
  const startDetection = useCallback(async (imagesToDetect: ImageData[]) => {
    const pendingImages = imagesToDetect.filter(
      (img) => img.status === 'pending' || !img.detectedBlocks
    );

    if (pendingImages.length === 0) return;

    setIsDetecting(true);
    setDetectProgress({ current: 0, total: pendingImages.length });

    for (let i = 0; i < pendingImages.length; i++) {
      const image = pendingImages[i];
      setDetectProgress({ current: i, total: pendingImages.length });

      try {
        // Update status to detecting
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, status: 'detecting' } : img
          )
        );

        // Call API to detect blocks
        const response = await fetch('/api/detect-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: image.originalImage,
            width: image.width,
            height: image.height,
          }),
        });

        if (!response.ok) {
          throw new Error(`Detection failed: ${response.statusText}`);
        }

        const result = await response.json();
        const blocks: TextBlock[] = result.blocks || [];

        // Update image with detected blocks
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? { ...img, detectedBlocks: blocks, status: 'detected' }
              : img
          )
        );
      } catch (err) {
        console.error('Detection error:', err);
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, status: 'error' } : img
          )
        );
      }
    }

    setDetectProgress({ current: pendingImages.length, total: pendingImages.length });
    setIsDetecting(false);

    // After detection, group images by layout
    setImages((currentImages) => {
      const groups = groupImagesByLayout(currentImages);
      setLayoutGroups(groups);
      return currentImages;
    });
  }, []);

  // Auto-start detection when pendingDetection is set and images are ready
  useEffect(() => {
    if (pendingDetection && images.length > 0 && !isDetecting) {
      setPendingDetection(false);
      startDetection(images);
    }
  }, [pendingDetection, images, isDetecting, startDetection]);

  // Re-trigger detection after current detection finishes if there are pending images
  useEffect(() => {
    if (!isDetecting && images.length > 0) {
      const hasPendingImages = images.some(img => img.status === 'pending');
      if (hasPendingImages) {
        startDetection(images);
      }
    }
  }, [isDetecting, images, startDetection]);

  // Handle drop zone events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileSelect]);

  // Handle image selection
  const handleImageSelect = useCallback((imageId: string) => {
    setSelectedImageId(imageId);
    setSelectedBlockId(null);
  }, []);

  // Handle block changes
  const handleBlocksChange = useCallback((blocks: TextBlock[]) => {
    if (!selectedImageId) return;

    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId ? { ...img, detectedBlocks: blocks } : img
      )
    );
  }, [selectedImageId]);

  // Get images in a group
  const getGroupImages = useCallback((group: LayoutGroup): ImageData[] => {
    return group.imageIds
      .map((id) => images.find((img) => img.id === id))
      .filter((img): img is ImageData => img !== undefined);
  }, [images]);

  // Clear all images
  const handleClearAll = useCallback(() => {
    setImages([]);
    setLayoutGroups([]);
    setSelectedImageId(null);
    setSelectedBlockId(null);
    setError(null);
  }, []);

  // Get image src with data URL prefix
  const getImageSrc = (base64: string): string => {
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  };

  return (
    <div className="smart-mode-page">
      {/* Hidden file input - shared across all upload triggers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <div className="smart-mode-header">
        <div className="smart-mode-header-left">
          {onBack && (
            <button className="btn-back" onClick={onBack}>
              ← 返回
            </button>
          )}
          <img src="/logo.png" alt="PasteV" className="smart-mode-logo" />
          <h1>Smart Mode - 智慧翻譯</h1>
        </div>
        {images.length > 0 && (
          <button className="btn-clear" onClick={handleClearAll}>
            清除全部
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="smart-mode-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Main content */}
      <div className="smart-mode-content">
        {/* Upload zone / Image grid */}
        <div className="smart-mode-upload-section">
          {images.length === 0 ? (
            // Upload zone
            <div
              className="smart-mode-dropzone"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleClick}
            >
              <div className="dropzone-icon">+</div>
              <p>拖放圖片或點擊選擇</p>
              <span className="dropzone-hint">支援多張圖片</span>
            </div>
          ) : (
            // Image grid
            <div className="smart-mode-image-grid">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  className={`image-grid-item ${selectedImageId === image.id ? 'selected' : ''}`}
                  onClick={() => handleImageSelect(image.id)}
                >
                  <img src={getImageSrc(image.originalImage)} alt={`Image ${index + 1}`} />
                  <div className="image-grid-index">{index + 1}</div>
                  <div className={`image-grid-status status-${image.status}`}>
                    {getStatusLabel(image.status)}
                  </div>
                </div>
              ))}
              {/* Add more button */}
              <div
                className="image-grid-add"
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <span>+</span>
              </div>
            </div>
          )}
        </div>

        {/* Detection progress */}
        {isDetecting && (
          <div className="smart-mode-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(detectProgress.current / detectProgress.total) * 100}%`,
                }}
              />
            </div>
            <span className="progress-text">
              偵測進度: {detectProgress.current}/{detectProgress.total} 完成
            </span>
          </div>
        )}

        {/* Layout groups overview */}
        {!isDetecting && layoutGroups.length > 0 && (
          <div className="smart-mode-groups">
            <h3>版型分組</h3>
            <div className="groups-list">
              {layoutGroups.map((group, index) => {
                const groupImages = getGroupImages(group);
                const representative = groupImages[0];

                return (
                  <div
                    key={group.id}
                    className={`group-card ${
                      selectedImageId && group.imageIds.includes(selectedImageId)
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => representative && handleImageSelect(representative.id)}
                  >
                    <div className="group-thumbnail">
                      {representative && (
                        <img
                          src={getImageSrc(representative.originalImage)}
                          alt={`Group ${index + 1}`}
                        />
                      )}
                    </div>
                    <div className="group-info">
                      <span className="group-label">版型 {String.fromCharCode(65 + index)}</span>
                      <span className="group-count">({groupImages.length}張)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Block Editor for selected image */}
        {selectedImage && selectedImage.detectedBlocks && (
          <div className="smart-mode-editor">
            <BlockEditor
              image={selectedImage}
              blocks={selectedImage.detectedBlocks}
              onBlocksChange={handleBlocksChange}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Get human-readable status label
 */
function getStatusLabel(status: ImageData['status']): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    detecting: '偵測中',
    detected: '已偵測',
    error: '錯誤',
    translating: '翻譯中',
    translated: '已翻譯',
    inpainting: '處理中',
    inpainted: '已處理',
    ready: '就緒',
  };
  return labels[status] || status;
}

export default SmartModePage;
