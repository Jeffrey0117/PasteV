/**
 * AI Generation Mode 型別定義
 */

/** 生成模式 */
export type AIGenInputMode = 'topic' | 'content';

/** 內容風格 */
export type AIGenStyle = 'informative' | 'tips' | 'listicle' | 'story';

/** 語言 */
export type AIGenLanguage = 'zh-TW' | 'zh-CN' | 'en';

/** 步驟 */
export type AIGenStep = 'input' | 'confirm' | 'generate' | 'preview';

/** 輸入參數 */
export interface AIGenerationInput {
  mode: AIGenInputMode;
  topic?: string;
  rawContent?: string;
  slideCount: number;
  style: AIGenStyle;
  language: AIGenLanguage;
  includeImages: boolean;
}

/** 內嵌圖片 */
export interface EmbeddedImage {
  id: string;
  url: string;           // base64 或 URL
  thumbnailUrl: string;
  name?: string;         // 檔名或描述
}

/** 單張卡片內容 */
export interface SlideContent {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  bulletPoints?: string[];
  footnote?: string;
  imageKeywords?: string[];
  /** 內嵌素材圖片（產品圖、截圖等） */
  images?: EmbeddedImage[];
  suggestedImage?: {
    id: string;
    url: string;
    thumbnailUrl: string;
    author: string;
    source: 'unsplash' | 'pexels';
  };
}

/** AI 生成結果 */
export interface GeneratedContent {
  slides: SlideContent[];
  suggestedTemplate: string;
}

/** 圖片搜尋結果 */
export interface ImageSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  author: string;
  authorUrl?: string;
  source: 'unsplash' | 'pexels';
  width: number;
  height: number;
}

/** 預設輸入值 */
export const DEFAULT_INPUT: AIGenerationInput = {
  mode: 'topic',
  topic: '',
  rawContent: '',
  slideCount: 5,
  style: 'informative',
  language: 'zh-TW',
  includeImages: true,
};

/** 風格選項 */
export const STYLE_OPTIONS: { value: AIGenStyle; label: string; description: string }[] = [
  { value: 'informative', label: '知識型', description: '適合教學、科普內容' },
  { value: 'tips', label: '技巧型', description: '適合小技巧、建議分享' },
  { value: 'listicle', label: '清單型', description: '適合排行榜、推薦列表' },
  { value: 'story', label: '故事型', description: '適合案例分享、經驗談' },
];

/** 語言選項 */
export const LANGUAGE_OPTIONS: { value: AIGenLanguage; label: string }[] = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];
