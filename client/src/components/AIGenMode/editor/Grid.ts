/**
 * Grid System - 網格對齊系統
 * 參考 mini-canvas-editor 的 grid 架構
 * 用於視覺編輯器中的元素對齊和吸附
 */

export interface GridConfiguration {
  /** 是否啟用網格 */
  enabled: boolean;
  /** 網格大小 (pixels) */
  size: number;
  /** 是否顯示網格 */
  visible: boolean;
  /** 吸附閾值 (pixels) - 在此距離內自動吸附 */
  snapThreshold: number;
  /** 網格顏色 */
  color: string;
  /** 主網格線間隔 (每 N 條線畫一條主線) */
  majorLineInterval: number;
  /** 主網格線顏色 */
  majorLineColor: string;
}

export const DEFAULT_GRID_CONFIG: GridConfiguration = {
  enabled: true,
  size: 20,
  visible: true,
  snapThreshold: 10,
  color: 'rgba(128, 128, 128, 0.15)',
  majorLineInterval: 5,
  majorLineColor: 'rgba(128, 128, 128, 0.3)',
};

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Grid 系統類
 * 提供網格吸附、繪製等功能
 */
export class Grid {
  private config: GridConfiguration;

  constructor(config: Partial<GridConfiguration> = {}) {
    this.config = { ...DEFAULT_GRID_CONFIG, ...config };
  }

  /** 更新配置 */
  setConfig(config: Partial<GridConfiguration>): void {
    this.config = { ...this.config, ...config };
  }

  /** 取得當前配置 */
  getConfig(): GridConfiguration {
    return { ...this.config };
  }

  /** 啟用/禁用網格 */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /** 設定網格大小 */
  setSize(size: number): void {
    this.config.size = Math.max(1, size);
  }

  /** 設定可見性 */
  setVisible(visible: boolean): void {
    this.config.visible = visible;
  }

  /**
   * 將數值吸附到最近的網格線
   * @param value 原始數值
   * @returns 吸附後的數值
   */
  snap(value: number): number {
    if (!this.config.enabled) return value;
    return Math.round(value / this.config.size) * this.config.size;
  }

  /**
   * 將點吸附到最近的網格交點
   * @param point 原始點
   * @returns 吸附後的點
   */
  snapPoint(point: Point): Point {
    if (!this.config.enabled) return point;
    return {
      x: this.snap(point.x),
      y: this.snap(point.y),
    };
  }

  /**
   * 將矩形吸附到網格
   * 保持寬高不變，只調整位置
   * @param rect 原始矩形
   * @returns 吸附後的矩形
   */
  snapRect(rect: Rect): Rect {
    if (!this.config.enabled) return rect;
    const snappedPoint = this.snapPoint({ x: rect.x, y: rect.y });
    return {
      ...rect,
      x: snappedPoint.x,
      y: snappedPoint.y,
    };
  }

  /**
   * 智能吸附 - 只在接近網格線時吸附
   * @param value 原始數值
   * @returns 吸附後的數值 (如果在閾值內) 或原始數值
   */
  smartSnap(value: number): number {
    if (!this.config.enabled) return value;

    const snapped = this.snap(value);
    const distance = Math.abs(value - snapped);

    if (distance <= this.config.snapThreshold) {
      return snapped;
    }
    return value;
  }

  /**
   * 智能吸附點
   * @param point 原始點
   * @returns 吸附後的點
   */
  smartSnapPoint(point: Point): Point {
    if (!this.config.enabled) return point;
    return {
      x: this.smartSnap(point.x),
      y: this.smartSnap(point.y),
    };
  }

  /**
   * 繪製網格到 Canvas
   * @param ctx Canvas 2D 上下文
   * @param width 畫布寬度
   * @param height 畫布高度
   * @param offsetX 視圖偏移 X
   * @param offsetY 視圖偏移 Y
   * @param zoom 縮放倍率
   */
  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    offsetX: number = 0,
    offsetY: number = 0,
    zoom: number = 1
  ): void {
    if (!this.config.visible) return;

    const { size, color, majorLineInterval, majorLineColor } = this.config;
    const scaledSize = size * zoom;

    // 計算起始位置
    const startX = (offsetX % scaledSize) - scaledSize;
    const startY = (offsetY % scaledSize) - scaledSize;

    // 計算網格索引偏移
    const gridOffsetX = Math.floor(-offsetX / scaledSize);
    const gridOffsetY = Math.floor(-offsetY / scaledSize);

    ctx.save();

    // 繪製次要網格線
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    // 垂直線
    for (let x = startX; x < width + scaledSize; x += scaledSize) {
      const gridIndex = gridOffsetX + Math.round((x - startX) / scaledSize);
      if (gridIndex % majorLineInterval !== 0) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // 水平線
    for (let y = startY; y < height + scaledSize; y += scaledSize) {
      const gridIndex = gridOffsetY + Math.round((y - startY) / scaledSize);
      if (gridIndex % majorLineInterval !== 0) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 繪製主要網格線
    ctx.strokeStyle = majorLineColor;
    ctx.lineWidth = 1;

    // 垂直主線
    for (let x = startX; x < width + scaledSize; x += scaledSize) {
      const gridIndex = gridOffsetX + Math.round((x - startX) / scaledSize);
      if (gridIndex % majorLineInterval === 0) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // 水平主線
    for (let y = startY; y < height + scaledSize; y += scaledSize) {
      const gridIndex = gridOffsetY + Math.round((y - startY) / scaledSize);
      if (gridIndex % majorLineInterval === 0) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * 產生 CSS 背景樣式 (用於 HTML 元素顯示網格)
   * @returns CSS 樣式物件
   */
  toCSSBackground(): React.CSSProperties {
    if (!this.config.visible) return {};

    const { size, color, majorLineInterval, majorLineColor } = this.config;
    const majorSize = size * majorLineInterval;

    return {
      backgroundImage: `
        linear-gradient(${color} 1px, transparent 1px),
        linear-gradient(90deg, ${color} 1px, transparent 1px),
        linear-gradient(${majorLineColor} 1px, transparent 1px),
        linear-gradient(90deg, ${majorLineColor} 1px, transparent 1px)
      `,
      backgroundSize: `
        ${size}px ${size}px,
        ${size}px ${size}px,
        ${majorSize}px ${majorSize}px,
        ${majorSize}px ${majorSize}px
      `,
    };
  }
}

export default Grid;
