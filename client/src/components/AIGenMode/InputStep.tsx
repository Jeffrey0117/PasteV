import type { AIGenerationInput, AIGenStyle, AIGenLanguage } from './types';
import { STYLE_OPTIONS, LANGUAGE_OPTIONS } from './types';

interface InputStepProps {
  input: AIGenerationInput;
  onChange: (input: AIGenerationInput) => void;
  isGenerating: boolean;
  progress: number;
}

/**
 * Step 1: 輸入步驟
 * 選擇主題生成或內容整理
 */
export function InputStep({ input, onChange, isGenerating, progress }: InputStepProps) {
  const updateInput = (updates: Partial<AIGenerationInput>) => {
    onChange({ ...input, ...updates });
  };

  return (
    <div className="input-step">
      {/* 模式選擇 */}
      <div className="mode-selection">
        <div
          className={`mode-card ${input.mode === 'topic' ? 'active' : ''}`}
          onClick={() => updateInput({ mode: 'topic' })}
        >
          <div className="mode-icon">🎯</div>
          <div className="mode-info">
            <h3>主題生成</h3>
            <p>輸入主題關鍵字，AI 自動生成完整內容</p>
          </div>
        </div>
        <div
          className={`mode-card ${input.mode === 'content' ? 'active' : ''}`}
          onClick={() => updateInput({ mode: 'content' })}
        >
          <div className="mode-icon">📝</div>
          <div className="mode-info">
            <h3>內容整理</h3>
            <p>貼上文字內容，AI 自動拆分成多張卡片</p>
          </div>
        </div>
      </div>

      {/* 輸入區域 */}
      <div className="input-area">
        {input.mode === 'topic' ? (
          <div className="topic-input">
            <label>主題關鍵字</label>
            <input
              type="text"
              value={input.topic || ''}
              onChange={(e) => updateInput({ topic: e.target.value })}
              placeholder="例如：VS Code 必裝插件推薦、Python 學習技巧、健康飲食指南..."
              className="input-main"
              disabled={isGenerating}
            />
          </div>
        ) : (
          <div className="content-input">
            <label>原始內容</label>
            <textarea
              value={input.rawContent || ''}
              onChange={(e) => updateInput({ rawContent: e.target.value })}
              placeholder="貼上你想整理的文字內容，AI 會自動拆分成適合社群媒體的多張卡片..."
              className="input-main textarea"
              rows={8}
              disabled={isGenerating}
            />
          </div>
        )}
      </div>

      {/* 設定區域 */}
      <div className="settings-area">
        <div className="setting-row">
          <div className="setting-item">
            <label>張數</label>
            <select
              value={input.slideCount}
              onChange={(e) => updateInput({ slideCount: parseInt(e.target.value) })}
              disabled={isGenerating}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 張
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>風格</label>
            <select
              value={input.style}
              onChange={(e) => updateInput({ style: e.target.value as AIGenStyle })}
              disabled={isGenerating}
            >
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>語言</label>
            <select
              value={input.language}
              onChange={(e) => updateInput({ language: e.target.value as AIGenLanguage })}
              disabled={isGenerating}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="setting-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={input.includeImages}
              onChange={(e) => updateInput({ includeImages: e.target.checked })}
              disabled={isGenerating}
            />
            <span>自動配圖（使用 Unsplash 免費圖庫）</span>
          </label>
        </div>
      </div>

      {/* 生成進度 */}
      {isGenerating && (
        <div className="generate-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="progress-text">
            AI 正在生成內容... {progress}%
          </span>
        </div>
      )}

      {/* 提示 */}
      <div className="input-tips">
        <h4>小技巧</h4>
        <ul>
          <li>主題越具體，生成的內容越精準</li>
          <li>可以加入目標受眾，例如：「給初學者的 Git 教學」</li>
          <li>風格會影響內容的呈現方式和語氣</li>
        </ul>
      </div>
    </div>
  );
}

export default InputStep;
