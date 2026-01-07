# PasteV Phase 2 重構：欄位式批次翻譯系統

## 目標

- **最少 API 呼叫**：整批處理，減少網路往返
- **最高效率**：本地 OCR 並行處理，AI 批次解析
- **最大速度**：漸進式載入，背景處理
- **最佳 UX**：表格編輯，即時預覽

---

## 核心概念

### 從「單一文字塊」到「結構化欄位」

```
舊模式：
  圖片 → OCR 全文 → 翻譯全文 → 貼到畫布

新模式：
  圖片 → OCR → AI 拆分欄位 → 批次翻譯 → 套用模板
```

### API 呼叫優化

| 操作 | 舊方案 | 新方案 |
|------|--------|--------|
| OCR | N 次 (每圖一次) | N 次 (本地 Tesseract，無 API) |
| AI 解析 | 0 次 | **1 次** (批次解析所有圖) |
| 翻譯 | N 次 (每圖一次) | **1 次** (批次翻譯所有欄位) |
| **總 API 呼叫** | N 次 | **2 次** |

> 上傳 10 張圖：舊方案 10 次 API，新方案 **只要 2 次**

---

## 新流程設計

### Step 1: 上傳圖片組

```
┌─────────────────────────────────────────────────────────────┐
│  拖放或點擊上傳多張圖片                                       │
│                                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                    │
│  │  1  │ │  2  │ │  3  │ │  4  │ │  5  │   ← 可拖曳排序      │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                    │
│                                                             │
│  上傳後立即開始背景 OCR（本地 Tesseract，不佔 API）           │
└─────────────────────────────────────────────────────────────┘
```

**技術細節：**
- 使用 `Promise.all` 並行處理所有圖片 OCR
- OCR 完成一張就顯示進度
- 全部完成自動進入下一步

### Step 2: 定義欄位 + AI 批次解析

```
┌─────────────────────────────────────────────────────────────┐
│  左側：第一張圖預覽          右側：欄位定義                    │
│  ┌──────────────────┐       ┌────────────────────────┐      │
│  │                  │       │ 欄位列表：              │      │
│  │  ┌────────────┐  │       │                        │      │
│  │  │ 標題      │◄─┼───────┤ 1. 標題    [+ 新增]    │      │
│  │  └────────────┘  │       │ 2. 副標題              │      │
│  │  ┌────────────┐  │       │ 3. 內文                │      │
│  │  │ 副標題    │◄─┼───────┤                        │      │
│  │  └────────────┘  │       │ [AI 自動辨識欄位]      │      │
│  │                  │       │                        │      │
│  └──────────────────┘       └────────────────────────┘      │
│                                                             │
│  [ 確認欄位，開始批次解析 ]                                   │
└─────────────────────────────────────────────────────────────┘
```

**AI 批次解析 (1 次 API 呼叫)：**

```javascript
// 單次 API 呼叫，處理所有圖片
const prompt = `
你是文字結構分析助手。

## 欄位定義
${fields.map((f, i) => `${i+1}. ${f.name}`).join('\n')}

## 任務
分析以下 ${images.length} 張圖片的 OCR 文字，提取各欄位內容。

${images.map((img, i) => `
### 圖片 ${i+1}
OCR 原文：
${img.ocrText}
`).join('\n')}

## 輸出格式 (JSON)
[
  { "圖片": 1, "標題": "...", "副標題": "...", "內文": "..." },
  { "圖片": 2, "標題": "...", "副標題": "...", "內文": "..." },
  ...
]
`;
```

### Step 3: 表格編輯 + 批次翻譯

```
┌─────────────────────────────────────────────────────────────┐
│  欄位：[標題 ▼]                    [ 一鍵翻譯此欄位 ]         │
│                                                             │
│  ┌────────┬─────────────────────┬─────────────────────┐     │
│  │ 圖片   │ 英文原文             │ 中文翻譯            │     │
│  ├────────┼─────────────────────┼─────────────────────┤     │
│  │ 1      │ Computer Science    │ 電腦科學            │     │
│  │ 2      │ Data Analysis       │ 資料分析            │     │
│  │ 3      │ Machine Learning    │ 機器學習            │     │
│  │ 4      │ Web Development     │ 網頁開發            │     │
│  │ 5      │ Cloud Computing     │ 雲端運算            │     │
│  └────────┴─────────────────────┴─────────────────────┘     │
│                                                             │
│  [ 翻譯全部欄位 ]                    [ 下一步：預覽 ]         │
└─────────────────────────────────────────────────────────────┘
```

**批次翻譯 (1 次 API 呼叫)：**

```javascript
// 收集所有需要翻譯的文字
const textsToTranslate = [];
images.forEach(img => {
  fields.forEach(field => {
    textsToTranslate.push({
      imageId: img.id,
      fieldId: field.id,
      text: img.fields[field.id].originalText
    });
  });
});

// 單次 API 呼叫
const prompt = `
將以下英文翻譯成繁體中文，保持簡潔有力：

${textsToTranslate.map((t, i) => `${i+1}. ${t.text}`).join('\n')}

輸出格式：每行一個翻譯結果，對應輸入順序
`;
```

### Step 4: 即時預覽 + 批次輸出

```
┌─────────────────────────────────────────────────────────────┐
│  ← 上一張    [ 1 / 5 ]    下一張 →                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │              ┌─────────────────────┐                 │   │
│  │              │     電腦科學        │                 │   │
│  │              │     年薪 166K       │                 │   │
│  │              └─────────────────────┘                 │   │
│  │                                                      │   │
│  │         此儲存庫包含一條通往                          │   │
│  │         免費自學電腦科學教育的路徑                    │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [ 輸出此張 ]              [ 輸出全部 (ZIP) ]               │
└─────────────────────────────────────────────────────────────┘
```

---

## 資料結構設計

```typescript
// 欄位定義 (模板)
interface FieldTemplate {
  id: string;
  name: string;           // "標題", "副標題", "內文"
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
}

// 單張圖片資料
interface ImageData {
  id: string;
  originalImage: string;  // base64
  ocrText: string;        // 原始 OCR 全文
  fields: {
    [fieldId: string]: {
      original: string;   // 英文原文
      translated: string; // 中文翻譯
    }
  };
  status: 'uploading' | 'ocr' | 'parsed' | 'translated' | 'ready';
}

// 專案狀態
interface ProjectState {
  images: ImageData[];
  fieldTemplates: FieldTemplate[];
  currentStep: 'upload' | 'fields' | 'edit' | 'preview';
  currentImageIndex: number;
}
```

---

## 效能優化策略

### 1. 並行 OCR（本地處理）

```typescript
// 所有圖片同時 OCR，不等待
const ocrPromises = images.map(img =>
  tesseract.recognize(img.data, 'eng+chi_tra')
);

// 漸進式更新 UI
ocrPromises.forEach((promise, index) => {
  promise.then(result => {
    updateImageOcrResult(index, result);
    updateProgress(index + 1, images.length);
  });
});

await Promise.all(ocrPromises);
```

### 2. 智慧快取

```typescript
// 相同文字不重複翻譯
const translationCache = new Map<string, string>();

function getCachedTranslation(text: string): string | null {
  return translationCache.get(text.toLowerCase().trim());
}

function cacheTranslation(original: string, translated: string) {
  translationCache.set(original.toLowerCase().trim(), translated);
}
```

### 3. 漸進式渲染

```typescript
// 不等全部完成，完成一張渲染一張
images.forEach((img, index) => {
  processImage(img).then(() => {
    renderThumbnail(index);  // 立即更新縮圖
  });
});
```

### 4. 預載入

```typescript
// 使用者在編輯圖1時，背景預載入圖2的預覽
useEffect(() => {
  const nextIndex = currentIndex + 1;
  if (nextIndex < images.length) {
    preloadPreview(images[nextIndex]);
  }
}, [currentIndex]);
```

---

## API 呼叫流程圖

```
使用者上傳 5 張圖片
         │
         ▼
┌─────────────────────────────┐
│ 本地 OCR (並行處理 5 張)     │  ← 0 次 API
│ Tesseract.js                │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ AI 批次解析欄位              │  ← 1 次 API
│ 輸入：5 張圖的 OCR 文字      │
│ 輸出：結構化欄位內容         │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ AI 批次翻譯                  │  ← 1 次 API
│ 輸入：所有欄位原文           │
│ 輸出：所有欄位譯文           │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ 本地渲染 + 輸出              │  ← 0 次 API
│ html2canvas                 │
└─────────────────────────────┘

總計：2 次 API 呼叫 (不論圖片數量)
```

---

## UX 優化細節

### 鍵盤快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| `←` `→` | 切換圖片 |
| `Tab` | 下一個欄位 |
| `Enter` | 確認編輯 |
| `Ctrl+S` | 儲存/輸出 |
| `Ctrl+T` | 翻譯當前欄位 |

### 視覺回饋

- 上傳進度條
- OCR 處理動畫
- 翻譯中的 skeleton loading
- 成功/失敗的 toast 通知

### 錯誤處理

- OCR 失敗：允許手動輸入
- AI 解析失敗：fallback 到手動分配
- 翻譯失敗：重試機制 + 手動輸入

---

## 實作優先順序

### Phase 2.1 - 核心功能
1. [ ] 重構資料結構
2. [ ] 實作欄位定義 UI
3. [ ] AI 批次解析 API
4. [ ] 表格編輯介面

### Phase 2.2 - 翻譯整合
5. [ ] 批次翻譯 API
6. [ ] 翻譯快取
7. [ ] 即時預覽

### Phase 2.3 - 輸出優化
8. [ ] 批次輸出 ZIP
9. [ ] 鍵盤快捷鍵
10. [ ] 效能優化

---

## 預期效果

| 指標 | 舊版 | 新版 |
|------|------|------|
| 10 張圖 API 呼叫 | 10-20 次 | **2 次** |
| 處理時間 | ~60 秒 | **~15 秒** |
| 可編輯性 | 低 (整塊文字) | **高 (欄位獨立)** |
| 批次修改 | 不支援 | **表格一覽** |
