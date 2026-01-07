# Smart Mode 檢討報告

## 現況問題分析

### 核心問題：與 Template Mode 差異過大

目前 Smart Mode 和 Template Mode 是兩套完全獨立的實作，導致：
1. 用戶需要重新學習不同的操作方式
2. 無法共用已定義的欄位模板
3. UI/UX 風格不一致

### 具體問題清單

#### 1. 欄位定義流程不直覺
- **問題**：Step 2 的欄位框選功能與實際需求不符
- **現況**：要求用戶在圖片上「畫出」欄位區域
- **期望**：應該讓用戶從 OCR 解析的文字中「選取/分類」到不同欄位

#### 2. OCR → 欄位的轉換邏輯缺失
- **問題**：OCR 得到的是整塊文字，沒有好的方式讓用戶拆分到不同欄位
- **現況**：依賴 AI 自動解析（DeepSeek），準確度不穩定
- **期望**：提供手動調整的 UI，讓用戶可以快速修正

#### 3. 與 Template Mode 的欄位模板不共用
- **問題**：兩個模式各自維護 `fieldTemplates`
- **影響**：用戶在 Template Mode 定義的欄位無法在 Smart Mode 使用

#### 4. 輸出格式不明確
- **問題**：目前只輸出 JSON，沒有圖片輸出功能
- **期望**：應該像 Template Mode 一樣輸出帶文字疊加的圖片

---

## 理想的 Smart Mode 流程

### 簡化版本（建議優先實作）

```
1. 上傳圖片
   ↓
2. OCR 自動辨識（背景執行）
   ↓
3. 顯示 OCR 結果 + 欄位分配 UI
   - 左側：OCR 原文（可選取文字）
   - 右側：欄位列表（可拖放或貼上文字）
   ↓
4. 翻譯（可選）
   ↓
5. 預覽 / 輸出
   - 使用 Template Mode 的畫布設定
   - 輸出帶文字疊加的圖片
```

### 欄位分配 UI 設計（Step 3 核心改進）

```
┌─────────────────────────────────────────────────────────┐
│  OCR 原文                    │  欄位分配                │
│ ─────────────────────────────│──────────────────────────│
│  選取文字後點擊右側欄位        │  [帳號] _______________  │
│  或直接拖曳到欄位              │  [ID]   _______________  │
│                              │  [等級] _______________  │
│  ┌─────────────────────────┐ │                          │
│  │ "Player123"             │ │  ──────────────────────  │
│  │ "ID: 456789"            │ │  [+ 新增欄位]            │
│  │ "Level 50"              │ │                          │
│  │ "Guild: Heroes"         │ │  ──────────────────────  │
│  └─────────────────────────┘ │  [套用模板 ▼]            │
│                              │                          │
└─────────────────────────────────────────────────────────┘
```

---

## 建議的修改方向

### 短期（立即可做）

1. **移除 Step 2 的圖片框選功能**
   - 這個功能不實用，OCR 已經有文字了
   - 改成「欄位名稱定義」即可

2. **改進 Step 3 的編輯 UI**
   - 左側顯示 OCR 原文（每行可選取）
   - 右側顯示欄位輸入框
   - 支援從左側拖曳文字到右側欄位

3. **共用 Template Mode 的欄位模板**
   - 從 App 層級傳入 `fieldTemplates`
   - 提供「載入模板」下拉選單

### 中期

4. **整合 Template Mode 的畫布輸出**
   - 使用相同的 `generate` API
   - 輸出帶文字疊加的圖片

5. **支援批次處理**
   - 多張圖片使用相同欄位模板
   - 表格式編輯（類似目前的 Step 3）

### 長期

6. **智慧欄位對應**
   - 根據欄位名稱自動建議對應的 OCR 文字
   - 學習用戶的修正，改進自動對應

---

## 技術實作建議

### 共用欄位模板

```typescript
// App.tsx 層級管理
const [globalFieldTemplates, setGlobalFieldTemplates] = useState<FieldTemplate[]>([]);

// 傳給兩個模式
<SmartModePage
  fieldTemplates={globalFieldTemplates}
  onFieldTemplatesChange={setGlobalFieldTemplates}
/>
<TemplateMode
  fieldTemplates={globalFieldTemplates}
  onFieldTemplatesChange={setGlobalFieldTemplates}
/>
```

### OCR 文字選取 UI

```tsx
// 每行 OCR 文字都是可拖曳的
<div className="ocr-line" draggable onDragStart={(e) => {
  e.dataTransfer.setData('text/plain', line);
}}>
  {line}
</div>

// 欄位輸入框接受拖放
<input
  className="field-input"
  onDrop={(e) => {
    const text = e.dataTransfer.getData('text/plain');
    handleFieldUpdate(fieldId, text);
  }}
  onDragOver={(e) => e.preventDefault()}
/>
```

---

## 優先級排序

| 優先級 | 任務 | 預估複雜度 |
|--------|------|-----------|
| P0 | 移除圖片框選，簡化 Step 2 | 低 |
| P0 | 改進 Step 3 編輯 UI（拖放文字到欄位） | 中 |
| P1 | 共用 fieldTemplates | 低 |
| P1 | 整合畫布輸出 | 中 |
| P2 | 批次處理優化 | 中 |
| P3 | 智慧欄位對應 | 高 |

---

## 結論

Smart Mode 目前最大的問題是「欄位分配」的 UX 不好用。用戶需要的是：

> 「我上傳圖片 → OCR 辨識 → **快速把文字分到不同欄位** → 翻譯 → 輸出」

而不是：

> 「在圖片上畫框 → AI 猜測 → 手動修正」

建議先實作 P0 任務，讓 Smart Mode 的核心流程變得直覺好用。
