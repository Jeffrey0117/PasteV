/**
 * PasteV 共用型別定義
 */

// ============================================
// 欄位模板
// ============================================

/**
 * 欄位模板定義
 * 描述一個文字欄位的位置與樣式
 */
export interface FieldTemplate {
  /** 唯一識別碼 */
  id: string;

  /** 欄位名稱，如 "標題"、"副標題"、"內文" */
  name: string;

  /** X 座標 (px) */
  x: number;

  /** Y 座標 (px) */
  y: number;

  /** 寬度 (px)，用於文字換行 */
  width: number;

  /** 字體大小 (px) */
  fontSize: number;

  /** 字重 */
  fontWeight: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

  /** 文字顏色 (hex) */
  color: string;

  /** 文字對齊 */
  textAlign: 'left' | 'center' | 'right';

  /** 行高 (可選) */
  lineHeight?: number;

  /** 字體 (可選) */
  fontFamily?: string;

  /** 顯示模式：translated=翻譯文, original=原文 */
  displayMode?: 'translated' | 'original';
}

// ============================================
// 欄位內容
// ============================================

/**
 * 單一欄位的內容 (原文 + 譯文)
 */
export interface FieldContent {
  /** 英文原文 */
  original: string;

  /** 中文翻譯 */
  translated: string;
}

// ============================================
// 圖片資料
// ============================================

/** 圖片處理狀態 */
export type ImageStatus =
  | 'pending'      // 等待處理
  | 'uploading'    // 上傳中
  | 'ocr'          // OCR 處理中
  | 'ocr_done'     // OCR 完成
  | 'parsing'      // AI 解析中
  | 'parsed'       // 解析完成
  | 'translating'  // 翻譯中
  | 'translated'   // 翻譯完成
  | 'ready'        // 就緒可輸出
  | 'error';       // 錯誤

/**
 * 單張圖片的完整資料
 */
export interface ImageData {
  /** 唯一識別碼 */
  id: string;

  /** 原始圖片 base64 */
  originalImage: string;

  /** 圖片寬度 */
  width: number;

  /** 圖片高度 */
  height: number;

  /** OCR 原始全文 */
  ocrText: string;

  /** 各欄位內容，key 為 FieldTemplate.id */
  fields: Record<string, FieldContent>;

  /** 處理狀態 */
  status: ImageStatus;

  /** 該圖片專屬的靜態文字 (浮水印/Logo) */
  staticTexts?: StaticText[];
}

// ============================================
// 專案狀態
// ============================================

/** 應用步驟 */
export type AppStep =
  | 'upload'    // 上傳圖片
  | 'fields'    // 定義欄位
  | 'edit'      // 表格編輯
  | 'preview';  // 預覽輸出

/** 畫布設定 */
export interface CanvasSettings {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  /** 模板靜態文字 (套用到所有圖片) */
  templateStaticTexts?: StaticText[];
}

/**
 * 儲存的模板設定
 * 包含欄位模板、畫布設定、靜態文字
 */
export interface SavedTemplate {
  /** 模板名稱 */
  name: string;
  /** 儲存時間 */
  savedAt: string;
  /** 版本號 */
  version: string;
  /** 欄位模板 */
  fieldTemplates: FieldTemplate[];
  /** 畫布設定 */
  canvasSettings: CanvasSettings;
}

/**
 * 靜態文字 (浮水印/Logo)
 * 會顯示在所有圖片上的固定文字
 */
export interface StaticText {
  /** 唯一識別碼 */
  id: string;

  /** 文字內容 */
  text: string;

  /** X 座標 (px) */
  x: number;

  /** Y 座標 (px) */
  y: number;

  /** 字體大小 (px) */
  fontSize: number;

  /** 字重 */
  fontWeight: 'normal' | 'bold' | '300' | '500' | '600' | '700' | '800';

  /** 文字顏色 (hex) */
  color: string;

  /** 透明度 (0-1) */
  opacity: number;

  /** 旋轉角度 (度) */
  rotation?: number;
}

/**
 * 整個專案的狀態
 */
export interface ProjectState {
  /** 所有圖片 */
  images: ImageData[];

  /** 欄位模板 (從第一張圖定義) */
  fieldTemplates: FieldTemplate[];

  /** 當前步驟 */
  currentStep: AppStep;

  /** 當前選中的圖片索引 */
  currentImageIndex: number;

  /** 當前選中的欄位 ID */
  selectedFieldId: string | null;

  /** 畫布設定 */
  canvasSettings: CanvasSettings;
}

// ============================================
// API 型別
// ============================================

/** AI 解析請求 */
export interface ParseRequest {
  /** 欄位定義 */
  fields: Array<{
    id: string;
    name: string;
    description?: string;
  }>;

  /** 各圖片的 OCR 文字 */
  images: Array<{
    id: string;
    ocrText: string;
  }>;
}

/** AI 解析回應 */
export interface ParseResponse {
  success: boolean;
  /** 解析結果，key 為圖片 ID */
  results: Record<string, Record<string, string>>;
  error?: string;
}

/** 批次翻譯請求 */
export interface TranslateRequest {
  /** 要翻譯的文字列表 */
  texts: Array<{
    /** 識別用，格式: imageId:fieldId */
    key: string;
    /** 原文 */
    text: string;
  }>;

  /** 來源語言 */
  sourceLang?: string;

  /** 目標語言 */
  targetLang?: string;
}

/** 批次翻譯回應 */
export interface TranslateResponse {
  success: boolean;
  /** 翻譯結果，key 對應請求的 key */
  translations: Record<string, string>;
  /** 統計資訊 */
  stats?: {
    total: number;
    translated: number;
    cached: number;
  };
  error?: string;
}

// ============================================
// 工具函式
// ============================================

/** 產生唯一 ID */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** 建立預設欄位模板 */
export function createDefaultField(name: string, index: number): FieldTemplate {
  return {
    id: generateId('field'),
    name,
    x: 50,
    y: 50 + index * 60,
    width: 300,
    fontSize: 24,
    fontWeight: 'normal',
    color: '#ffffff',
    textAlign: 'left',
  };
}

/** 建立預設圖片資料 */
export function createImageData(base64: string, width: number, height: number): ImageData {
  return {
    id: generateId('img'),
    originalImage: base64,
    width,
    height,
    ocrText: '',
    fields: {},
    status: 'pending',
    staticTexts: [],
  };
}

/** 建立預設專案狀態 */
export function createDefaultProject(): ProjectState {
  return {
    images: [],
    fieldTemplates: [
      createDefaultField('標題', 0),
      createDefaultField('副標題', 1),
    ],
    currentStep: 'upload',
    currentImageIndex: 0,
    selectedFieldId: null,
    canvasSettings: {
      width: 800,
      height: 600,
      backgroundColor: '#1a1a2e',
    },
  };
}
