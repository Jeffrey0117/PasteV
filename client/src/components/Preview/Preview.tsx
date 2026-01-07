import React, { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import type { ImageData, FieldTemplate, CanvasSettings, StaticText, SavedTemplate, SavedProject, CroppedImage } from '../../types';
import { ImageCropModal } from '../TableEditor';
import ExportButton from './ExportButton';
import './Preview.css';

/**
 * Preview Props
 */
export interface PreviewProps {
  images: ImageData[];
  fields: FieldTemplate[];
  onFieldsChange?: (fields: FieldTemplate[]) => void;
  onImagesChange?: (images: ImageData[]) => void;
  canvasSettings: CanvasSettings;
  onCanvasSettingsChange?: (settings: CanvasSettings) => void;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onBack: () => void;
}

// Helper to generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * Preview component with editing capabilities
 */
const Preview: React.FC<PreviewProps> = ({
  images,
  fields,
  onFieldsChange,
  onImagesChange,
  canvasSettings,
  onCanvasSettingsChange,
  currentIndex,
  onIndexChange,
  onBack,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [autoFitZoom, setAutoFitZoom] = useState(1);

  // Selection state - can select either field, static text, or cropped image
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedStaticId, setSelectedStaticId] = useState<string | null>(null);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartItemPos, setDragStartItemPos] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'field' | 'static' | 'crop' | null>(null);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<'font' | 'width-left' | 'width-right' | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, fontSize: 16, width: 0, fieldX: 0 });

  // Crop modal state
  const [showCropModal, setShowCropModal] = useState(false);

  const currentImage = images[currentIndex];
  // Per-image static texts
  const imageStaticTexts = currentImage?.staticTexts || [];
  // Template static texts (global)
  const templateStaticTexts = canvasSettings.templateStaticTexts || [];
  // Combined for rendering
  const allStaticTexts = [...templateStaticTexts, ...imageStaticTexts];
  // Cropped images for current image
  const croppedImages = currentImage?.croppedImages || [];

  const selectedField = fields.find((f) => f.id === selectedFieldId);
  // Check if selected static is template or per-image
  const selectedTemplateStatic = templateStaticTexts.find((s) => s.id === selectedStaticId);
  const selectedImageStatic = imageStaticTexts.find((s) => s.id === selectedStaticId);
  const selectedStatic = selectedTemplateStatic || selectedImageStatic;
  const isSelectedTemplate = !!selectedTemplateStatic;
  // Selected cropped image
  const selectedCrop = croppedImages.find((c) => c.id === selectedCropId);

  // Clear other selection when selecting
  const selectField = useCallback((id: string | null) => {
    setSelectedFieldId(id);
    setSelectedStaticId(null);
    setSelectedCropId(null);
  }, []);

  const selectStatic = useCallback((id: string | null) => {
    setSelectedStaticId(id);
    setSelectedFieldId(null);
    setSelectedCropId(null);
  }, []);

  const selectCrop = useCallback((id: string | null) => {
    setSelectedCropId(id);
    setSelectedFieldId(null);
    setSelectedStaticId(null);
  }, []);

  // Update cropped image
  const updateCroppedImage = useCallback(
    (cropId: string, updates: Partial<CroppedImage>) => {
      if (!onImagesChange || !currentImage) return;
      const updatedCrops = (currentImage.croppedImages || []).map((c) =>
        c.id === cropId ? { ...c, ...updates } : c
      );
      onImagesChange(
        images.map((img) =>
          img.id === currentImage.id ? { ...img, croppedImages: updatedCrops } : img
        )
      );
    },
    [images, currentImage, onImagesChange]
  );

  // Delete cropped image
  const deleteCroppedImage = useCallback(
    (cropId: string) => {
      if (!onImagesChange || !currentImage) return;
      const updatedCrops = (currentImage.croppedImages || []).filter((c) => c.id !== cropId);
      onImagesChange(
        images.map((img) =>
          img.id === currentImage.id ? { ...img, croppedImages: updatedCrops } : img
        )
      );
      if (selectedCropId === cropId) {
        setSelectedCropId(null);
      }
    },
    [images, currentImage, onImagesChange, selectedCropId]
  );

  // Calculate auto-fit zoom
  useEffect(() => {
    const calculateAutoFit = () => {
      if (!canvasAreaRef.current) return;

      const area = canvasAreaRef.current;
      const padding = 80;
      const availableWidth = area.clientWidth - padding;
      const availableHeight = area.clientHeight - padding;

      const scaleX = availableWidth / canvasSettings.width;
      const scaleY = availableHeight / canvasSettings.height;
      const fitScale = Math.min(scaleX, scaleY, 1);

      setAutoFitZoom(Math.round(fitScale * 100) / 100);
      setZoom(Math.round(fitScale * 100) / 100);
    };

    calculateAutoFit();
    window.addEventListener('resize', calculateAutoFit);
    return () => window.removeEventListener('resize', calculateAutoFit);
  }, [canvasSettings.width, canvasSettings.height]);

  // Update field
  const updateField = useCallback(
    (fieldId: string, updates: Partial<FieldTemplate>) => {
      if (!onFieldsChange) return;
      onFieldsChange(
        fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
      );
    },
    [fields, onFieldsChange]
  );

  // Update static text - handles both template and per-image
  const updateStaticText = useCallback(
    (staticId: string, updates: Partial<StaticText>) => {
      // Check if it's a template static text
      const isTemplate = templateStaticTexts.some((s) => s.id === staticId);

      if (isTemplate && onCanvasSettingsChange) {
        const updatedTexts = templateStaticTexts.map((s) =>
          s.id === staticId ? { ...s, ...updates } : s
        );
        onCanvasSettingsChange({
          ...canvasSettings,
          templateStaticTexts: updatedTexts,
        });
      } else if (!isTemplate && onImagesChange && currentImage) {
        const updatedTexts = (currentImage.staticTexts || []).map((s) =>
          s.id === staticId ? { ...s, ...updates } : s
        );
        onImagesChange(
          images.map((img) =>
            img.id === currentImage.id ? { ...img, staticTexts: updatedTexts } : img
          )
        );
      }
    },
    [images, currentImage, onImagesChange, templateStaticTexts, canvasSettings, onCanvasSettingsChange]
  );

  // Add new template static text (applies to all images)
  const addTemplateStaticText = useCallback(() => {
    if (!onCanvasSettingsChange) return;
    const newText: StaticText = {
      id: generateId(),
      text: 'Template Text',
      x: 50,
      y: 50,
      fontSize: 24,
      fontWeight: 'normal',
      color: '#000000',
      opacity: 1,
    };
    onCanvasSettingsChange({
      ...canvasSettings,
      templateStaticTexts: [...templateStaticTexts, newText],
    });
    selectStatic(newText.id);
  }, [canvasSettings, templateStaticTexts, onCanvasSettingsChange, selectStatic]);

  // Add new per-image static text (only for current image)
  const addImageStaticText = useCallback(() => {
    if (!onImagesChange || !currentImage) return;
    const newText: StaticText = {
      id: generateId(),
      text: 'Image Text',
      x: 50,
      y: 100,
      fontSize: 24,
      fontWeight: 'normal',
      color: '#000000',
      opacity: 1,
    };
    const updatedTexts = [...(currentImage.staticTexts || []), newText];
    onImagesChange(
      images.map((img) =>
        img.id === currentImage.id ? { ...img, staticTexts: updatedTexts } : img
      )
    );
    selectStatic(newText.id);
  }, [images, currentImage, onImagesChange, selectStatic]);

  // Delete static text - handles both template and per-image
  const deleteStaticText = useCallback(
    (id: string) => {
      const isTemplate = templateStaticTexts.some((s) => s.id === id);

      if (isTemplate && onCanvasSettingsChange) {
        onCanvasSettingsChange({
          ...canvasSettings,
          templateStaticTexts: templateStaticTexts.filter((s) => s.id !== id),
        });
      } else if (!isTemplate && onImagesChange && currentImage) {
        const updatedTexts = (currentImage.staticTexts || []).filter((s) => s.id !== id);
        onImagesChange(
          images.map((img) =>
            img.id === currentImage.id ? { ...img, staticTexts: updatedTexts } : img
          )
        );
      }

      if (selectedStaticId === id) {
        setSelectedStaticId(null);
      }
    },
    [images, currentImage, onImagesChange, templateStaticTexts, canvasSettings, onCanvasSettingsChange, selectedStaticId]
  );

  // Convert static text between template and per-image
  const convertStaticText = useCallback(
    (id: string) => {
      const isTemplate = templateStaticTexts.some((s) => s.id === id);
      const staticText = isTemplate
        ? templateStaticTexts.find((s) => s.id === id)
        : imageStaticTexts.find((s) => s.id === id);

      if (!staticText) return;

      // Create a copy with new ID to avoid conflicts
      const convertedText: StaticText = { ...staticText, id: generateId() };

      if (isTemplate) {
        // Convert from template to per-image
        if (!onCanvasSettingsChange || !onImagesChange || !currentImage) return;

        // Remove from template
        onCanvasSettingsChange({
          ...canvasSettings,
          templateStaticTexts: templateStaticTexts.filter((s) => s.id !== id),
        });

        // Add to current image
        const updatedTexts = [...(currentImage.staticTexts || []), convertedText];
        onImagesChange(
          images.map((img) =>
            img.id === currentImage.id ? { ...img, staticTexts: updatedTexts } : img
          )
        );

        selectStatic(convertedText.id);
      } else {
        // Convert from per-image to template
        if (!onCanvasSettingsChange || !onImagesChange || !currentImage) return;

        // Remove from current image
        const updatedTexts = (currentImage.staticTexts || []).filter((s) => s.id !== id);
        onImagesChange(
          images.map((img) =>
            img.id === currentImage.id ? { ...img, staticTexts: updatedTexts } : img
          )
        );

        // Add to template
        onCanvasSettingsChange({
          ...canvasSettings,
          templateStaticTexts: [...templateStaticTexts, convertedText],
        });

        selectStatic(convertedText.id);
      }
    },
    [images, currentImage, onImagesChange, templateStaticTexts, imageStaticTexts, canvasSettings, onCanvasSettingsChange, selectStatic]
  );

  // Save template to file
  const saveTemplate = useCallback(() => {
    const template: SavedTemplate = {
      name: 'PasteV Template',
      savedAt: new Date().toISOString(),
      version: '1.0',
      fieldTemplates: fields,
      canvasSettings: canvasSettings,
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pastev-template-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fields, canvasSettings]);

  // Load template from file
  const loadTemplate = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const template = JSON.parse(ev.target?.result as string) as SavedTemplate;

        // Validate template structure
        if (!template.fieldTemplates || !template.canvasSettings) {
          alert('Invalid template file format');
          return;
        }

        // Apply field templates - preserve existing field IDs to keep image data linked
        if (onFieldsChange) {
          // Map template fields to existing fields by index, preserving IDs
          const mergedFields = template.fieldTemplates.map((templateField, index) => {
            const existingField = fields[index];
            if (existingField) {
              // Keep existing ID, update all other properties
              return {
                ...templateField,
                id: existingField.id,
              };
            }
            // New field from template (no existing field at this index)
            return templateField;
          });
          onFieldsChange(mergedFields);
        }

        // Apply canvas settings
        if (onCanvasSettingsChange) {
          onCanvasSettingsChange(template.canvasSettings);
        }

        alert(`Template loaded: ${template.name || 'Unnamed'}`);
      } catch (err) {
        alert('Failed to parse template file');
        console.error('Template load error:', err);
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be loaded again
    e.target.value = '';
  }, [onFieldsChange, onCanvasSettingsChange, fields]);

  // Save project to file (includes all images and their data)
  const saveProject = useCallback(() => {
    const project: SavedProject = {
      name: 'PasteV Project',
      savedAt: new Date().toISOString(),
      version: '1.0',
      images: images,
      fieldTemplates: fields,
      canvasSettings: canvasSettings,
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pastev-project-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images, fields, canvasSettings]);

  // Load project from file
  const loadProject = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const project = JSON.parse(ev.target?.result as string) as SavedProject;

        // Validate project structure
        if (!project.images || !project.fieldTemplates || !project.canvasSettings) {
          alert('Invalid project file format');
          return;
        }

        // Apply images
        if (onImagesChange) {
          onImagesChange(project.images);
        }

        // Apply field templates
        if (onFieldsChange) {
          onFieldsChange(project.fieldTemplates);
        }

        // Apply canvas settings
        if (onCanvasSettingsChange) {
          onCanvasSettingsChange(project.canvasSettings);
        }

        // Reset to first image
        onIndexChange(0);

        alert(`Project loaded: ${project.name || 'Unnamed'} (${project.images.length} images)`);
      } catch (err) {
        alert('Failed to parse project file');
        console.error('Project load error:', err);
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be loaded again
    e.target.value = '';
  }, [onImagesChange, onFieldsChange, onCanvasSettingsChange, onIndexChange]);

  // Get canvas position from mouse event
  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvasRect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - canvasRect.left) / zoom,
      y: (e.clientY - canvasRect.top) / zoom,
    };
  }, [zoom]);

  // Mouse down on field - start drag
  const handleFieldMouseDown = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!onFieldsChange) return;

      const field = fields.find(f => f.id === fieldId);
      if (!field) return;

      selectField(fieldId);
      const pos = getCanvasPos(e);
      setDragStartPos(pos);
      setDragStartItemPos({ x: field.x, y: field.y });
      setDragType('field');
      setIsDragging(true);
    },
    [onFieldsChange, fields, getCanvasPos, selectField]
  );

  // Mouse down on static text - start drag
  const handleStaticMouseDown = useCallback(
    (e: React.MouseEvent, staticId: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Allow drag if either onImagesChange or onCanvasSettingsChange is available
      if (!onImagesChange && !onCanvasSettingsChange) return;

      const staticText = allStaticTexts.find(s => s.id === staticId);
      if (!staticText) return;

      selectStatic(staticId);
      const pos = getCanvasPos(e);
      setDragStartPos(pos);
      setDragStartItemPos({ x: staticText.x, y: staticText.y });
      setDragType('static');
      setIsDragging(true);
    },
    [onImagesChange, onCanvasSettingsChange, allStaticTexts, getCanvasPos, selectStatic]
  );

  // Mouse down on cropped image - start drag
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent, cropId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!onImagesChange) return;

      const crop = croppedImages.find(c => c.id === cropId);
      if (!crop) return;

      selectCrop(cropId);
      const pos = getCanvasPos(e);
      setDragStartPos(pos);
      setDragStartItemPos({ x: crop.x, y: crop.y });
      setDragType('crop');
      setIsDragging(true);
    },
    [onImagesChange, croppedImages, getCanvasPos, selectCrop]
  );

  // Mouse move - drag or resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const pos = getCanvasPos(e);

      // Handle resize for static text (font size only)
      if (isResizing && selectedStaticId && resizeType === 'font') {
        const deltaY = pos.y - resizeStart.y;
        const scaleFactor = (resizeStart.fontSize + deltaY) / resizeStart.fontSize;
        const newFontSize = Math.max(8, Math.min(200, Math.round(resizeStart.fontSize * scaleFactor)));
        updateStaticText(selectedStaticId, { fontSize: newFontSize });
        return;
      }

      // Handle resize for field
      if (isResizing && selectedFieldId) {
        const field = fields.find(f => f.id === selectedFieldId);
        if (!field) return;

        if (resizeType === 'font') {
          // Font size resize (corner handle)
          const deltaY = pos.y - resizeStart.y;
          const scaleFactor = (resizeStart.fontSize + deltaY) / resizeStart.fontSize;
          const newFontSize = Math.max(8, Math.min(200, Math.round(resizeStart.fontSize * scaleFactor)));
          updateField(selectedFieldId, { fontSize: newFontSize });
        } else if (resizeType === 'width-right') {
          // Width resize from right
          const deltaX = pos.x - resizeStart.x;
          const newWidth = Math.max(80, Math.round(resizeStart.width + deltaX));
          const maxWidth = canvasSettings.width - field.x;
          updateField(selectedFieldId, { width: Math.min(newWidth, maxWidth) });
        } else if (resizeType === 'width-left') {
          // Width resize from left (also adjusts x position)
          const deltaX = pos.x - resizeStart.x;
          const newX = resizeStart.fieldX + deltaX;
          const newWidth = resizeStart.width - deltaX;
          if (newWidth >= 80 && newX >= 0) {
            updateField(selectedFieldId, { x: Math.round(newX), width: Math.round(newWidth) });
          }
        }
        return;
      }

      // Handle drag
      if (isDragging) {
        const deltaX = pos.x - dragStartPos.x;
        const deltaY = pos.y - dragStartPos.y;
        const newX = Math.max(0, Math.round(dragStartItemPos.x + deltaX));
        const newY = Math.max(0, Math.round(dragStartItemPos.y + deltaY));

        if (dragType === 'field' && selectedFieldId) {
          updateField(selectedFieldId, { x: newX, y: newY });
        } else if (dragType === 'static' && selectedStaticId) {
          updateStaticText(selectedStaticId, { x: newX, y: newY });
        } else if (dragType === 'crop' && selectedCropId) {
          updateCroppedImage(selectedCropId, { x: newX, y: newY });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeType(null);
      setDragType(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, resizeType, selectedFieldId, selectedStaticId, selectedCropId, dragStartPos, dragStartItemPos, resizeStart, dragType, getCanvasPos, updateField, updateStaticText, updateCroppedImage, fields, canvasSettings.width]);

  // Font resize handle mouse down (corner)
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, fontSize: number) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getCanvasPos(e);
      setIsResizing(true);
      setResizeType('font');
      setResizeStart({ x: pos.x, y: pos.y, fontSize, width: 0, fieldX: 0 });
    },
    [getCanvasPos]
  );

  // Width resize handle mouse down (left)
  const handleWidthResizeLeftMouseDown = useCallback(
    (e: React.MouseEvent, field: FieldTemplate) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getCanvasPos(e);
      setIsResizing(true);
      setResizeType('width-left');
      setResizeStart({ x: pos.x, y: pos.y, fontSize: field.fontSize, width: field.width, fieldX: field.x });
    },
    [getCanvasPos]
  );

  // Width resize handle mouse down (right)
  const handleWidthResizeRightMouseDown = useCallback(
    (e: React.MouseEvent, field: FieldTemplate) => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getCanvasPos(e);
      setIsResizing(true);
      setResizeType('width-right');
      setResizeStart({ x: pos.x, y: pos.y, fontSize: field.fontSize, width: field.width, fieldX: field.x });
    },
    [getCanvasPos]
  );

  // Canvas click - deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedFieldId(null);
      setSelectedStaticId(null);
      setSelectedCropId(null);
    }
  }, []);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) onIndexChange(currentIndex - 1);
  }, [currentIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) onIndexChange(currentIndex + 1);
  }, [currentIndex, images.length, onIndexChange]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom((z) => Math.min(3, z + 0.1)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.1, z - 0.1)), []);
  const zoomFit = useCallback(() => setZoom(autoFitZoom), [autoFitZoom]);

  // Export single image
  const exportSingle = useCallback(async () => {
    if (!canvasRef.current || exporting) return;

    setSelectedFieldId(null);
    setSelectedStaticId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);

    try {
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: canvasSettings.backgroundColor,
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = `pastev-${currentIndex + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setZoom(originalZoom);
    }
  }, [canvasSettings.backgroundColor, currentIndex, exporting, zoom]);

  // Export all images as ZIP
  const exportAll = useCallback(async () => {
    if (exporting) return;

    setSelectedFieldId(null);
    setSelectedStaticId(null);
    const originalZoom = zoom;
    setZoom(1);
    await new Promise((r) => setTimeout(r, 50));

    setExporting(true);
    setExportProgress(0);

    const originalIndex = currentIndex;

    try {
      const zip = new JSZip();
      const folder = zip.folder('pastev-export');

      for (let i = 0; i < images.length; i++) {
        setExportProgress(Math.round((i / images.length) * 100));
        onIndexChange(i);
        await new Promise((resolve) => setTimeout(resolve, 150));

        if (!canvasRef.current) continue;

        const canvas = await html2canvas(canvasRef.current, {
          backgroundColor: canvasSettings.backgroundColor,
          scale: 2,
          useCORS: true,
        });

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        folder?.file(`image-${String(i + 1).padStart(2, '0')}.png`, blob);
      }

      setExportProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });

      const link = document.createElement('a');
      link.download = `pastev-export-${Date.now()}.zip`;
      link.href = URL.createObjectURL(content);
      link.click();

      URL.revokeObjectURL(link.href);
      onIndexChange(originalIndex);
    } catch (error) {
      console.error('Export all failed:', error);
      alert('Batch export failed. Please try again.');
    } finally {
      setExporting(false);
      setExportProgress(0);
      setZoom(originalZoom);
    }
  }, [canvasSettings.backgroundColor, currentIndex, exporting, images.length, onIndexChange, zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Arrow keys for selected item position
      const step = e.shiftKey ? 10 : 1;

      if (selectedFieldId && onFieldsChange) {
        const field = fields.find((f) => f.id === selectedFieldId);
        if (field && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          switch (e.key) {
            case 'ArrowUp': updateField(selectedFieldId, { y: Math.max(0, field.y - step) }); break;
            case 'ArrowDown': updateField(selectedFieldId, { y: field.y + step }); break;
            case 'ArrowLeft': updateField(selectedFieldId, { x: Math.max(0, field.x - step) }); break;
            case 'ArrowRight': updateField(selectedFieldId, { x: field.x + step }); break;
          }
          return;
        }
      }

      if (selectedStaticId && (onImagesChange || onCanvasSettingsChange)) {
        const staticText = allStaticTexts.find((s) => s.id === selectedStaticId);
        if (staticText && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          switch (e.key) {
            case 'ArrowUp': updateStaticText(selectedStaticId, { y: Math.max(0, staticText.y - step) }); break;
            case 'ArrowDown': updateStaticText(selectedStaticId, { y: staticText.y + step }); break;
            case 'ArrowLeft': updateStaticText(selectedStaticId, { x: Math.max(0, staticText.x - step) }); break;
            case 'ArrowRight': updateStaticText(selectedStaticId, { x: staticText.x + step }); break;
          }
          return;
        }

        // Delete key to delete static text
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteStaticText(selectedStaticId);
          return;
        }
      }

      // Arrow keys for cropped image
      if (selectedCropId && onImagesChange) {
        const crop = croppedImages.find((c) => c.id === selectedCropId);
        if (crop && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          switch (e.key) {
            case 'ArrowUp': updateCroppedImage(selectedCropId, { y: Math.max(0, crop.y - step) }); break;
            case 'ArrowDown': updateCroppedImage(selectedCropId, { y: crop.y + step }); break;
            case 'ArrowLeft': updateCroppedImage(selectedCropId, { x: Math.max(0, crop.x - step) }); break;
            case 'ArrowRight': updateCroppedImage(selectedCropId, { x: crop.x + step }); break;
          }
          return;
        }

        // Delete key to delete cropped image
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteCroppedImage(selectedCropId);
          return;
        }
      }

      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); goToPrevious(); break;
        case 'ArrowRight': e.preventDefault(); goToNext(); break;
        case 'Escape':
          setSelectedFieldId(null);
          setSelectedStaticId(null);
          setSelectedCropId(null);
          break;
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.shiftKey ? exportAll() : exportSingle();
          }
          break;
        case '=':
        case '+':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomIn(); }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomOut(); }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomFit(); }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFieldId, selectedStaticId, selectedCropId, fields, allStaticTexts, croppedImages, goToPrevious, goToNext, exportSingle, exportAll, updateField, updateStaticText, deleteStaticText, updateCroppedImage, deleteCroppedImage, onFieldsChange, onImagesChange, onCanvasSettingsChange, zoomIn, zoomOut, zoomFit]);

  if (!currentImage) {
    return (
      <div className="preview-wrapper">
        <div className="preview-empty">
          <p>No images to preview</p>
          <button className="btn-secondary" onClick={onBack}>Back to Edit</button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="preview-wrapper">
      {/* Top toolbar */}
      <div className="preview-toolbar">
        <div className="toolbar-left">
          <h2>Preview</h2>
          {onFieldsChange && (
            <span className="edit-hint">Click to select, drag to move</span>
          )}
        </div>

        <div className="toolbar-center">
          <button className="nav-btn" onClick={goToPrevious} disabled={currentIndex === 0}>
            &#8592;
          </button>

          <div className="page-indicator">
            <span className="page-current">{currentIndex + 1}</span>
            <span className="page-separator">/</span>
            <span className="page-total">{images.length}</span>
          </div>

          <button className="nav-btn" onClick={goToNext} disabled={currentIndex === images.length - 1}>
            &#8594;
          </button>
        </div>

        <div className="toolbar-right">
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={zoomOut} disabled={zoom <= 0.1}>-</button>
            <span className="zoom-level" onClick={zoomFit} title="Click to fit">
              {Math.round(zoom * 100)}%
            </span>
            <button className="zoom-btn" onClick={zoomIn} disabled={zoom >= 3}>+</button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="preview-content">
        {/* Canvas area */}
        <div className="canvas-area" ref={canvasAreaRef}>
          <div
            className="canvas-zoom-wrapper"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <div
              ref={canvasRef}
              className="preview-canvas"
              style={{
                width: canvasSettings.width,
                height: canvasSettings.height,
                backgroundColor: canvasSettings.backgroundColor,
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={handleCanvasClick}
            >
              {/* Background image with opacity */}
              {canvasSettings.backgroundImage && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: `url(${canvasSettings.backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: canvasSettings.backgroundImageOpacity ?? 1,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {/* Field texts */}
              {fields.map((field) => {
                const content = currentImage.fields[field.id];
                // Check which text to display based on displayMode
                const displayText = field.displayMode === 'original'
                  ? content?.original
                  : content?.translated;
                if (!displayText) return null;

                const isSelected = field.id === selectedFieldId;

                return (
                  <div
                    key={field.id}
                    className={`preview-field ${isSelected ? 'selected' : ''} ${onFieldsChange ? 'editable' : ''}`}
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
                      fontFamily: field.fontFamily || '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                      cursor: onFieldsChange && !isResizing ? 'move' : 'default',
                    }}
                    onMouseDown={(e) => handleFieldMouseDown(e, field.id)}
                  >
                    {displayText}

                    {isSelected && onFieldsChange && (
                      <>
                        {/* Left handle - adjust width from left */}
                        <div
                          className="resize-handle resize-handle-w"
                          onMouseDown={(e) => handleWidthResizeLeftMouseDown(e, field)}
                          title="拖曳調整寬度 (左)"
                        />
                        {/* Right handle - adjust width from right */}
                        <div
                          className="resize-handle resize-handle-e"
                          onMouseDown={(e) => handleWidthResizeRightMouseDown(e, field)}
                          title="拖曳調整寬度 (右)"
                        />
                        {/* Corner handle - adjust font size */}
                        <div
                          className="resize-handle resize-handle-se"
                          onMouseDown={(e) => handleResizeMouseDown(e, field.fontSize)}
                          title="拖曳調整字體大小"
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Static texts (watermarks/logos) - both template and per-image */}
              {allStaticTexts.map((staticText) => {
                const isSelected = staticText.id === selectedStaticId;
                const isTemplate = templateStaticTexts.some((t) => t.id === staticText.id);
                const canEdit = isTemplate ? !!onCanvasSettingsChange : !!onImagesChange;

                return (
                  <div
                    key={staticText.id}
                    className={`preview-field static-text ${isSelected ? 'selected' : ''} ${canEdit ? 'editable' : ''} ${isTemplate ? 'template' : 'per-image'}`}
                    style={{
                      position: 'absolute',
                      left: staticText.x,
                      top: staticText.y,
                      fontSize: staticText.fontSize,
                      fontWeight: staticText.fontWeight,
                      color: staticText.color,
                      opacity: staticText.opacity,
                      transform: staticText.rotation ? `rotate(${staticText.rotation}deg)` : undefined,
                      whiteSpace: 'nowrap',
                      cursor: canEdit && !isResizing ? 'move' : 'default',
                      fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif',
                    }}
                    onMouseDown={(e) => handleStaticMouseDown(e, staticText.id)}
                  >
                    {staticText.text}

                    {isSelected && canEdit && (
                      <div
                        className="resize-handle resize-handle-se"
                        onMouseDown={(e) => handleResizeMouseDown(e, staticText.fontSize)}
                        title="Drag to resize font"
                      />
                    )}
                  </div>
                );
              })}

              {/* Cropped images from original */}
              {croppedImages.map((crop) => {
                const isSelected = crop.id === selectedCropId;

                return (
                  <div
                    key={crop.id}
                    className={`preview-crop ${isSelected ? 'selected' : ''} ${onImagesChange ? 'editable' : ''}`}
                    style={{
                      position: 'absolute',
                      left: crop.x,
                      top: crop.y,
                      width: crop.outputWidth,
                      height: crop.outputHeight,
                      cursor: onImagesChange && !isResizing ? 'move' : 'default',
                    }}
                    onMouseDown={(e) => handleCropMouseDown(e, crop.id)}
                  >
                    <img
                      src={crop.imageData}
                      alt="Cropped"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                    {isSelected && onImagesChange && (
                      <button
                        className="crop-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCroppedImage(crop.id);
                        }}
                        title="刪除擷取圖片"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="preview-sidebar">
          {/* Original thumbnail */}
          <div className="sidebar-section">
            <h3>Original</h3>
            <div className="original-thumbnail">
              <img src={currentImage.originalImage} alt={`Original ${currentIndex + 1}`} />
            </div>
          </div>

          {/* Canvas Settings */}
          {onCanvasSettingsChange && (
            <div className="sidebar-section">
              <h3>Canvas Settings</h3>
              <div className="field-settings">
                <div className="setting-row">
                  <label>Width</label>
                  <input
                    type="number"
                    value={canvasSettings.width}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, width: Number(e.target.value) })}
                  />
                </div>
                <div className="setting-row">
                  <label>Height</label>
                  <input
                    type="number"
                    value={canvasSettings.height}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, height: Number(e.target.value) })}
                  />
                </div>
                <div className="setting-row">
                  <label>Bg Color</label>
                  <input
                    type="color"
                    value={canvasSettings.backgroundColor}
                    onChange={(e) => onCanvasSettingsChange({ ...canvasSettings, backgroundColor: e.target.value })}
                  />
                </div>
                <div className="setting-row">
                  <label>Bg Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          onCanvasSettingsChange({
                            ...canvasSettings,
                            backgroundImage: ev.target?.result as string,
                            backgroundImageOpacity: canvasSettings.backgroundImageOpacity ?? 1,
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
                {canvasSettings.backgroundImage && (
                  <>
                    <div className="setting-row">
                      <label>Bg Opacity</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={canvasSettings.backgroundImageOpacity ?? 1}
                        onChange={(e) => onCanvasSettingsChange({
                          ...canvasSettings,
                          backgroundImageOpacity: Number(e.target.value),
                        })}
                      />
                      <span>{Math.round((canvasSettings.backgroundImageOpacity ?? 1) * 100)}%</span>
                    </div>
                    <div className="setting-row">
                      <button
                        className="btn-secondary"
                        style={{ flex: 1 }}
                        onClick={() => onCanvasSettingsChange({
                          ...canvasSettings,
                          backgroundImage: undefined,
                          backgroundImageOpacity: undefined,
                        })}
                      >
                        Remove Background Image
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Template Static Texts (applies to all images) */}
          {onCanvasSettingsChange && (
            <div className="sidebar-section">
              <h3>Template Texts <span className="section-badge template">All</span></h3>
              <button className="add-text-btn" onClick={addTemplateStaticText}>
                + Add Template Text
              </button>
              {templateStaticTexts.length > 0 && (
                <div className="static-text-list">
                  {templateStaticTexts.map((st) => (
                    <div
                      key={st.id}
                      className={`static-text-item template ${st.id === selectedStaticId ? 'selected' : ''}`}
                      onClick={() => selectStatic(st.id)}
                    >
                      <span className="static-text-preview">{st.text}</span>
                      <button
                        className="static-text-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStaticText(st.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save/Load Template */}
              <div className="template-actions">
                <button className="btn-template-action save" onClick={saveTemplate} title="Save all settings to file">
                  Save Template
                </button>
                <label className="btn-template-action load" title="Load settings from file">
                  Load Template
                  <input
                    type="file"
                    accept=".json"
                    onChange={loadTemplate}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Save/Load Project */}
              <div className="project-actions">
                <span className="project-actions-label">Project</span>
                <div className="project-actions-buttons">
                  <button className="btn-project-action save" onClick={saveProject} title="Save entire project with all images">
                    Save Project
                  </button>
                  <label className="btn-project-action load" title="Load project from file">
                    Load Project
                    <input
                      type="file"
                      accept=".json"
                      onChange={loadProject}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Per-Image Static Texts (only for current image) */}
          {onImagesChange && (
            <div className="sidebar-section">
              <h3>Image Texts <span className="section-badge per-image">#{currentIndex + 1}</span></h3>
              <button className="add-text-btn" onClick={addImageStaticText}>
                + Add Text (This Image)
              </button>
              {imageStaticTexts.length > 0 && (
                <div className="static-text-list">
                  {imageStaticTexts.map((st) => (
                    <div
                      key={st.id}
                      className={`static-text-item per-image ${st.id === selectedStaticId ? 'selected' : ''}`}
                      onClick={() => selectStatic(st.id)}
                    >
                      <span className="static-text-preview">{st.text}</span>
                      <button
                        className="static-text-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStaticText(st.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cropped Images (from original) */}
          {onImagesChange && (
            <div className="sidebar-section">
              <h3>擷取圖片 <span className="section-badge per-image">#{currentIndex + 1}</span></h3>
              <button className="add-text-btn" onClick={() => setShowCropModal(true)}>
                + 從原圖擷取
              </button>
              {croppedImages.length > 0 && (
                <div className="cropped-image-grid">
                  {croppedImages.map((crop) => (
                    <div
                      key={crop.id}
                      className={`cropped-image-grid-item ${crop.id === selectedCropId ? 'selected' : ''}`}
                      onClick={() => selectCrop(crop.id)}
                    >
                      <img src={crop.imageData} alt="Cropped" />
                      <button
                        className="cropped-image-grid-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCroppedImage(crop.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected Static Text Settings */}
          {selectedStatic && (isSelectedTemplate ? onCanvasSettingsChange : onImagesChange) && (
            <div className="sidebar-section field-settings">
              <h3>Text Settings <span className={`section-badge ${isSelectedTemplate ? 'template' : 'per-image'}`}>{isSelectedTemplate ? 'Template' : 'Image'}</span></h3>

              <div className="setting-row">
                <label>Text</label>
                <input
                  type="text"
                  value={selectedStatic.text}
                  onChange={(e) => updateStaticText(selectedStatic.id, { text: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>

              <div className="setting-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedStatic.x}
                  onChange={(e) => updateStaticText(selectedStatic.id, { x: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedStatic.y}
                  onChange={(e) => updateStaticText(selectedStatic.id, { y: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Font Size</label>
                <input
                  type="number"
                  value={selectedStatic.fontSize}
                  min={8}
                  max={200}
                  onChange={(e) => updateStaticText(selectedStatic.id, { fontSize: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Weight</label>
                <select
                  value={selectedStatic.fontWeight}
                  onChange={(e) => updateStaticText(selectedStatic.id, { fontWeight: e.target.value as StaticText['fontWeight'] })}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="300">Light</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi Bold</option>
                  <option value="700">Bold</option>
                  <option value="800">Extra Bold</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Color</label>
                <input
                  type="color"
                  value={selectedStatic.color}
                  onChange={(e) => updateStaticText(selectedStatic.id, { color: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <label>Opacity</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={selectedStatic.opacity}
                  onChange={(e) => updateStaticText(selectedStatic.id, { opacity: Number(e.target.value) })}
                />
                <span>{Math.round(selectedStatic.opacity * 100)}%</span>
              </div>

              <div className="setting-row">
                <label>Rotation</label>
                <input
                  type="number"
                  value={selectedStatic.rotation || 0}
                  onChange={(e) => updateStaticText(selectedStatic.id, { rotation: Number(e.target.value) })}
                />
                <span>°</span>
              </div>

              {/* Convert button */}
              {onCanvasSettingsChange && onImagesChange && (
                <div className="setting-row">
                  <button
                    className={`btn-convert ${isSelectedTemplate ? 'to-image' : 'to-template'}`}
                    onClick={() => convertStaticText(selectedStatic.id)}
                    title={isSelectedTemplate ? '轉換為圖片專屬文字' : '轉換為模板文字 (套用至所有圖片)'}
                  >
                    {isSelectedTemplate ? '→ 轉為 Image Text' : '→ 轉為 Template Text'}
                  </button>
                </div>
              )}

              <p className="setting-hint">
                Arrow: move 1px | Shift+Arrow: 10px<br />
                Delete: remove text
              </p>
            </div>
          )}

          {/* Field settings (when selected) */}
          {selectedField && onFieldsChange && (
            <div className="sidebar-section field-settings">
              <h3>{selectedField.name}</h3>

              <div className="setting-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedField.x}
                  onChange={(e) => updateField(selectedField.id, { x: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedField.y}
                  onChange={(e) => updateField(selectedField.id, { y: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Width</label>
                <input
                  type="number"
                  value={selectedField.width}
                  onChange={(e) => updateField(selectedField.id, { width: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Font Size</label>
                <input
                  type="number"
                  value={selectedField.fontSize}
                  min={8}
                  max={200}
                  onChange={(e) => updateField(selectedField.id, { fontSize: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Weight</label>
                <select
                  value={selectedField.fontWeight}
                  onChange={(e) => updateField(selectedField.id, { fontWeight: e.target.value as FieldTemplate['fontWeight'] })}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="300">Light</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi Bold</option>
                  <option value="700">Bold</option>
                  <option value="800">Extra Bold</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Color</label>
                <input
                  type="color"
                  value={selectedField.color}
                  onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <label>Align</label>
                <div className="align-buttons">
                  <button
                    className={selectedField.textAlign === 'left' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'left' })}
                  >L</button>
                  <button
                    className={selectedField.textAlign === 'center' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'center' })}
                  >C</button>
                  <button
                    className={selectedField.textAlign === 'right' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { textAlign: 'right' })}
                  >R</button>
                </div>
              </div>

              <div className="setting-row">
                <label>Display</label>
                <div className="align-buttons">
                  <button
                    className={selectedField.displayMode !== 'original' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { displayMode: 'translated' })}
                    title="顯示翻譯文"
                  >中文</button>
                  <button
                    className={selectedField.displayMode === 'original' ? 'active' : ''}
                    onClick={() => updateField(selectedField.id, { displayMode: 'original' })}
                    title="顯示原文"
                  >EN</button>
                </div>
              </div>

              <p className="setting-hint">
                Arrow: move 1px | Shift+Arrow: 10px<br />
                Drag corner: resize font
              </p>
            </div>
          )}

          {/* Cropped Image settings (when selected) */}
          {selectedCrop && onImagesChange && (
            <div className="sidebar-section field-settings">
              <h3>擷取圖片設定</h3>

              <div className="crop-preview-thumb">
                <img src={selectedCrop.imageData} alt="Cropped preview" />
              </div>

              <div className="setting-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedCrop.x}
                  onChange={(e) => updateCroppedImage(selectedCrop.id, { x: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedCrop.y}
                  onChange={(e) => updateCroppedImage(selectedCrop.id, { y: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label>寬度</label>
                <input
                  type="number"
                  value={selectedCrop.outputWidth}
                  min={10}
                  onChange={(e) => {
                    const newWidth = Number(e.target.value);
                    const aspectRatio = selectedCrop.outputHeight / selectedCrop.outputWidth;
                    updateCroppedImage(selectedCrop.id, {
                      outputWidth: newWidth,
                      outputHeight: Math.round(newWidth * aspectRatio),
                    });
                  }}
                />
              </div>

              <div className="setting-row">
                <label>高度</label>
                <input
                  type="number"
                  value={selectedCrop.outputHeight}
                  min={10}
                  onChange={(e) => {
                    const newHeight = Number(e.target.value);
                    const aspectRatio = selectedCrop.outputWidth / selectedCrop.outputHeight;
                    updateCroppedImage(selectedCrop.id, {
                      outputHeight: newHeight,
                      outputWidth: Math.round(newHeight * aspectRatio),
                    });
                  }}
                />
              </div>

              <div className="setting-row">
                <label>縮放 %</label>
                <input
                  type="range"
                  min="10"
                  max="300"
                  value={Math.round((selectedCrop.outputWidth / selectedCrop.sourceRect.width) * 100)}
                  onChange={(e) => {
                    const scale = Number(e.target.value) / 100;
                    updateCroppedImage(selectedCrop.id, {
                      outputWidth: Math.round(selectedCrop.sourceRect.width * scale),
                      outputHeight: Math.round(selectedCrop.sourceRect.height * scale),
                    });
                  }}
                />
                <span>{Math.round((selectedCrop.outputWidth / selectedCrop.sourceRect.width) * 100)}%</span>
              </div>

              <div className="setting-row">
                <button
                  className="btn-danger"
                  onClick={() => deleteCroppedImage(selectedCrop.id)}
                >
                  刪除擷取圖片
                </button>
              </div>

              <p className="setting-hint">
                Arrow: move 1px | Shift+Arrow: 10px<br />
                Delete: remove image
              </p>
            </div>
          )}

          {/* Field preview list */}
          {!selectedField && !selectedStatic && !selectedCrop && (
            <div className="sidebar-section">
              <h3>Fields</h3>
              <div className="field-preview-list">
                {fields.map((field) => {
                  const content = currentImage.fields[field.id];
                  const isOriginal = field.displayMode === 'original';
                  const displayText = isOriginal ? content?.original : content?.translated;
                  return (
                    <div
                      key={field.id}
                      className="field-preview-item clickable"
                      onClick={() => selectField(field.id)}
                    >
                      <div className="field-preview-header">
                        <span className="field-preview-label">{field.name}</span>
                        <span className={`field-mode-badge ${isOriginal ? 'original' : 'translated'}`}>
                          {isOriginal ? 'EN' : '中'}
                        </span>
                      </div>
                      <span className="field-preview-content">
                        {displayText || <em className="no-content">(empty)</em>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="preview-actions">
        <button className="btn-back" onClick={onBack}>
          &#8592; Back
        </button>

        <div className="export-buttons">
          <ExportButton
            type="single"
            onClick={exportSingle}
            loading={exporting && exportProgress === 0}
          />
          <ExportButton
            type="all"
            onClick={exportAll}
            loading={exporting && exportProgress > 0}
            count={images.length}
            progress={exportProgress}
          />
        </div>
      </div>
    </div>

    {/* Image Crop Modal */}
    {showCropModal && currentImage && onImagesChange && (
      <ImageCropModal
        imageData={currentImage.originalImage}
        imageWidth={currentImage.width}
        imageHeight={currentImage.height}
        canvasWidth={canvasSettings.width}
        canvasHeight={canvasSettings.height}
        onClose={() => setShowCropModal(false)}
        onConfirm={(croppedImage) => {
          const updatedCrops = [...(currentImage.croppedImages || []), croppedImage];
          onImagesChange(
            images.map((img) =>
              img.id === currentImage.id ? { ...img, croppedImages: updatedCrops } : img
            )
          );
          setShowCropModal(false);
        }}
      />
    )}
    </>
  );
};

export default Preview;
