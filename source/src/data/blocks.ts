import type { BlockDef, Category } from "../types";

/**
 * 积木配色 —— 对齐 BlockMusic 拼贴品牌色。
 *
 * 三个族群对应三支品牌色，和封面/首页同一套语言：
 *   节奏 → 品红/红（品牌 pink #FF5C8A / red #E6332A）
 *   音色 → 蓝（品牌 blue #075EEB）
 *   变化 → 黄（品牌 yellow #FFD429）
 *
 * 都压深过一档：界面底色是纸白，原来的荧光色在浅底上会糊掉。
 * 这些颜色同时也是曲绘的取色来源，所以整首歌的观感是统一的。
 */

export const RHYTHM_BLOCKS: BlockDef[] = [
  {
    id: "kick",
    name: "Kick",
    en: "KICK",
    category: "rhythm",
    color: "#e01f4f",
    glow: "rgba(224, 31, 79, 0.4)",
    icon: "◉",
    description: "底鼓 · 给音乐一个心跳",
    pattern: [1, 0, 0, 1, 0, 0, 1, 0],
  },
  {
    id: "snare",
    name: "Snare",
    en: "SNARE",
    category: "rhythm",
    color: "#ff3d6e",
    glow: "rgba(255, 61, 110, 0.4)",
    icon: "◍",
    description: "军鼓 · 反拍能量",
    pattern: [0, 0, 1, 0, 0, 0, 1, 0],
  },
  {
    id: "hat",
    name: "Hi-hat",
    en: "HI-HAT",
    category: "rhythm",
    color: "#ff7ba6",
    glow: "rgba(255, 123, 166, 0.4)",
    icon: "◌",
    description: "踩镲 · 持续的闪光颗粒",
    pattern: [1, 1, 1, 1, 1, 1, 1, 1],
  },
  {
    id: "perc",
    name: "Percussion",
    en: "PERC",
    category: "rhythm",
    color: "#d63322",
    glow: "rgba(214, 51, 34, 0.4)",
    icon: "◎",
    description: "打击乐 · 跳动的花音",
    pattern: [0, 1, 0, 0, 1, 0, 0, 1],
  },
];

export const SOUND_BLOCKS: BlockDef[] = [
  {
    id: "piano",
    name: "Piano",
    en: "PIANO",
    category: "sound",
    color: "#3f5ae0",
    glow: "rgba(63, 90, 224, 0.4)",
    icon: "≋",
    description: "明亮的分解琶音",
    notes: ["C4", null, "E4", null, "G4", null, "E4", null],
  },
  {
    id: "bass",
    name: "Bass",
    en: "BASS",
    category: "sound",
    color: "#6a3fd1",
    glow: "rgba(106, 63, 209, 0.4)",
    icon: "⌁",
    description: "低频 · 推动律动的腰",
    notes: ["C2", null, "C2", null, "G1", null, "G1", null],
  },
  {
    id: "synth",
    name: "Synth",
    en: "SYNTH",
    category: "sound",
    color: "#075eeb",
    glow: "rgba(7, 94, 235, 0.4)",
    icon: "⟐",
    description: "带着呼吸感的切分和弦音",
    notes: ["C4", null, null, "G4", "A4", null, "G4", null],
  },
  {
    id: "bell",
    name: "Bell",
    en: "BELL",
    category: "sound",
    color: "#8e6be8",
    glow: "rgba(142, 107, 232, 0.4)",
    icon: "✦",
    description: "清脆铃音 · 星点感",
    notes: ["G4", null, null, null, "C5", null, "E4", null],
  },
];

export const MODIFIER_BLOCKS: BlockDef[] = [
  {
    id: "loop",
    name: "Loop",
    en: "LOOP",
    category: "modifier",
    color: "#e0a400",
    glow: "rgba(224, 164, 0, 0.4)",
    icon: "∞",
    description: "让音乐持续循环",
  },
  {
    id: "reverse",
    name: "Reverse",
    en: "REVERSE",
    category: "modifier",
    color: "#d98200",
    glow: "rgba(217, 130, 0, 0.4)",
    icon: "◄◄",
    description: "把时间倒过来走",
  },
  {
    id: "echo",
    name: "Echo",
    en: "ECHO",
    category: "modifier",
    color: "#d9702a",
    glow: "rgba(217, 112, 42, 0.4)",
    icon: "◠◠",
    description: "每一次击打后留一道回声",
  },
  {
    id: "random",
    name: "Random",
    en: "RANDOM",
    category: "modifier",
    color: "#c4a000",
    glow: "rgba(196, 160, 0, 0.4)",
    icon: "✻",
    description: "每圈随机微调，永不一样",
  },
];

export const ALL_BLOCKS: BlockDef[] = [
  ...RHYTHM_BLOCKS,
  ...SOUND_BLOCKS,
  ...MODIFIER_BLOCKS,
];

export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(
  ALL_BLOCKS.map((b) => [b.id, b]),
);

export const CATEGORY_META: Record<Category, { title: string; subtitle: string }> = {
  rhythm: { title: "节奏积木 Rhythm", subtitle: "什么时候发出声音" },
  sound: { title: "音色积木 Sound", subtitle: "发出什么声音" },
  modifier: { title: "变化积木 Modifier", subtitle: "让声音发生什么变化" },
};

export const BLOCKS_BY_CATEGORY: { category: Category; blocks: BlockDef[] }[] = [
  { category: "rhythm", blocks: RHYTHM_BLOCKS },
  { category: "sound", blocks: SOUND_BLOCKS },
  { category: "modifier", blocks: MODIFIER_BLOCKS },
];
