/**
 * EditorState - 統一狀態管理 + 事件系統
 * 參考 mini-canvas-editor 的 editor-state.ts 架構
 */

import type { SlideContent, AIGenerationInput, GeneratedContent } from '../types';

/** 簡單事件系統 */
export class SimpleEvent<T> {
  private listeners: Array<(data: T) => void> = [];

  subscribe(listener: (data: T) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(data: T): void {
    this.listeners.forEach((listener) => listener(data));
  }
}

/** 歷史記錄項目 (用於 Undo/Redo) */
interface HistoryEntry {
  slides: SlideContent[];
  timestamp: number;
}

/** 編輯器配置 */
export interface EditorConfiguration {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  maxHistorySize: number;
}

/** 預設配置 */
const DEFAULT_CONFIG: EditorConfiguration = {
  canvasWidth: 1080,
  canvasHeight: 1080,
  backgroundColor: '#1a1a2e',
  maxHistorySize: 50,
};

/**
 * EditorState 類
 * 管理所有編輯狀態、歷史記錄、事件訂閱
 */
export class EditorState {
  // 事件
  readonly onSlidesChanged = new SimpleEvent<SlideContent[]>();
  readonly onInputChanged = new SimpleEvent<AIGenerationInput>();
  readonly onSelectionChanged = new SimpleEvent<string | null>();
  readonly onHistoryChanged = new SimpleEvent<{ canUndo: boolean; canRedo: boolean }>();
  readonly onZoomChanged = new SimpleEvent<number>();

  // 配置
  readonly configuration: EditorConfiguration;

  // 私有狀態
  private _slides: SlideContent[] = [];
  private _input: AIGenerationInput;
  private _selectedSlideId: string | null = null;
  private _zoom = 1;

  // 歷史記錄 (Undo/Redo)
  private _history: HistoryEntry[] = [];
  private _historyIndex = -1;
  private _isUndoRedoing = false;

  constructor(
    initialInput: AIGenerationInput,
    config: Partial<EditorConfiguration> = {}
  ) {
    this._input = initialInput;
    this.configuration = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== Slides 管理 ====================

  get slides(): SlideContent[] {
    return this._slides;
  }

  setSlides(slides: SlideContent[], recordHistory = true): void {
    if (recordHistory && !this._isUndoRedoing) {
      this._recordHistory();
    }
    this._slides = slides;
    this.onSlidesChanged.emit(slides);

    // 如果選中的 slide 被刪除，清除選擇
    if (this._selectedSlideId && !slides.find((s) => s.id === this._selectedSlideId)) {
      this.setSelectedSlideId(slides[0]?.id || null);
    }
  }

  updateSlide(slideId: string, updates: Partial<SlideContent>): void {
    const newSlides = this._slides.map((s) =>
      s.id === slideId ? { ...s, ...updates } : s
    );
    this.setSlides(newSlides);
  }

  deleteSlide(slideId: string): void {
    const newSlides = this._slides.filter((s) => s.id !== slideId);
    this.setSlides(newSlides);
  }

  addSlide(slide?: Partial<SlideContent>): SlideContent {
    const newSlide: SlideContent = {
      id: `slide-${Date.now()}`,
      title: '新卡片',
      body: '',
      bulletPoints: [],
      ...slide,
    };
    this.setSlides([...this._slides, newSlide]);
    return newSlide;
  }

  reorderSlides(fromIndex: number, toIndex: number): void {
    const newSlides = [...this._slides];
    const [removed] = newSlides.splice(fromIndex, 1);
    newSlides.splice(toIndex, 0, removed);
    this.setSlides(newSlides);
  }

  // ==================== 選擇管理 ====================

  get selectedSlideId(): string | null {
    return this._selectedSlideId;
  }

  get selectedSlide(): SlideContent | undefined {
    return this._slides.find((s) => s.id === this._selectedSlideId);
  }

  setSelectedSlideId(id: string | null): void {
    this._selectedSlideId = id;
    this.onSelectionChanged.emit(id);
  }

  // ==================== Input 管理 ====================

  get input(): AIGenerationInput {
    return this._input;
  }

  setInput(input: AIGenerationInput): void {
    this._input = input;
    this.onInputChanged.emit(input);
  }

  updateInput(updates: Partial<AIGenerationInput>): void {
    this._input = { ...this._input, ...updates };
    this.onInputChanged.emit(this._input);
  }

  // ==================== Zoom 管理 ====================

  get zoom(): number {
    return this._zoom;
  }

  setZoom(zoom: number): void {
    this._zoom = Math.max(0.25, Math.min(4, zoom));
    this.onZoomChanged.emit(this._zoom);
  }

  // ==================== 歷史記錄 (Undo/Redo) ====================

  private _recordHistory(): void {
    // 截斷 redo 歷史
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }

    // 添加新記錄
    this._history.push({
      slides: JSON.parse(JSON.stringify(this._slides)),
      timestamp: Date.now(),
    });

    // 限制歷史大小
    if (this._history.length > this.configuration.maxHistorySize) {
      this._history.shift();
    } else {
      this._historyIndex++;
    }

    this._emitHistoryState();
  }

  private _emitHistoryState(): void {
    this.onHistoryChanged.emit({
      canUndo: this._historyIndex > 0,
      canRedo: this._historyIndex < this._history.length - 1,
    });
  }

  get canUndo(): boolean {
    return this._historyIndex > 0;
  }

  get canRedo(): boolean {
    return this._historyIndex < this._history.length - 1;
  }

  undo(): void {
    if (!this.canUndo) return;

    this._isUndoRedoing = true;
    this._historyIndex--;
    this._slides = JSON.parse(JSON.stringify(this._history[this._historyIndex].slides));
    this.onSlidesChanged.emit(this._slides);
    this._emitHistoryState();
    this._isUndoRedoing = false;
  }

  redo(): void {
    if (!this.canRedo) return;

    this._isUndoRedoing = true;
    this._historyIndex++;
    this._slides = JSON.parse(JSON.stringify(this._history[this._historyIndex].slides));
    this.onSlidesChanged.emit(this._slides);
    this._emitHistoryState();
    this._isUndoRedoing = false;
  }

  // 初始化歷史（載入內容後調用）
  initHistory(): void {
    this._history = [{
      slides: JSON.parse(JSON.stringify(this._slides)),
      timestamp: Date.now(),
    }];
    this._historyIndex = 0;
    this._emitHistoryState();
  }

  // ==================== 序列化 (JSON 儲存/載入) ====================

  toJSON(): string {
    return JSON.stringify({
      version: 1,
      input: this._input,
      slides: this._slides,
      timestamp: Date.now(),
    });
  }

  static fromJSON(json: string): { input: AIGenerationInput; slides: SlideContent[] } | null {
    try {
      const data = JSON.parse(json);
      if (data.version !== 1) {
        console.warn('Unknown save version:', data.version);
      }
      return {
        input: data.input,
        slides: data.slides,
      };
    } catch (e) {
      console.error('Failed to parse saved data:', e);
      return null;
    }
  }

  // 從生成結果載入
  loadFromGeneratedContent(content: GeneratedContent): void {
    this.setSlides(content.slides, false);
    if (content.slides.length > 0) {
      this.setSelectedSlideId(content.slides[0].id);
    }
    this.initHistory();
  }

  // 重置
  reset(): void {
    this._slides = [];
    this._selectedSlideId = null;
    this._history = [];
    this._historyIndex = -1;
    this._zoom = 1;
    this.onSlidesChanged.emit([]);
    this.onSelectionChanged.emit(null);
    this.onZoomChanged.emit(1);
    this._emitHistoryState();
  }
}

export default EditorState;
