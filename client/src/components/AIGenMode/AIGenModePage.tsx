import { useState, useCallback, useEffect } from 'react';
import { InputStep } from './InputStep';
import { ConfirmStep } from './ConfirmStep';
import { PreviewStep } from './PreviewStep';
import { useEditorState, useAutoSave } from './editor';
import type { AIGenStep, GeneratedContent } from './types';
import './AIGenModePage.css';

interface AIGenModePageProps {
  onBack?: () => void;
}

/**
 * AI Generation Mode 主頁面
 * 使用 EditorState 統一狀態管理
 * 流程：輸入 -> 確認 -> 生成 -> 預覽
 */
export function AIGenModePage({ onBack }: AIGenModePageProps) {
  // EditorState Hook
  const {
    slides,
    input,
    canUndo,
    canRedo,
    updateSlide,
    deleteSlide,
    addSlide,
    reorderSlides,
    setInput,
    undo,
    redo,
    reset,
    loadFromGeneratedContent,
    editorState,
  } = useEditorState();

  // 草稿自動儲存
  const { lastSaved, loadDraft, clearDraft, hasDraft } = useAutoSave(editorState);

  // 步驟管理
  const [currentStep, setCurrentStep] = useState<AIGenStep>('input');

  // 載入狀態
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 檢查是否有草稿可載入
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  useEffect(() => {
    if (hasDraft()) {
      setShowDraftPrompt(true);
    }
  }, [hasDraft]);

  // 步驟設定
  const steps: AIGenStep[] = ['input', 'confirm', 'generate', 'preview'];
  const stepLabels: Record<AIGenStep, string> = {
    input: '輸入',
    confirm: '確認',
    generate: '生成',
    preview: '預覽',
  };
  const currentStepIndex = steps.indexOf(currentStep);

  // 載入草稿
  const handleLoadDraft = useCallback(() => {
    const data = loadDraft();
    if (data && data.slides.length > 0) {
      setCurrentStep('confirm');
    }
    setShowDraftPrompt(false);
  }, [loadDraft]);

  // 忽略草稿
  const handleIgnoreDraft = useCallback(() => {
    clearDraft();
    setShowDraftPrompt(false);
  }, [clearDraft]);

  // 生成內容
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setGenerateProgress(10);

    try {
      const response = await fetch('/api/ai-generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: input.mode,
          topic: input.topic,
          rawContent: input.rawContent,
          slideCount: input.slideCount,
          style: input.style,
          language: input.language,
        }),
      });

      setGenerateProgress(60);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '內容生成失敗');
      }

      const data: GeneratedContent = await response.json();
      loadFromGeneratedContent(data);
      setGenerateProgress(100);

      // 進入確認步驟
      setCurrentStep('confirm');
    } catch (err) {
      console.error('Generate error:', err);
      setError(err instanceof Error ? err.message : '生成失敗，請稍後再試');
    } finally {
      setIsGenerating(false);
      setGenerateProgress(0);
    }
  }, [input, loadFromGeneratedContent]);

  // 搜尋圖片
  const handleSearchImage = useCallback(async (_slideId: string, query: string) => {
    try {
      const response = await fetch(`/api/images/search?q=${encodeURIComponent(query)}&count=6`);
      if (!response.ok) throw new Error('圖片搜尋失敗');

      const data = await response.json();
      return data.images;
    } catch (err) {
      console.error('Image search error:', err);
      setError('圖片搜尋失敗');
      return [];
    }
  }, []);

  // 重新生成單張
  const handleRegenerateSlide = useCallback(async (slideId: string) => {
    // TODO: 實作單張重新生成
    console.log('Regenerate slide:', slideId);
  }, []);

  // 清除並返回
  const handleClear = useCallback(() => {
    reset();
    clearDraft();
    setCurrentStep('input');
    setError(null);
  }, [reset, clearDraft]);

  // 下一步
  const handleNext = useCallback(() => {
    switch (currentStep) {
      case 'input':
        handleGenerate();
        break;
      case 'confirm':
        setCurrentStep('preview');
        break;
    }
  }, [currentStep, handleGenerate]);

  // 上一步
  const handlePrev = useCallback(() => {
    switch (currentStep) {
      case 'confirm':
        setCurrentStep('input');
        break;
      case 'preview':
        setCurrentStep('confirm');
        break;
    }
  }, [currentStep]);

  // 檢查是否可以下一步
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'input':
        if (input.mode === 'topic') {
          return (input.topic ?? '').trim().length > 0;
        } else {
          return (input.rawContent ?? '').trim().length > 0;
        }
      case 'confirm':
        return slides.length > 0;
      default:
        return false;
    }
  }, [currentStep, input, slides]);

  // 鍵盤快捷鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl/Cmd + Shift + Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      // Ctrl/Cmd + Y = Redo (Windows style)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="ai-gen-page">
      {/* 草稿提示 */}
      {showDraftPrompt && (
        <div className="draft-prompt">
          <div className="draft-prompt-content">
            <span>發現未儲存的草稿，是否載入？</span>
            <div className="draft-prompt-actions">
              <button onClick={handleLoadDraft}>載入草稿</button>
              <button onClick={handleIgnoreDraft} className="secondary">
                重新開始
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ai-gen-header">
        <div className="ai-gen-header-left">
          {onBack && (
            <button className="btn-back" onClick={onBack}>
              ← 返回
            </button>
          )}
          <div className="ai-gen-title" onClick={handleClear}>
            <img src="/logo.png" alt="PasteV" className="ai-gen-logo" />
            <h1>AI 生成模式</h1>
          </div>
        </div>
        <div className="ai-gen-header-right">
          {/* Undo/Redo 按鈕 */}
          {currentStep === 'confirm' && (
            <div className="undo-redo-buttons">
              <button
                className="btn-icon"
                onClick={undo}
                disabled={!canUndo}
                title="復原 (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                className="btn-icon"
                onClick={redo}
                disabled={!canRedo}
                title="重做 (Ctrl+Shift+Z)"
              >
                ↷
              </button>
            </div>
          )}
          {/* 自動儲存狀態 */}
          {lastSaved && currentStep === 'confirm' && (
            <span className="auto-save-status">
              已儲存 {lastSaved.toLocaleTimeString()}
            </span>
          )}
          {slides.length > 0 && (
            <button className="btn-clear" onClick={handleClear}>
              重新開始
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="ai-gen-steps">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step-item ${currentStep === step ? 'active' : ''} ${index < currentStepIndex ? 'completed' : ''}`}
          >
            <div className="step-number">
              {index < currentStepIndex ? '✓' : index + 1}
            </div>
            <span className="step-label">{stepLabels[step]}</span>
            {index < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="ai-gen-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Content */}
      <div className="ai-gen-content">
        {currentStep === 'input' && (
          <InputStep
            input={input}
            onChange={setInput}
            isGenerating={isGenerating}
            progress={generateProgress}
          />
        )}

        {currentStep === 'confirm' && (
          <ConfirmStep
            slides={slides}
            includeImages={input.includeImages}
            onUpdateSlide={updateSlide}
            onDeleteSlide={deleteSlide}
            onAddSlide={addSlide}
            onReorderSlides={reorderSlides}
            onRegenerateSlide={handleRegenerateSlide}
            onSearchImage={handleSearchImage}
          />
        )}

        {currentStep === 'preview' && (
          <PreviewStep
            slides={slides}
            canvasSettings={{
              width: 1080,
              height: 1080,
              backgroundColor: '#1a1a2e',
            }}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="ai-gen-nav">
        <button
          className="btn-prev"
          onClick={handlePrev}
          disabled={currentStep === 'input'}
        >
          ← 上一步
        </button>
        {currentStep !== 'preview' ? (
          <button
            className="btn-next"
            onClick={handleNext}
            disabled={!canProceed() || isGenerating}
          >
            {isGenerating ? '生成中...' : currentStep === 'input' ? '開始生成 →' : '下一步 →'}
          </button>
        ) : (
          <button className="btn-next btn-done">
            完成
          </button>
        )}
      </div>
    </div>
  );
}

export default AIGenModePage;
