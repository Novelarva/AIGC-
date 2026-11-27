export type Category = "rhythm" | "sound" | "modifier";

/** 每页的步数（一屏时间轴 = 8 拍） */
export const STEPS = 8;

/** 时间轴最多翻到第几页（1 页 = 8 拍，8 页 = 64 拍，够写一首小曲子） */
export const MAX_PAGES = 8;

export const LANES = [
  { id: "melody", label: "Melody / Sound" },
  { id: "harmony", label: "Harmony / Sound" },
  { id: "rhythm", label: "Rhythm" },
] as const;

/** 统一的积木定义 */
export interface BlockDef {
  id: string;
  name: string;
  en: string;
  category: Category;
  /** 主色 */
  color: string;
  /** 辉光色（用于 box-shadow） */
  glow: string;
  icon: string;
  description: string;
  /**
   * pattern[8]：对当前步数二值门控。
   * 说明：对 rhythm 来说，每一个值表示这一步是否击打（0/1）。
   * 对 sound 来说，每个非空音符表示这一步演奏该音符。
   * 实际播放时会以积木落点的列作为相位进行旋转（col offset）。
   */
  pattern?: number[];
  notes?: (string | null)[];
}

/** 已放入画布中的积木实例 */
export interface PlacedBlock {
  instanceId: string;
  blockId: string;
  lane: number; // 0..LANES.length-1
  /** 页内列号：0..STEPS-1 */
  col: number;
  /** 时间轴页号，0 起。第 0 页是 1..8 拍，第 1 页是 9..16 拍，依此类推 */
  page: number;
}

/** 积木在整首曲子里的绝对拍位（0 起）。第 2 页第 1 格 = 8 */
export function absStep(p: PlacedBlock): number {
  return p.page * STEPS + p.col;
}

export type LaneId = (typeof LANES)[number]["id"];
