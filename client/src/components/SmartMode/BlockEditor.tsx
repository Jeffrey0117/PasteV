import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import type { ImageData, TextBlock } from '../../types';
import { BlockItem } from './BlockItem';
import './BlockEditor.css';

interface BlockEditorProps {
  image: ImageData;
  blocks: TextBlock[];
  onBlocksChange: (blocks: TextBlock[]) => void;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
}

/**
 * BlockEditor - Canvas for editing OCR detected text blocks
 * Displays image background with draggable/resizable block overlays
 */
export function BlockEditor({
  image,
  blocks,
  onBlocksChange,
  selectedBlockId,
  onSelectBlock,
}: BlockEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calculate scale to fit image in container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const padding = 32; // 16px padding on each side
      const availableWidth = containerRect.width - padding;
      const availableHeight = containerRect.height - padding;

      const scaleX = availableWidth / image.width;
      const scaleY = availableHeight / image.height;
      const newScale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 100%

      setScale(newScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [image.width, image.height]);

  // Canvas bounds for dragging constraints
  const canvasBounds = useMemo(() => ({
    width: image.width,
    height: image.height,
  }), [image.width, image.height]);

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      onSelectBlock(null);
    }
  }, [onSelectBlock]);

  // Update a specific block
  const updateBlock = useCallback((blockId: string, updates: Partial<TextBlock>) => {
    const newBlocks = blocks.map((block) =>
      block.id === blockId ? { ...block, ...updates } : block
    );
    onBlocksChange(newBlocks);
  }, [blocks, onBlocksChange]);

  // Handle block drag
  const handleBlockDrag = useCallback((blockId: string, x: number, y: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (block) {
      updateBlock(blockId, {
        bbox: { ...block.bbox, x, y },
      });
    }
  }, [blocks, updateBlock]);

  // Handle block resize
  const handleBlockResize = useCallback((blockId: string, width: number, height: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (block) {
      updateBlock(blockId, {
        bbox: { ...block.bbox, width, height },
      });
    }
  }, [blocks, updateBlock]);

  // Get background image src
  const backgroundImage = useMemo(() => {
    // Use inpainted image if available, otherwise original
    const src = image.inpaintedImage || image.originalImage;
    return src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
  }, [image.originalImage, image.inpaintedImage]);

  return (
    <div className="block-editor">
      <div className="block-editor-header">
        <h3>Block Editor</h3>
        <div className="block-editor-info">
          <span className="block-count">{blocks.length} blocks</span>
          <span className="block-editor-scale">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      <div className="block-editor-canvas-wrapper" ref={containerRef}>
        <div
          ref={canvasRef}
          className="block-editor-canvas"
          style={{
            width: image.width * scale,
            height: image.height * scale,
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
          }}
          onClick={handleCanvasClick}
        >
          {blocks.map((block) => (
            <BlockItem
              key={block.id}
              block={block}
              isSelected={block.id === selectedBlockId}
              onSelect={() => onSelectBlock(block.id)}
              onDrag={(x, y) => handleBlockDrag(block.id, x, y)}
              onResize={(width, height) => handleBlockResize(block.id, width, height)}
              onUpdate={(updates) => updateBlock(block.id, updates)}
              canvasBounds={canvasBounds}
              scale={scale}
            />
          ))}
        </div>
      </div>

      {/* Status legend */}
      <div className="block-editor-legend">
        <div className="legend-item legend-translate">
          <span className="legend-color"></span>
          <span>Translate</span>
        </div>
        <div className="legend-item legend-keep">
          <span className="legend-color"></span>
          <span>Keep</span>
        </div>
        <div className="legend-item legend-exclude">
          <span className="legend-color"></span>
          <span>Exclude</span>
        </div>
      </div>
    </div>
  );
}

export default BlockEditor;
