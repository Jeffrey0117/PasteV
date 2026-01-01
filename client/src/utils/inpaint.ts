/**
 * 簡易圖片修復工具 (Phase 1)
 *
 * 使用 Canvas API 將指定區域用背景色填充
 * 後續會加入更進階的 inpaint 演算法
 */

// ============================================
// 型別定義
// ============================================

/**
 * 遮罩區域定義
 */
export interface Mask {
  /** X 座標 (px) */
  x: number;
  /** Y 座標 (px) */
  y: number;
  /** 寬度 (px) */
  width: number;
  /** 高度 (px) */
  height: number;
}

/**
 * 區域定義 (用於偵測背景色)
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 顏色統計
 */
interface ColorCount {
  color: string;
  count: number;
}

// ============================================
// 工具函式
// ============================================

/**
 * 載入 base64 圖片到 HTMLImageElement
 * @param imageBase64 - base64 圖片字串 (可帶或不帶 data:image 前綴)
 * @returns Promise<HTMLImageElement>
 */
function loadImage(imageBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));

    // 確保有 data URL 前綴
    if (imageBase64.startsWith('data:')) {
      img.src = imageBase64;
    } else {
      img.src = `data:image/png;base64,${imageBase64}`;
    }
  });
}

/**
 * 將 RGB 值轉換為十六進位顏色字串
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 量化顏色 (減少顏色數量以便統計)
 * 將 RGB 值四捨五入到最近的 step 值
 */
function quantizeColor(r: number, g: number, b: number, step: number = 16): string {
  const qr = Math.round(r / step) * step;
  const qg = Math.round(g / step) * step;
  const qb = Math.round(b / step) * step;
  return rgbToHex(
    Math.min(255, qr),
    Math.min(255, qg),
    Math.min(255, qb)
  );
}

// ============================================
// 主要函式
// ============================================

/**
 * 擴展 mask 範圍
 * 確保完全覆蓋文字，避免邊緣殘留
 *
 * @param mask - 原始遮罩
 * @param padding - 向四周擴展的像素數 (預設 5)
 * @returns 擴展後的遮罩
 */
export function expandMask(mask: Mask, padding: number = 5): Mask {
  return {
    x: Math.max(0, mask.x - padding),
    y: Math.max(0, mask.y - padding),
    width: mask.width + padding * 2,
    height: mask.height + padding * 2,
  };
}

/**
 * 偵測區域周圍的背景顏色
 *
 * 策略：
 * 1. 取樣區域周圍的像素 (邊框區域)
 * 2. 統計最常見的顏色
 * 3. 回傳最常見的顏色作為填充色
 *
 * @param imageBase64 - base64 圖片
 * @param region - 目標區域
 * @returns Promise<string> - 十六進位顏色值 (如 #ffffff)
 */
export async function detectBackgroundColor(
  imageBase64: string,
  region: Region
): Promise<string> {
  const img = await loadImage(imageBase64);

  // 建立 canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 繪製圖片
  ctx.drawImage(img, 0, 0);

  // 取得圖片資料
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // 取樣邊框區域
  const sampleWidth = 10; // 邊框取樣寬度
  const colorCounts: Map<string, number> = new Map();

  // 定義取樣區域 (區域周圍的邊框)
  const sampleRegions = [
    // 上方邊框
    {
      x: Math.max(0, region.x - sampleWidth),
      y: Math.max(0, region.y - sampleWidth),
      width: region.width + sampleWidth * 2,
      height: sampleWidth
    },
    // 下方邊框
    {
      x: Math.max(0, region.x - sampleWidth),
      y: Math.min(img.height - sampleWidth, region.y + region.height),
      width: region.width + sampleWidth * 2,
      height: sampleWidth
    },
    // 左側邊框
    {
      x: Math.max(0, region.x - sampleWidth),
      y: region.y,
      width: sampleWidth,
      height: region.height
    },
    // 右側邊框
    {
      x: Math.min(img.width - sampleWidth, region.x + region.width),
      y: region.y,
      width: sampleWidth,
      height: region.height
    },
  ];

  // 統計各取樣區域的顏色
  for (const sampleRegion of sampleRegions) {
    for (let y = sampleRegion.y; y < sampleRegion.y + sampleRegion.height; y++) {
      for (let x = sampleRegion.x; x < sampleRegion.x + sampleRegion.width; x++) {
        // 確保座標在有效範圍內
        if (x < 0 || x >= img.width || y < 0 || y >= img.height) continue;

        const idx = (y * img.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // 忽略透明像素
        if (a < 128) continue;

        // 量化顏色以便統計
        const color = quantizeColor(r, g, b, 16);
        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
      }
    }
  }

  // 找出最常見的顏色
  let maxCount = 0;
  let dominantColor = '#ffffff'; // 預設白色

  for (const [color, count] of colorCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  }

  return dominantColor;
}

/**
 * 簡易圖片修復
 *
 * 將指定區域用背景色填充，達到移除文字的效果
 * 這是 Phase 1 的簡易實作，後續會加入更進階的 inpaint 演算法
 *
 * @param imageBase64 - 原始圖片 base64
 * @param masks - 要填充的區域陣列
 * @param fillColor - 填充顏色 (可選，不指定則自動偵測)
 * @returns Promise<string> - 處理後的圖片 base64
 */
export async function simpleInpaint(
  imageBase64: string,
  masks: Mask[],
  fillColor?: string
): Promise<string> {
  // 載入原始圖片
  const img = await loadImage(imageBase64);

  // 建立 canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 繪製原始圖片
  ctx.drawImage(img, 0, 0);

  // 處理每個 mask
  for (const mask of masks) {
    // 擴展 mask 以確保完全覆蓋
    const expandedMask = expandMask(mask, 3);

    // 決定填充顏色
    let color = fillColor;
    if (!color) {
      // 自動偵測背景顏色
      color = await detectBackgroundColor(imageBase64, mask);
    }

    // 填充區域
    ctx.fillStyle = color;
    ctx.fillRect(
      expandedMask.x,
      expandedMask.y,
      expandedMask.width,
      expandedMask.height
    );
  }

  // 回傳處理後的圖片
  return canvas.toDataURL('image/png');
}

/**
 * 批次處理多個 mask，每個使用各自偵測的背景色
 *
 * @param imageBase64 - 原始圖片 base64
 * @param masks - 要填充的區域陣列
 * @returns Promise<string> - 處理後的圖片 base64
 */
export async function simpleInpaintAuto(
  imageBase64: string,
  masks: Mask[]
): Promise<string> {
  // 載入原始圖片
  const img = await loadImage(imageBase64);

  // 建立 canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 繪製原始圖片
  ctx.drawImage(img, 0, 0);

  // 先偵測所有 mask 的背景色 (在原圖上偵測)
  const colors = await Promise.all(
    masks.map(mask => detectBackgroundColor(imageBase64, mask))
  );

  // 然後依序填充
  masks.forEach((mask, index) => {
    const expandedMask = expandMask(mask, 3);
    ctx.fillStyle = colors[index];
    ctx.fillRect(
      expandedMask.x,
      expandedMask.y,
      expandedMask.width,
      expandedMask.height
    );
  });

  // 回傳處理後的圖片
  return canvas.toDataURL('image/png');
}

/**
 * 使用漸層填充 (更自然的效果)
 *
 * @param imageBase64 - 原始圖片 base64
 * @param mask - 要填充的區域
 * @returns Promise<string> - 處理後的圖片 base64
 */
export async function simpleInpaintGradient(
  imageBase64: string,
  mask: Mask
): Promise<string> {
  const img = await loadImage(imageBase64);

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);

  const expandedMask = expandMask(mask, 3);

  // 取得左右兩側的顏色
  const leftRegion = {
    x: Math.max(0, mask.x - 10),
    y: mask.y,
    width: 10,
    height: mask.height
  };
  const rightRegion = {
    x: Math.min(img.width - 10, mask.x + mask.width),
    y: mask.y,
    width: 10,
    height: mask.height
  };

  const leftColor = await detectBackgroundColor(imageBase64, leftRegion);
  const rightColor = await detectBackgroundColor(imageBase64, rightRegion);

  // 建立漸層
  const gradient = ctx.createLinearGradient(
    expandedMask.x,
    expandedMask.y,
    expandedMask.x + expandedMask.width,
    expandedMask.y
  );
  gradient.addColorStop(0, leftColor);
  gradient.addColorStop(1, rightColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(
    expandedMask.x,
    expandedMask.y,
    expandedMask.width,
    expandedMask.height
  );

  return canvas.toDataURL('image/png');
}
