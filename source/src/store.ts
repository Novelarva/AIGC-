import { create } from "zustand";
import type { Category, PlacedBlock } from "./types";
import { MAX_PAGES } from "./types";
import { BLOCK_MAP } from "./data/blocks";

/** 目前正在进行的拖拽载荷（库里的新积木，或画布上的旧积木） */
export type DragPayload =
  | { kind: "new"; blockId: string; category: Category }
  | { kind: "placed"; instanceId: string; blockId: string };

export interface BlocksState {
  /** 画布上的积木实例 */
  placed: PlacedBlock[];
  /** 正在拖拽中的载荷 */
  dragPayload: DragPayload | null;
  /** 是否已把指针拖到画布外面（用于「拖出画布 = 删除」提示） */
  dragOutside: boolean;
  /** 正在播放的 step（用于高亮当前列） */
  playStep: number;
  /** 本步真正发声的实例 id */
  activeIds: Set<string>;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 已发现的组合 id 集合，用于“探索更多组合”的锁定/解锁效果 */
  discovered: Set<string>;
  /** 最近刚触发的 combo key（用于短暂显示 NEW SOUND DISCOVERED 横幅） */
  justDiscovered: string | null;
  /** 项目标题 */
  projectName: string;
  /** 当前正在浏览的时间轴页号（0 起） */
  page: number;

  // actions
  setPlaced: (fn: (prev: PlacedBlock[]) => PlacedBlock[]) => void;
  setDragPayload: (p: DragPayload | null) => void;
  setDragOutside: (v: boolean) => void;
  setPlayStep: (v: number) => void;
  setActiveIds: (v: Set<string>) => void;
  setIsPlaying: (v: boolean) => void;
  markDiscovered: (key: string) => void;
  setJustDiscovered: (v: string | null) => void;
  setProjectName: (v: string) => void;
  setPage: (v: number) => void;
  clearPlaced: () => void;
}

let idSeq = 0;
export function nextInstanceId(): string {
  idSeq += 1;
  return `pb-${Date.now()}-${idSeq}`;
}

export const useBlocksStore = create<BlocksState>((set) => ({
  placed: [],
  dragPayload: null,
  dragOutside: false,
  playStep: 0,
  activeIds: new Set(),
  isPlaying: false,
  discovered: new Set(),
  justDiscovered: null,
  projectName: "My Music",
  page: 0,

  setPlaced: (fn) => set((s) => ({ placed: fn(s.placed) })),
  setDragPayload: (p) => set({ dragPayload: p }),
  setDragOutside: (v) => set({ dragOutside: v }),
  setPlayStep: (v) => set({ playStep: v }),
  setActiveIds: (v) => set({ activeIds: v }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  markDiscovered: (key) => set((s) => ({ discovered: new Set([...s.discovered, key]) })),
  setJustDiscovered: (v) => set({ justDiscovered: v }),
  setProjectName: (v) => set({ projectName: v }),
  setPage: (v) => set({ page: Math.max(0, Math.min(MAX_PAGES - 1, Math.floor(v))) }),
  clearPlaced: () => set({ placed: [], page: 0 }),
}));

export function getBlockCategory(blockId: string): Category | undefined {
  return BLOCK_MAP[blockId]?.category;
}
