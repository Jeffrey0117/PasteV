/**
 * 版型相似度計算與分組工具
 *
 * 用於分析多張圖片的文字區塊佈局相似度，
 * 自動分組相似版型，並支援佈局複製功能。
 */

import type { ImageData, TextBlock, LayoutGroup } from '../types';

// ============================================
// 核心函式
// ============================================

/**
 * 計算兩組區塊的版型相似度
 *
 * @param blocksA - 第一組區塊
 * @param blocksB - 第二組區塊
 * @param imgWidth - 圖片寬度 (用於正規化)
 * @param imgHeight - 圖片高度 (用於正規化)
 * @returns 相似度分數 (0-1)
 *
 * 計算邏輯:
 * 1. 區塊數量不同 → 返回 0
 * 2. 比較各區塊的相對位置 (正規化到 0-1)
 * 3. 位置差異 < 10% 視為匹配
 */
export function calculateLayoutSimilarity(
  blocksA: TextBlock[],
  blocksB: TextBlock[],
  imgWidth: number,
  imgHeight: number
): number {
  // 區塊數量不同，直接返回 0
  if (blocksA.length !== blocksB.length) {
    return 0;
  }

  // 沒有區塊時，視為完全相同
  if (blocksA.length === 0) {
    return 1;
  }

  // 避免除以零
  if (imgWidth <= 0 || imgHeight <= 0) {
    return 0;
  }

  // 將區塊按 y 座標排序，確保比較順序一致
  const sortedA = [...blocksA].sort((a, b) => a.bbox.y - b.bbox.y);
  const sortedB = [...blocksB].sort((a, b) => a.bbox.y - b.bbox.y);

  let matchCount = 0;
  const threshold = 0.1; // 10% 差異閾值

  for (let i = 0; i < sortedA.length; i++) {
    const a = sortedA[i].bbox;
    const b = sortedB[i].bbox;

    // 計算正規化座標差異
    const xDiff = Math.abs(a.x / imgWidth - b.x / imgWidth);
    const yDiff = Math.abs(a.y / imgHeight - b.y / imgHeight);

    // 也比較寬高比例差異
    const widthDiff = Math.abs(a.width / imgWidth - b.width / imgWidth);
    const heightDiff = Math.abs(a.height / imgHeight - b.height / imgHeight);

    // 位置和大小都在閾值內才算匹配
    if (
      xDiff < threshold &&
      yDiff < threshold &&
      widthDiff < threshold &&
      heightDiff < threshold
    ) {
      matchCount++;
    }
  }

  return matchCount / sortedA.length;
}

/**
 * 根據版型相似度將圖片分組
 *
 * @param images - 圖片資料陣列 (需含 detectedBlocks)
 * @param threshold - 相似度閾值 (預設 0.8)
 * @returns 分組結果陣列
 *
 * 使用簡單聚類算法:
 * 1. 第一張圖建立新群組
 * 2. 後續圖片與現有群組比較
 * 3. 相似度 > threshold 則加入該組
 * 4. 否則建立新群組
 */
export function groupImagesByLayout(
  images: ImageData[],
  threshold: number = 0.8
): LayoutGroup[] {
  const groups: LayoutGroup[] = [];

  // 過濾出有 detectedBlocks 的圖片
  const validImages = images.filter(
    (img) => img.detectedBlocks && img.detectedBlocks.length > 0
  );

  if (validImages.length === 0) {
    return [];
  }

  for (const image of validImages) {
    const blocks = image.detectedBlocks!;
    let foundGroup = false;

    // 嘗試加入現有群組
    for (const group of groups) {
      // 找到群組代表圖片
      const representative = validImages.find(
        (img) => img.id === group.representativeImageId
      );

      if (!representative || !representative.detectedBlocks) {
        continue;
      }

      // 計算與代表圖片的相似度
      const similarity = calculateLayoutSimilarity(
        blocks,
        representative.detectedBlocks,
        image.width,
        image.height
      );

      if (similarity >= threshold) {
        // 加入此群組
        group.imageIds.push(image.id);
        // 更新平均相似度
        group.similarity =
          (group.similarity * (group.imageIds.length - 1) + similarity) /
          group.imageIds.length;
        foundGroup = true;
        break;
      }
    }

    // 沒有找到匹配群組，建立新群組
    if (!foundGroup) {
      groups.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        representativeImageId: image.id,
        imageIds: [image.id],
        similarity: 1.0, // 單張圖片，相似度為 1
      });
    }
  }

  return groups;
}

/**
 * 將來源圖片的區塊佈局套用到目標圖片
 *
 * @param sourceImage - 來源圖片 (提供佈局)
 * @param targetImages - 目標圖片陣列
 * @returns 更新後的目標圖片陣列
 *
 * 處理邏輯:
 * 1. 保留各圖的 OCR 文字
 * 2. 複製來源的位置/大小資訊
 * 3. 使用正規化座標來適應不同尺寸
 */
export function applyLayoutToImages(
  sourceImage: ImageData,
  targetImages: ImageData[]
): ImageData[] {
  // 來源圖片沒有區塊，直接返回原陣列
  if (!sourceImage.detectedBlocks || sourceImage.detectedBlocks.length === 0) {
    return targetImages;
  }

  const sourceBlocks = sourceImage.detectedBlocks;

  return targetImages.map((target) => {
    // 目標圖片沒有區塊，跳過
    if (!target.detectedBlocks || target.detectedBlocks.length === 0) {
      return target;
    }

    // 區塊數量不同，跳過
    if (target.detectedBlocks.length !== sourceBlocks.length) {
      return target;
    }

    // 計算來源與目標的尺寸比例
    const scaleX = target.width / sourceImage.width;
    const scaleY = target.height / sourceImage.height;

    // 按 y 座標排序，確保對應正確
    const sortedSource = [...sourceBlocks].sort((a, b) => a.bbox.y - b.bbox.y);
    const sortedTarget = [...target.detectedBlocks].sort(
      (a, b) => a.bbox.y - b.bbox.y
    );

    // 套用佈局，保留原始文字
    const newBlocks: TextBlock[] = sortedTarget.map((targetBlock, index) => {
      const sourceBlock = sortedSource[index];

      return {
        ...targetBlock,
        // 保留原始文字內容
        text: targetBlock.text,
        // 複製來源的位置/大小 (依比例縮放)
        bbox: {
          x: Math.round(sourceBlock.bbox.x * scaleX),
          y: Math.round(sourceBlock.bbox.y * scaleY),
          width: Math.round(sourceBlock.bbox.width * scaleX),
          height: Math.round(sourceBlock.bbox.height * scaleY),
        },
        // 也複製樣式相關屬性
        estimatedFontSize: Math.round(sourceBlock.estimatedFontSize * Math.min(scaleX, scaleY)),
        estimatedColor: sourceBlock.estimatedColor,
        direction: sourceBlock.direction,
        // 保留區塊狀態
        status: targetBlock.status,
      };
    });

    return {
      ...target,
      detectedBlocks: newBlocks,
    };
  });
}

// ============================================
// 輔助函式
// ============================================

/**
 * 計算單一群組內所有圖片的平均相似度
 *
 * @param images - 群組內的圖片陣列
 * @returns 平均相似度
 */
export function calculateGroupAverageSimilarity(
  images: ImageData[]
): number {
  if (images.length < 2) {
    return 1.0;
  }

  let totalSimilarity = 0;
  let pairCount = 0;

  // 計算所有配對的相似度
  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) {
      const imgA = images[i];
      const imgB = images[j];

      if (!imgA.detectedBlocks || !imgB.detectedBlocks) {
        continue;
      }

      const similarity = calculateLayoutSimilarity(
        imgA.detectedBlocks,
        imgB.detectedBlocks,
        imgA.width,
        imgA.height
      );

      totalSimilarity += similarity;
      pairCount++;
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0;
}

/**
 * 找出最適合作為群組代表的圖片
 * 選擇與其他圖片平均相似度最高的那張
 *
 * @param images - 候選圖片陣列
 * @returns 最佳代表圖片的 ID
 */
export function findBestRepresentative(
  images: ImageData[]
): string | null {
  if (images.length === 0) {
    return null;
  }

  if (images.length === 1) {
    return images[0].id;
  }

  let bestId = images[0].id;
  let bestScore = -1;

  for (const candidate of images) {
    if (!candidate.detectedBlocks) {
      continue;
    }

    let totalSimilarity = 0;
    let count = 0;

    for (const other of images) {
      if (other.id === candidate.id || !other.detectedBlocks) {
        continue;
      }

      const similarity = calculateLayoutSimilarity(
        candidate.detectedBlocks,
        other.detectedBlocks,
        candidate.width,
        candidate.height
      );

      totalSimilarity += similarity;
      count++;
    }

    const avgSimilarity = count > 0 ? totalSimilarity / count : 0;

    if (avgSimilarity > bestScore) {
      bestScore = avgSimilarity;
      bestId = candidate.id;
    }
  }

  return bestId;
}
