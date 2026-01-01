# Smart OCR + Inpaint 規格書

## 概述

針對每張圖片文字位置不同的情況（如社群媒體貼文、簡報投影片），提供智慧型文字偵測、移除、翻譯與重新渲染功能。

## 設計原則

1. **預設全自動** - 每張圖自動偵測，不需用戶選模式
2. **智慧分組** - 自動偵測相似版型，提示用戶統一佈局
3. **漸進式調整** - 自動結果不滿意時，再手動微調

## 核心流程

```
上傳 n 張圖
    ↓
全部自動偵測文字區塊 (並行處理)
    ↓
自動分析版型相似度 → 分組
    ↓
提示：「發現 3 組相似版型，要統一佈局嗎？」
    ↓
[可選] 確認/調整分組
    ↓
[可選] 手動微調區塊位置/大小
    ↓
一鍵 Inpaint + 翻譯
    ↓
輸出
```

### 自動版型分組

偵測完成後，系統自動分析所有圖片的區塊佈局相似度：

```typescript
interface LayoutGroup {
  /** 分組 ID */
  id: string;
  /** 代表圖片 (用作佈局範本) */
  representativeImageId: string;
  /** 該組包含的圖片 ID */
  imageIds: string[];
  /** 組內平均相似度 */
  similarity: number;
}

// 相似度計算
function calculateLayoutSimilarity(blocksA: TextBlock[], blocksB: TextBlock[]): number {
  // 1. 區塊數量不同 → 低相似度
  if (blocksA.length !== blocksB.length) return 0;

  // 2. 比較各區塊的相對位置 (正規化到 0-1)
  let score = 0;
  for (let i = 0; i < blocksA.length; i++) {
    const a = blocksA[i].bbox;
    const b = blocksB[i].bbox;

    // 位置差異 < 10% 視為匹配
    const xDiff = Math.abs(a.x / imgWidth - b.x / imgWidth);
    const yDiff = Math.abs(a.y / imgHeight - b.y / imgHeight);

    if (xDiff < 0.1 && yDiff < 0.1) score++;
  }

  return score / blocksA.length; // 0~1
}
```

### 分組確認 UI

```
┌─────────────────────────────────────────┐
│ 偵測完成！發現以下版型分組：             │
│                                         │
│ 📁 版型 A (6 張) - 相似度 92%           │
│    [縮圖1][縮圖2][縮圖3][縮圖5][縮圖7][縮圖8] │
│    [✓ 統一使用圖1的佈局]                │
│                                         │
│ 📁 版型 B (2 張) - 相似度 88%           │
│    [縮圖4][縮圖6]                       │
│    [✓ 統一使用圖4的佈局]                │
│                                         │
│ 📁 獨立版型 (1 張)                      │
│    [縮圖9] - 無相似圖片                 │
│                                         │
│        [確認分組] [手動調整]             │
└─────────────────────────────────────────┘
```

### 手動複製佈局 (備用)

如果自動分組不準確，用戶仍可手動操作：

```
選擇「來源圖」→ 點擊「套用佈局到...」→ 勾選目標圖 → 確認
```

## 功能模組

### 1. 文字區塊偵測 (Text Block Detection)

**目標**: 偵測圖片中所有文字區域的精確位置

**輸入**: 原始圖片 (base64)

**輸出**:
```typescript
interface TextBlock {
  id: string;
  /** 邊界框 */
  bbox: {
    x: number;      // 左上角 X
    y: number;      // 左上角 Y
    width: number;
    height: number;
  };
  /** OCR 識別的文字 */
  text: string;
  /** 信心度 0-1 */
  confidence: number;
  /** 估算的字體大小 */
  estimatedFontSize: number;
  /** 估算的文字顏色 */
  estimatedColor: string;
  /** 文字方向: horizontal/vertical */
  direction: 'horizontal' | 'vertical';
}
```

**技術選項**:
- Tesseract.js (目前已有) - 取得 word-level bounding boxes
- Google Vision API - 更精確但需付費
- PaddleOCR - 開源、支援中文

### 2. 背景修復 (Inpainting)

**目標**: 移除原始文字，用周圍背景填補

**輸入**:
- 原始圖片
- 要移除的文字區塊 mask

**輸出**: 移除文字後的乾淨背景圖

**技術選項**:

| 方案 | 優點 | 缺點 |
|------|------|------|
| **Canvas 簡易填充** | 免費、快速 | 只適合純色背景 |
| **OpenCV Inpaint** | 免費、效果中等 | 需要 WASM/後端 |
| **Stable Diffusion Inpaint** | 效果最好 | 需要 GPU、慢 |
| **Remove.bg API** | 簡單 | 付費、僅限移除 |
| **Replicate API** | 效果好、易整合 | 付費 |

**建議**: 分階段實作
- Phase 1: Canvas 純色填充 (適合簡單背景)
- Phase 2: OpenCV Inpaint (中等複雜度)
- Phase 3: AI Inpaint API (複雜背景)

### 3. 文字翻譯 (Translation)

**目標**: 將偵測到的文字翻譯成目標語言

**已有功能**: 使用現有 `/api/translate` endpoint

**增強**:
- 保留文字格式 (項目符號、換行)
- 支援批次翻譯所有區塊

### 4. 文字渲染 (Text Rendering)

**目標**: 在修復後的背景上，於原位置渲染翻譯文字

**考量因素**:
- 字體大小自動調整 (譯文可能比原文長/短)
- 文字顏色匹配
- 支援多行文字
- 對齊方式推斷

**渲染策略**:
```typescript
interface RenderConfig {
  /** 目標區塊 */
  targetBbox: BBox;
  /** 翻譯文字 */
  text: string;
  /** 自動縮放以填滿區塊 */
  autoFit: boolean;
  /** 字體 */
  fontFamily: string;
  /** 顏色 */
  color: string;
  /** 對齊 */
  align: 'left' | 'center' | 'right';
}
```

## 資料模型更新

### ImageData 擴展

```typescript
interface ImageData {
  // ... 現有欄位 ...

  /** 偵測到的文字區塊 (Smart Mode) */
  detectedBlocks?: TextBlock[];

  /** 修復後的背景圖 (base64) */
  inpaintedImage?: string;

  /** 每個區塊的翻譯 */
  blockTranslations?: Record<string, string>;
}
```

### 新增處理狀態

```typescript
type ImageStatus =
  | 'pending'
  | 'detecting'      // 偵測文字區塊中
  | 'detected'       // 偵測完成
  | 'inpainting'     // 移除文字中
  | 'inpainted'      // 移除完成
  | 'translating'
  | 'translated'
  | 'ready'
  | 'error';
```

## API Endpoints

### POST /api/detect-blocks

偵測圖片中的文字區塊

**Request**:
```json
{
  "image": "data:image/png;base64,..."
}
```

**Response**:
```json
{
  "success": true,
  "blocks": [
    {
      "id": "block-1",
      "bbox": { "x": 50, "y": 30, "width": 400, "height": 60 },
      "text": "Error Handling in FastAPI",
      "confidence": 0.95,
      "estimatedFontSize": 48,
      "estimatedColor": "#1e40af"
    }
  ]
}
```

### POST /api/inpaint

移除指定區域的文字

**Request**:
```json
{
  "image": "data:image/png;base64,...",
  "masks": [
    { "x": 50, "y": 30, "width": 400, "height": 60 }
  ],
  "method": "simple" | "opencv" | "ai"
}
```

**Response**:
```json
{
  "success": true,
  "inpaintedImage": "data:image/png;base64,..."
}
```

## UI 流程

### 工作流程

```
1. [上傳圖片] - 拖放或選擇多張圖片
   ↓
2. [自動偵測] - 並行處理所有圖片，顯示進度
   ↓
3. [檢視結果] - 瀏覽每張圖的偵測區塊
   │
   ├─→ [複製佈局] - 發現相似版型時，套用到其他圖
   │
   └─→ [手動調整] - 調整區塊位置/大小/排除區塊
   ↓
4. [一鍵處理] - Inpaint + 翻譯 (批次)
   ↓
5. [微調輸出] - 調整字體樣式、檢視結果
   ↓
6. [匯出] - 下載成品圖
```

### UI 元件

#### ImageGrid 圖片網格

- 顯示所有上傳圖片的縮圖
- 顯示每張圖的處理狀態（偵測中/已偵測/已翻譯）
- 點擊進入單張圖編輯

#### BlockEditor 區塊編輯器

- 顯示偵測到的文字區塊邊界框
- 可拖曳調整位置/大小
- 可標記為「保留原文」(不翻譯) 或「排除」(如 Logo)
- 顯示 OCR 結果 vs 翻譯結果對照

#### LayoutCopyModal 佈局複製對話框

- 顯示來源圖的區塊佈局預覽
- 勾選要套用的目標圖
- 預覽套用結果

#### InpaintPreview 修復預覽

- 左右對比: 原圖 vs 修復後
- 可手動畫 mask 補充偵測遺漏的區域
- Undo/Redo 支援

## 實作計畫

### Phase 1: 基礎偵測 + 簡易填充

- [ ] 擴展 Tesseract OCR 取得 bounding boxes
- [ ] 實作 Canvas 純色填充 inpaint
- [ ] BlockEditor 基礎 UI
- [ ] 整合到現有流程

### Phase 2: 進階 Inpaint

- [ ] 整合 OpenCV.js inpaint
- [ ] 手動 mask 繪製工具
- [ ] 批次處理優化

### Phase 3: AI 增強

- [ ] 整合 AI Inpaint API (Replicate/自建)
- [ ] 智慧字體/顏色偵測
- [ ] 自動排版優化

## 技術風險

| 風險 | 影響 | 緩解方案 |
|------|------|----------|
| Tesseract bbox 精度不足 | 文字區塊不完整 | 允許手動調整 |
| Inpaint 效果差 | 背景有殘影 | 提供多種方法選擇 |
| 譯文長度差異大 | 排版困難 | 自動縮放 + 手動調整 |
| 複雜背景處理 | 需要 AI | 標記為「進階功能」 |

## 預估工時

| 項目 | 工時 |
|------|------|
| Phase 1 基礎功能 | 2-3 天 |
| Phase 2 進階 Inpaint | 2-3 天 |
| Phase 3 AI 增強 | 3-5 天 |
| 測試與優化 | 2 天 |

---

## 附錄: 參考圖片分析

以使用者提供的 FastAPI 教學圖為例:

**特點**:
- 淺藍色圓形漸層背景
- 多層級標題 (大標、副標)
- 項目列表 (bullet points)
- 底部固定 Logo/社群帳號

**處理策略**:
1. 偵測所有文字區塊
2. 排除底部 Logo (標記為「保留」)
3. Inpaint 移除可翻譯文字
4. 翻譯並渲染
5. 保留原始背景設計
