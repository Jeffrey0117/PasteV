# 03 - 表格編輯器 UI

## 概述

以表格形式顯示所有圖片的所有欄位內容，方便批次檢視與編輯。

## 依賴

- `01-data-structures.md` - ImageData, FieldTemplate 型別

## 輸出檔案

```
client/src/components/TableEditor/
├── TableEditor.tsx      # 主元件
├── TableEditor.css      # 樣式
├── FieldTabs.tsx        # 欄位切換標籤
└── EditableCell.tsx     # 可編輯儲存格
```

---

## UI 設計

```
┌─────────────────────────────────────────────────────────────────┐
│ 內容編輯                                              [下一步 →] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [標題] [副標題] [內文]                    ← 欄位 Tab 切換    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 當前欄位：標題                    [翻譯此欄位所有內容]       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ┌──────┬──────────────────────┬──────────────────────┐      ││
│  │ │ 圖片 │ 英文原文              │ 中文翻譯             │      ││
│  │ ├──────┼──────────────────────┼──────────────────────┤      ││
│  │ │      │                      │                      │      ││
│  │ │ [縮] │ Computer Science     │ 電腦科學             │      ││
│  │ │ [圖] │ [可編輯]             │ [可編輯]             │      ││
│  │ │  1   │                      │                      │      ││
│  │ │      │                      │                      │      ││
│  │ ├──────┼──────────────────────┼──────────────────────┤      ││
│  │ │      │                      │                      │      ││
│  │ │ [縮] │ Data Analysis        │ 資料分析             │      ││
│  │ │ [圖] │                      │                      │      ││
│  │ │  2   │                      │                      │      ││
│  │ │      │                      │                      │      ││
│  │ ├──────┼──────────────────────┼──────────────────────┤      ││
│  │ │      │                      │                      │      ││
│  │ │ [縮] │ Machine Learning     │ 機器學習             │      ││
│  │ │ [圖] │                      │                      │      ││
│  │ │  3   │                      │                      │      ││
│  │ │      │                      │                      │      ││
│  │ └──────┴──────────────────────┴──────────────────────┘      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [翻譯全部欄位]                            [← 上一步] [預覽 →]││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 元件規格

### TableEditor (主元件)

```typescript
interface TableEditorProps {
  /** 所有圖片 */
  images: ImageData[];

  /** 欄位模板 */
  fields: FieldTemplate[];

  /** 當前選中欄位 ID */
  activeFieldId: string;

  /** 切換欄位回調 */
  onActiveFieldChange: (fieldId: string) => void;

  /** 內容變更回調 */
  onContentChange: (imageId: string, fieldId: string, content: FieldContent) => void;

  /** 批次翻譯回調 */
  onTranslateField: (fieldId: string) => Promise<void>;

  /** 翻譯全部回調 */
  onTranslateAll: () => Promise<void>;

  /** 載入狀態 */
  isTranslating: boolean;
}
```

### FieldTabs (欄位切換)

```typescript
interface FieldTabsProps {
  fields: FieldTemplate[];
  activeFieldId: string;
  onSelect: (fieldId: string) => void;
}
```

**UI:**
```
┌────────┐ ┌────────┐ ┌────────┐
│  標題  │ │ 副標題 │ │  內文  │
└────────┘ └────────┘ └────────┘
   ▲ active (底線標示)
```

### EditableCell (可編輯儲存格)

```typescript
interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}
```

**功能：**
- 點擊進入編輯模式
- 失焦自動儲存
- 支援多行 (textarea)
- Enter 送出, Shift+Enter 換行

---

## 資料流

```typescript
// 1. 取得當前欄位的所有內容
const currentFieldData = images.map(img => ({
  imageId: img.id,
  thumbnail: img.originalImage,
  original: img.fields[activeFieldId]?.original || '',
  translated: img.fields[activeFieldId]?.translated || '',
}));

// 2. 編輯時更新
const handleCellChange = (
  imageId: string,
  type: 'original' | 'translated',
  value: string
) => {
  onContentChange(imageId, activeFieldId, {
    original: type === 'original' ? value : currentContent.original,
    translated: type === 'translated' ? value : currentContent.translated,
  });
};

// 3. 翻譯單一欄位
const handleTranslateField = async () => {
  await onTranslateField(activeFieldId);
};
```

---

## 批次操作

### 翻譯單一欄位

```typescript
const translateField = async (fieldId: string) => {
  // 收集該欄位所有未翻譯的原文
  const textsToTranslate = images
    .filter(img => img.fields[fieldId]?.original && !img.fields[fieldId]?.translated)
    .map(img => ({
      key: `${img.id}:${fieldId}`,
      text: img.fields[fieldId].original,
    }));

  if (textsToTranslate.length === 0) return;

  // 呼叫翻譯 API
  const result = await translateBatch(textsToTranslate);

  // 更新各圖片
  Object.entries(result.translations).forEach(([key, translated]) => {
    const [imageId, fId] = key.split(':');
    onContentChange(imageId, fId, {
      ...images.find(i => i.id === imageId)!.fields[fId],
      translated,
    });
  });
};
```

### 翻譯全部欄位

```typescript
const translateAll = async () => {
  // 收集所有欄位所有圖片的原文
  const textsToTranslate: Array<{ key: string; text: string }> = [];

  fields.forEach(field => {
    images.forEach(img => {
      const content = img.fields[field.id];
      if (content?.original && !content?.translated) {
        textsToTranslate.push({
          key: `${img.id}:${field.id}`,
          text: content.original,
        });
      }
    });
  });

  if (textsToTranslate.length === 0) return;

  // 單次 API 呼叫
  const result = await translateBatch(textsToTranslate);

  // 批次更新
  // ...
};
```

---

## 樣式規格

```css
/* 表格容器 */
.table-editor {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}

/* Tab 列 */
.field-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
}

.field-tab {
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s;
}

.field-tab:hover {
  background: var(--border-light);
}

.field-tab.active {
  background: var(--primary);
  color: white;
}

/* 表格 */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
}

.data-table th {
  background: var(--surface-alt);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 縮圖欄 */
.thumbnail-cell {
  width: 80px;
}

.thumbnail-cell img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
}

/* 可編輯儲存格 */
.editable-cell {
  padding: 8px;
  border-radius: 6px;
  cursor: text;
  min-height: 40px;
  transition: background 0.15s;
}

.editable-cell:hover {
  background: var(--surface-alt);
}

.editable-cell:focus-within {
  background: var(--primary-light);
  outline: 2px solid var(--primary);
}

.editable-cell textarea {
  width: 100%;
  border: none;
  background: transparent;
  resize: none;
  font: inherit;
  color: inherit;
}
```

---

## 快捷鍵

| 按鍵 | 功能 |
|------|------|
| `Tab` | 下一個儲存格 |
| `Shift + Tab` | 上一個儲存格 |
| `↑` `↓` | 上/下一行 |
| `Ctrl + Enter` | 翻譯當前儲存格 |
| `Ctrl + Shift + T` | 翻譯當前欄位全部 |

---

## 驗收清單

- [ ] 可切換欄位 Tab
- [ ] 顯示縮圖 + 原文 + 譯文
- [ ] 可編輯原文
- [ ] 可編輯譯文
- [ ] 翻譯單一欄位按鈕
- [ ] 翻譯全部按鈕
- [ ] 翻譯中顯示 loading
- [ ] 支援鍵盤導航
- [ ] 響應式布局
- [ ] 空值提示 placeholder
