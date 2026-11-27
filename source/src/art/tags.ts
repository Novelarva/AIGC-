import type { BlockDef } from "../types";

/**
 * 情绪标签 —— 曲绘的「第一指标」：这首曲子是什么性格。
 *
 * 每个积木自带 1~2 个标签。玩家用了哪些积木，就决定了作品的情绪构成。
 * 标签只影响「画什么元素、用什么颜色」，不影响「画面怎么构图」——
 * 构图交给第二指标（结构指纹），两者正交，组合空间才够大。
 */
export type MoodId = "pulse" | "deep" | "lucid" | "flow" | "frenzy" | "retro";

export interface MoodMeta {
  id: MoodId;
  name: string;
  en: string;
  color: string;
}

export const MOODS: MoodMeta[] = [
  { id: "pulse", name: "脉冲", en: "PULSE", color: "#e01f4f" },
  { id: "deep", name: "深邃", en: "DEEP", color: "#6a3fd1" },
  { id: "lucid", name: "澄澈", en: "LUCID", color: "#0d8fbe" },
  { id: "flow", name: "涌动", en: "FLOW", color: "#075eeb" },
  { id: "frenzy", name: "躁动", en: "FRENZY", color: "#d98200" },
  { id: "retro", name: "回溯", en: "RETRO", color: "#c92f8f" },
];

export const MOOD_MAP: Record<MoodId, MoodMeta> = Object.fromEntries(
  MOODS.map((m) => [m.id, m]),
) as Record<MoodId, MoodMeta>;

/**
 * 积木 → 情绪标签。
 * 依据的是音色本身的物理性格，不是拍脑袋：
 *   底鼓低频下潜 + 心跳感      → 脉冲 + 深邃
 *   踩镲高频细碎                → 澄澈 + 躁动
 *   铃音清脆、泛音干净          → 澄澈（唯一单标签，代表"纯粹的亮"）
 *   Reverse / Echo 都在处理时间  → 回溯
 */
export const BLOCK_MOODS: Record<string, MoodId[]> = {
  // 节奏
  kick: ["pulse", "deep"],
  snare: ["pulse", "frenzy"],
  hat: ["lucid", "frenzy"],
  perc: ["frenzy", "flow"],
  // 音色
  piano: ["lucid", "flow"],
  bass: ["deep", "pulse"],
  synth: ["flow", "deep"],
  bell: ["lucid"],
  // 变化
  loop: ["flow", "pulse"],
  reverse: ["retro", "deep"],
  echo: ["retro", "lucid"],
  random: ["frenzy", "retro"],
};

/** 取一个积木的标签；未登记的一律当作「脉冲」，保证不会漏统计 */
export function moodsOf(blockId: string): MoodId[] {
  return BLOCK_MOODS[blockId] ?? ["pulse"];
}

/** 情绪 → 可用的视觉元素（抽象几何纸贴，不画人、不画写实乐器） */
export const MOOD_ELEMENTS: Record<MoodId, string[]> = {
  pulse: ["disc", "ring", "burst"],
  deep: ["disc", "ring", "blob"],
  lucid: ["disc", "star", "dots"],
  flow: ["wave", "arc", "blob"],
  frenzy: ["strip", "shard", "burst"],
  retro: ["ring", "arc", "dots"],
};

/** 给积木库显示用：把标签渲染成小字 */
export function moodLabel(block: BlockDef): string {
  return moodsOf(block.id)
    .map((m) => MOOD_MAP[m].name)
    .join(" · ");
}
