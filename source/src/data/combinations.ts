export interface Combination {
  a: string;
  b: string;
  result: string;
  emoji: string;
}

/** 可发现的组合。display 中相同 blockId 的两项会被规格化成排序后的 key。 */
export const COMBINATIONS: Combination[] = [
  { a: "kick", b: "bass", result: "GROOVE", emoji: "🔥" },
  { a: "hat", b: "bell", result: "SPARKLE", emoji: "✨" },
  { a: "snare", b: "synth", result: "ENERGIZE", emoji: "⚡" },
  { a: "kick", b: "piano", result: "POP", emoji: "🎹" },
  { a: "bass", b: "synth", result: "DEEP", emoji: "🌊" },
  { a: "bell", b: "bass", result: "CHILL", emoji: "🌙" },
  { a: "snare", b: "hat", result: "DRIVE", emoji: "🏁" },
  { a: "loop", b: "reverse", result: "TIME WARP", emoji: "🌀" },
];

function comboKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

export const COMBO_MAP = new Map(COMBINATIONS.map((c) => [comboKey(c.a, c.b), c]));

export function comboKeyForIds(a: string, b: string): string {
  return comboKey(a, b);
}
