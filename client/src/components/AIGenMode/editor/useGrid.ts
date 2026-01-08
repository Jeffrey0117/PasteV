/**
 * useGrid Hook - Grid 系統的 React 封裝
 * 提供響應式的網格配置和吸附功能
 */

import { useState, useCallback, useMemo } from 'react';
import { Grid, DEFAULT_GRID_CONFIG } from './Grid';
import type { GridConfiguration, Point, Rect } from './Grid';

export interface UseGridReturn {
  /** Grid 實例 */
  grid: Grid;
  /** 當前配置 */
  config: GridConfiguration;
  /** 更新配置 */
  setConfig: (config: Partial<GridConfiguration>) => void;
  /** 切換啟用狀態 */
  toggleEnabled: () => void;
  /** 切換可見性 */
  toggleVisible: () => void;
  /** 吸附數值 */
  snap: (value: number) => number;
  /** 吸附點 */
  snapPoint: (point: Point) => Point;
  /** 吸附矩形 */
  snapRect: (rect: Rect) => Rect;
  /** 智能吸附數值 */
  smartSnap: (value: number) => number;
  /** 智能吸附點 */
  smartSnapPoint: (point: Point) => Point;
  /** CSS 背景樣式 */
  backgroundStyle: React.CSSProperties;
}

/**
 * useGrid Hook
 * @param initialConfig 初始配置
 * @returns Grid 相關功能
 */
export function useGrid(
  initialConfig: Partial<GridConfiguration> = {}
): UseGridReturn {
  const [config, setConfigState] = useState<GridConfiguration>({
    ...DEFAULT_GRID_CONFIG,
    ...initialConfig,
  });

  // 建立 Grid 實例
  const grid = useMemo(() => new Grid(config), [config]);

  // 更新配置
  const setConfig = useCallback((newConfig: Partial<GridConfiguration>) => {
    setConfigState((prev) => ({ ...prev, ...newConfig }));
  }, []);

  // 切換啟用
  const toggleEnabled = useCallback(() => {
    setConfigState((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // 切換可見性
  const toggleVisible = useCallback(() => {
    setConfigState((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  // 吸附函數
  const snap = useCallback(
    (value: number) => grid.snap(value),
    [grid]
  );

  const snapPoint = useCallback(
    (point: Point) => grid.snapPoint(point),
    [grid]
  );

  const snapRect = useCallback(
    (rect: Rect) => grid.snapRect(rect),
    [grid]
  );

  const smartSnap = useCallback(
    (value: number) => grid.smartSnap(value),
    [grid]
  );

  const smartSnapPoint = useCallback(
    (point: Point) => grid.smartSnapPoint(point),
    [grid]
  );

  // CSS 背景樣式
  const backgroundStyle = useMemo(
    () => grid.toCSSBackground(),
    [grid]
  );

  return {
    grid,
    config,
    setConfig,
    toggleEnabled,
    toggleVisible,
    snap,
    snapPoint,
    snapRect,
    smartSnap,
    smartSnapPoint,
    backgroundStyle,
  };
}

export default useGrid;
