/**
 * useEditorState - React Hook for EditorState
 * 提供響應式的狀態訂閱
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { EditorState, type EditorConfiguration } from './EditorState';
import type { SlideContent, AIGenerationInput, GeneratedContent } from '../types';
import { DEFAULT_INPUT } from '../types';

interface UseEditorStateReturn {
  // State
  slides: SlideContent[];
  selectedSlide: SlideContent | undefined;
  selectedSlideId: string | null;
  input: AIGenerationInput;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  setSlides: (slides: SlideContent[]) => void;
  updateSlide: (slideId: string, updates: Partial<SlideContent>) => void;
  deleteSlide: (slideId: string) => void;
  addSlide: (slide?: Partial<SlideContent>) => SlideContent;
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  setSelectedSlideId: (id: string | null) => void;
  setInput: (input: AIGenerationInput) => void;
  updateInput: (updates: Partial<AIGenerationInput>) => void;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  loadFromGeneratedContent: (content: GeneratedContent) => void;
  toJSON: () => string;

  // EditorState instance (for advanced usage)
  editorState: EditorState;
}

export function useEditorState(
  config?: Partial<EditorConfiguration>
): UseEditorStateReturn {
  // 創建 EditorState 實例
  const editorState = useMemo(
    () => new EditorState(DEFAULT_INPUT, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // 只在首次創建
  );

  // React 狀態 (響應式)
  const [slides, setSlides] = useState<SlideContent[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [input, setInput] = useState<AIGenerationInput>(DEFAULT_INPUT);
  const [zoom, setZoom] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 訂閱事件
  useEffect(() => {
    const unsubSlides = editorState.onSlidesChanged.subscribe(setSlides);
    const unsubSelection = editorState.onSelectionChanged.subscribe(setSelectedSlideId);
    const unsubInput = editorState.onInputChanged.subscribe(setInput);
    const unsubZoom = editorState.onZoomChanged.subscribe(setZoom);
    const unsubHistory = editorState.onHistoryChanged.subscribe(({ canUndo, canRedo }) => {
      setCanUndo(canUndo);
      setCanRedo(canRedo);
    });

    return () => {
      unsubSlides();
      unsubSelection();
      unsubInput();
      unsubZoom();
      unsubHistory();
    };
  }, [editorState]);

  // 計算 selectedSlide
  const selectedSlide = useMemo(
    () => slides.find((s) => s.id === selectedSlideId),
    [slides, selectedSlideId]
  );

  // 包裝 actions
  const actions = useMemo(
    () => ({
      setSlides: (slides: SlideContent[]) => editorState.setSlides(slides),
      updateSlide: (slideId: string, updates: Partial<SlideContent>) =>
        editorState.updateSlide(slideId, updates),
      deleteSlide: (slideId: string) => editorState.deleteSlide(slideId),
      addSlide: (slide?: Partial<SlideContent>) => editorState.addSlide(slide),
      reorderSlides: (fromIndex: number, toIndex: number) =>
        editorState.reorderSlides(fromIndex, toIndex),
      setSelectedSlideId: (id: string | null) => editorState.setSelectedSlideId(id),
      setInput: (input: AIGenerationInput) => editorState.setInput(input),
      updateInput: (updates: Partial<AIGenerationInput>) => editorState.updateInput(updates),
      setZoom: (zoom: number) => editorState.setZoom(zoom),
      undo: () => editorState.undo(),
      redo: () => editorState.redo(),
      reset: () => editorState.reset(),
      loadFromGeneratedContent: (content: GeneratedContent) =>
        editorState.loadFromGeneratedContent(content),
      toJSON: () => editorState.toJSON(),
    }),
    [editorState]
  );

  return {
    slides,
    selectedSlide,
    selectedSlideId,
    input,
    zoom,
    canUndo,
    canRedo,
    ...actions,
    editorState,
  };
}

/**
 * 草稿自動儲存 Hook
 */
export function useAutoSave(
  editorState: EditorState,
  storageKey = 'ai-gen-draft',
  debounceMs = 2000
) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const unsubscribe = editorState.onSlidesChanged.subscribe(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const json = editorState.toJSON();
        localStorage.setItem(storageKey, json);
        setLastSaved(new Date());
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [editorState, storageKey, debounceMs]);

  const loadDraft = useCallback(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;

    const data = EditorState.fromJSON(saved);
    if (data) {
      editorState.setInput(data.input);
      editorState.setSlides(data.slides, false);
      editorState.initHistory();
    }
    return data;
  }, [editorState, storageKey]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setLastSaved(null);
  }, [storageKey]);

  const hasDraft = useCallback(() => {
    return localStorage.getItem(storageKey) !== null;
  }, [storageKey]);

  return {
    lastSaved,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}

export default useEditorState;
