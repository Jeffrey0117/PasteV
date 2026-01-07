import { useState, useCallback } from 'react';
import { InputStep } from './InputStep';
import { ConfirmStep } from './ConfirmStep';
import { PreviewStep } from './PreviewStep';
import type {
  AIGenStep,
  AIGenerationInput,
  SlideContent,
  GeneratedContent,
} from './types';
import './AIGenModePage.css';

interface AIGenModePageProps {
  onBack?: () => void;
}

/**
 * AI Generation Mode 主頁面
 * 流程：輸入 -> 確認 -> 生成 -> 預覽
 */
export function AIGenModePage({ onBack }: AIGenModePageProps) {
  // 步驟管理
  const [currentStep, setCurrentStep] = useState<AIGenStep>('input');

  // 輸入資料
  const [input, setInput] = useState<AIGenerationInput>({
    mode: 'topic',
    topic: '',
    rawContent: '',
    slideCount: 5,
    style: 'informative',
    language: 'zh-TW',
    includeImages: true,
  });

  // 生成的內容
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [slides, setSlides] = useState<SlideContent[]>([]);

  // 載入狀態
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 步驟設定
  const steps: AIGenStep[] = ['input', 'confirm', 'generate', 'preview'];
  const stepLabels: Record<AIGenStep, string> = {
    input: '輸入',
    confirm: '確認',
    generate: '生成',
    preview: '預覽',
  };
  const currentStepIndex = steps.indexOf(currentStep);

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
      setGeneratedContent(data);
      setSlides(data.slides);
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
  }, [input]);

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

  // 更新 slide
  const handleUpdateSlide = useCallback((slideId: string, updates: Partial<SlideContent>) => {
    setSlides(prev => prev.map(s =>
      s.id === slideId ? { ...s, ...updates } : s
    ));
  }, []);

  // 刪除 slide
  const handleDeleteSlide = useCallback((slideId: string) => {
    setSlides(prev => prev.filter(s => s.id !== slideId));
  }, []);

  // 新增 slide
  const handleAddSlide = useCallback(() => {
    const newSlide: SlideContent = {
      id: `slide-${Date.now()}`,
      title: '新卡片',
      body: '',
      bulletPoints: [],
    };
    setSlides(prev => [...prev, newSlide]);
  }, []);

  // 重新排序
  const handleReorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    setSlides(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  // 重新生成單張
  const handleRegenerateSlide = useCallback(async (slideId: string) => {
    // TODO: 實作單張重新生成
    console.log('Regenerate slide:', slideId);
  }, []);

  // 清除並返回
  const handleClear = useCallback(() => {
    setInput({
      mode: 'topic',
      topic: '',
      rawContent: '',
      slideCount: 5,
      style: 'informative',
      language: 'zh-TW',
      includeImages: true,
    });
    setGeneratedContent(null);
    setSlides([]);
    setCurrentStep('input');
    setError(null);
  }, []);

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

  return (
    <div className="ai-gen-page">
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
          {(generatedContent || slides.length > 0) && (
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
            onUpdateSlide={handleUpdateSlide}
            onDeleteSlide={handleDeleteSlide}
            onAddSlide={handleAddSlide}
            onReorderSlides={handleReorderSlides}
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
