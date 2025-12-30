# PasteV - 圖片文案翻譯還原工具

## 專案概述

PasteV 是一個自動化工具，用於將網路上的英文圖片文案轉換為中文版本。整個流程為：
**圖片 OCR → 批次翻譯 → HTML/CSS 還原 → 下載中文版圖片**

目標：無痛複製英文 Canva 風格的圖片內容，自動轉換為中文。

---

## 核心功能

### 1. 圖片文字識別 (OCR)
- 使用 Text-Grab 或其 OCR 引擎識別圖片中的文字
- 支援批次處理多張圖片
- 保留文字的位置資訊（座標、大小）

### 2. 批次翻譯
- 整合 DeepSeek API 進行翻譯
- 批次處理提高效率
- 保留原文與譯文的對應關係

### 3. 版面還原
- 使用 HTML/CSS 重建圖片版面
- 將翻譯後的中文填入對應位置
- 保持原始設計風格（顏色、字體大小、排版）

### 4. 圖片輸出
- 將 HTML 渲染為圖片
- 支援常見格式 (PNG, JPG)
- 可調整輸出解析度

---

## 技術架構

```
┌─────────────────────────────────────────────────────────────┐
│                        PasteV Web App                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React/Vue)                                        │
│  ├── 圖片上傳介面                                            │
│  ├── OCR 結果編輯器                                          │
│  ├── 翻譯預覽/編輯                                           │
│  └── Canvas 編輯器 (調整位置、字體)                          │
├─────────────────────────────────────────────────────────────┤
│  Backend (Node.js/Python)                                    │
│  ├── OCR 服務 (Text-Grab CLI 或 Windows OCR API)            │
│  ├── 翻譯服務 (DeepSeek API)                                 │
│  └── 圖片生成服務 (Puppeteer/html2canvas)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 使用者流程

```
1. 上傳圖片
      ↓
2. 系統自動 OCR 識別文字 + 位置
      ↓
3. 顯示識別結果，使用者可編輯/修正
      ↓
4. 一鍵翻譯 (DeepSeek)
      ↓
5. 預覽中文版面，可微調位置/字體
      ↓
6. 下載中文版圖片
```

---

## 功能規格

### MVP (最小可行產品)

| 功能 | 描述 | 優先級 |
|------|------|--------|
| 單圖上傳 | 支援上傳單張圖片 | P0 |
| OCR 識別 | 識別圖片文字 | P0 |
| 文字翻譯 | 調用 DeepSeek API 翻譯 | P0 |
| 基礎預覽 | 顯示翻譯結果 | P0 |
| 圖片下載 | 輸出為 PNG | P0 |

### Phase 2

| 功能 | 描述 | 優先級 |
|------|------|--------|
| 批次上傳 | 支援多張圖片 | P1 |
| 位置保留 | OCR 保留文字座標 | P1 |
| 版面編輯 | 拖拉調整文字位置 | P1 |
| 字體選擇 | 支援多種中文字體 | P1 |
| 顏色保留 | 識別並保留文字顏色 | P1 |

### Phase 3

| 功能 | 描述 | 優先級 |
|------|------|--------|
| 樣式分析 | 自動識別字體大小、粗細 | P2 |
| 模板保存 | 儲存常用版面為模板 | P2 |
| 批次輸出 | 一次輸出多張圖片 | P2 |
| 歷史記錄 | 保存處理歷史 | P2 |

---

## 技術選型建議

### 方案 A: 純 Web 方案
```
Frontend: React + TypeScript
Backend: Node.js + Express
OCR: Tesseract.js (瀏覽器端 OCR)
翻譯: DeepSeek API
圖片生成: html2canvas / dom-to-image
```

**優點**: 跨平台、部署簡單
**缺點**: Tesseract.js 中文識別較弱

### 方案 B: Electron + Text-Grab 方案
```
Frontend: Electron + React
OCR: Text-Grab CLI (Windows OCR API)
翻譯: DeepSeek API
圖片生成: Puppeteer
```

**優點**: OCR 品質好 (Windows OCR)
**缺點**: 僅限 Windows

### 方案 C: Python 後端方案
```
Frontend: React
Backend: FastAPI (Python)
OCR: PaddleOCR / EasyOCR
翻譯: DeepSeek API
圖片生成: Pillow + 字體渲染
```

**優點**: OCR 選擇多、處理能力強
**缺點**: 需要 Python 環境

---

## API 設計

### OCR 接口
```
POST /api/ocr
Request: { image: base64 }
Response: {
  text_blocks: [
    {
      text: "Hello World",
      x: 100,
      y: 50,
      width: 200,
      height: 30,
      font_size: 24,
      color: "#333333"
    }
  ]
}
```

### 翻譯接口
```
POST /api/translate
Request: {
  texts: ["Hello", "World"],
  source_lang: "en",
  target_lang: "zh"
}
Response: {
  translations: ["你好", "世界"]
}
```

### 圖片生成接口
```
POST /api/generate
Request: {
  background_image: base64,
  text_blocks: [
    {
      text: "你好世界",
      x: 100,
      y: 50,
      font_size: 24,
      color: "#333333",
      font_family: "Noto Sans TC"
    }
  ]
}
Response: { image: base64 }
```

---

## 資料結構

### ImageProject
```typescript
interface ImageProject {
  id: string;
  original_image: string;          // base64 或 URL
  ocr_results: TextBlock[];        // OCR 識別結果
  translations: Translation[];     // 翻譯結果
  output_image?: string;           // 生成的圖片
  created_at: Date;
  updated_at: Date;
}

interface TextBlock {
  id: string;
  original_text: string;
  translated_text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  font_family?: string;
  color: string;
  font_weight?: string;
}

interface Translation {
  original: string;
  translated: string;
  block_id: string;
}
```

---

## 開發里程碑

### Milestone 1: POC (概念驗證)
- [ ] 設定專案結構
- [ ] 實現基本 OCR 功能
- [ ] 串接 DeepSeek API
- [ ] 基本 UI 展示

### Milestone 2: MVP
- [ ] 完整 OCR + 翻譯流程
- [ ] 圖片生成功能
- [ ] 基本編輯功能
- [ ] 下載功能

### Milestone 3: 完善版
- [ ] 位置保留與編輯
- [ ] 字體樣式支援
- [ ] 批次處理
- [ ] 使用者體驗優化

---

## 待確認事項

1. **OCR 方案選擇**: 偏好哪個方案? (Web/Electron/Python)
2. **部署環境**: 本地使用還是雲端部署?
3. **DeepSeek API Key**: 是否已有 API Key?
4. **圖片來源**: 主要處理哪類圖片? (Canva 設計圖/社群貼文/其他)
5. **中文字體**: 偏好哪些字體? (思源黑體/微軟正黑體/其他)

---

## 參考資源

- [Text-Grab](https://github.com/TheJoeFin/Text-Grab) - Windows OCR 工具
- [DeepSeek API](https://platform.deepseek.com/) - 翻譯 API
- [Tesseract.js](https://tesseract.projectnaptha.com/) - 瀏覽器端 OCR
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - 高精度 OCR
- [html2canvas](https://html2canvas.hertzen.com/) - DOM 轉圖片
