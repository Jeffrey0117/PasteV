# 02 - 欄位定義 UI

## 概述

讓使用者在第一張圖上定義文字欄位的位置與樣式，作為所有圖片的模板。

## 依賴

- `01-data-structures.md` - FieldTemplate 型別

## 輸出檔案

```
client/src/components/FieldEditor/
├── FieldEditor.tsx      # 主元件
├── FieldEditor.css      # 樣式
├── FieldItem.tsx        # 單一欄位元件
└── FieldList.tsx        # 欄位列表
```

---

## UI 設計

```
┌─────────────────────────────────────────────────────────────────┐
│ 欄位定義                                              [下一步 →] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────┐  ┌────────────────────────────┐ │
│  │                            │  │ 欄位列表                    │ │
│  │     ┌──────────────┐       │  │                            │ │
│  │     │ 標題 ░░░░░░░ │←drag  │  │ ┌────────────────────────┐ │ │
│  │     └──────────────┘       │  │ │ 1. 標題        [×]     │ │ │
│  │                            │  │ │    字體: 32px 粗體     │ │ │
│  │     ┌──────────────┐       │  │ └────────────────────────┘ │ │
│  │     │ 副標題 ░░░░░ │←drag  │  │                            │ │
│  │     └──────────────┘       │  │ ┌────────────────────────┐ │ │
│  │                            │  │ │ 2. 副標題      [×]     │ │ │
│  │  ┌─────────────────────┐   │  │ │    字體: 20px 正常     │ │ │
│  │  │ 內文內文內文內文    │   │  │ └────────────────────────┘ │ │
│  │  │ 內文內文 ░░░░░░░░░░│   │  │                            │ │
│  │  └─────────────────────┘   │  │ ┌────────────────────────┐ │ │
│  │                            │  │ │ 3. 內文        [×]     │ │ │
│  │   (第一張圖預覽)           │  │ │    字體: 16px 正常     │ │ │
│  │                            │  │ └────────────────────────┘ │ │
│  └────────────────────────────┘  │                            │ │
│                                  │ [+ 新增欄位]               │ │
│                                  │                            │ │
│                                  │ ─────────────────────────  │ │
│                                  │ 選中欄位設定               │ │
│                                  │ 名稱: [標題        ]       │ │
│                                  │ X: [50  ] Y: [30  ]        │ │
│                                  │ 寬度: [300 ]               │ │
│                                  │ 字體: [32  ] px            │ │
│                                  │ 粗細: [bold ▼]             │ │
│                                  │ 顏色: [■ #fff]             │ │
│                                  │ 對齊: [左 | 中 | 右]       │ │
│                                  └────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 元件規格

### FieldEditor (主元件)

```typescript
interface FieldEditorProps {
  /** 第一張圖片 */
  image: ImageData;

  /** 欄位模板列表 */
  fields: FieldTemplate[];

  /** 欄位變更回調 */
  onFieldsChange: (fields: FieldTemplate[]) => void;

  /** 選中欄位 ID */
  selectedFieldId: string | null;

  /** 選中變更回調 */
  onSelectField: (fieldId: string | null) => void;

  /** 畫布設定 */
  canvasSettings: CanvasSettings;
}
```

**功能：**
- 顯示圖片預覽區域
- 渲染可拖曳的欄位框
- 管理欄位選擇狀態
- 整合欄位列表與設定面板

### FieldItem (欄位框)

```typescript
interface FieldItemProps {
  field: FieldTemplate;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onResize: (width: number) => void;
}
```

**功能：**
- 拖曳移動
- 調整寬度 (resize handle)
- 點擊選中
- 顯示欄位名稱

### FieldList (欄位列表)

```typescript
interface FieldListProps {
  fields: FieldTemplate[];
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onAddField: () => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (fromIndex: number, toIndex: number) => void;
}
```

**功能：**
- 列表顯示所有欄位
- 拖曳排序
- 新增/刪除欄位
- 點擊選中

---

## 互動規格

### 拖曳欄位

```typescript
const handleDrag = (e: React.MouseEvent, fieldId: string) => {
  // 計算相對於畫布的座標
  const canvasRect = canvasRef.current.getBoundingClientRect();
  const x = e.clientX - canvasRect.left - dragOffset.x;
  const y = e.clientY - canvasRect.top - dragOffset.y;

  // 限制在畫布範圍內
  const boundedX = Math.max(0, Math.min(x, canvasSettings.width - 50));
  const boundedY = Math.max(0, Math.min(y, canvasSettings.height - 30));

  onFieldsChange(fields.map(f =>
    f.id === fieldId ? { ...f, x: boundedX, y: boundedY } : f
  ));
};
```

### 新增欄位

```typescript
const handleAddField = () => {
  const newField: FieldTemplate = {
    id: generateId('field'),
    name: `欄位 ${fields.length + 1}`,
    x: 50,
    y: 50 + fields.length * 60,
    width: 300,
    fontSize: 20,
    fontWeight: 'normal',
    color: '#ffffff',
    textAlign: 'left',
  };

  onFieldsChange([...fields, newField]);
  onSelectField(newField.id);
};
```

### 快速鍵

| 按鍵 | 功能 |
|------|------|
| `Delete` / `Backspace` | 刪除選中欄位 |
| `↑` `↓` `←` `→` | 微調選中欄位位置 (1px) |
| `Shift + 方向鍵` | 微調位置 (10px) |
| `Escape` | 取消選中 |
| `Ctrl + D` | 複製選中欄位 |

---

## 樣式規格

```css
/* 欄位框 */
.field-item {
  position: absolute;
  border: 2px dashed rgba(99, 102, 241, 0.5);
  border-radius: 4px;
  padding: 8px 12px;
  cursor: move;
  user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.field-item:hover {
  border-color: var(--primary);
}

.field-item.selected {
  border-style: solid;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

/* 欄位名稱標籤 */
.field-label {
  position: absolute;
  top: -24px;
  left: 0;
  background: var(--primary);
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px 4px 0 0;
  font-weight: 600;
}

/* Resize handle */
.field-resize-handle {
  position: absolute;
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 24px;
  background: var(--primary);
  border-radius: 4px;
  cursor: ew-resize;
  opacity: 0;
  transition: opacity 0.15s;
}

.field-item:hover .field-resize-handle,
.field-item.selected .field-resize-handle {
  opacity: 1;
}
```

---

## 狀態管理

```typescript
// 在 App.tsx 或 Context 中
const [fieldTemplates, setFieldTemplates] = useState<FieldTemplate[]>([
  createDefaultField('標題', 0),
  createDefaultField('副標題', 1),
]);

const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
```

---

## 驗收清單

- [ ] 可新增欄位
- [ ] 可刪除欄位
- [ ] 可拖曳移動欄位
- [ ] 可調整欄位寬度
- [ ] 可設定字體大小
- [ ] 可設定字重
- [ ] 可設定顏色
- [ ] 可設定對齊
- [ ] 欄位列表可拖曳排序
- [ ] 支援鍵盤快捷鍵
- [ ] 響應式布局
