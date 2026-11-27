/**
 * 确定性随机 —— 曲绘的唯一性来源。
 *
 * 规则：同一份作品特征 → 同一个 seed → 同一张图。
 * 任何"随机"都必须只来自这里，绝不许用 Math.random()，
 * 否则同一首歌两次点「完成」会出两张不同的图，玩家就不会觉得"这是我的"。
 */

/** FNV-1a 32 位哈希：把任意字符串压成一个整数种子 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：十行代码的高质量伪随机序列发生器 */
export function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  f: () => number;
  range: (a: number, b: number) => number;
  int: (a: number, b: number) => number;
  pick: <T>(arr: T[]) => T;
  chance: (p: number) => boolean;
  sign: () => number;
}

export function makeRng(seed: number): Rng {
  const f = mulberry32(seed);
  return {
    f,
    range: (a, b) => a + (b - a) * f(),
    int: (a, b) => Math.floor(a + (b - a + 1) * f()),
    pick: <T,>(arr: T[]) => arr[Math.floor(f() * arr.length) % arr.length],
    chance: (p) => f() < p,
    sign: () => (f() < 0.5 ? -1 : 1),
  };
}

/**
 * 加权抽取，而不是直接取最大值。
 *
 * 直接取 max 会让某一个骨架长期霸榜（实测 BPM 权重给大了之后，
 * 40 首曲子里「轨道」占了 11 个，另外 4 种骨架基本没被用上）。
 * 加权抽保证：贴合度高的更可能被选中，但其余的也有机会 —— 分布才健康。
 */
export function weightedPick<K extends string>(
  score: Record<K, number>,
  rng: Rng,
  sharp = 2.4,
): K {
  const keys = Object.keys(score) as K[];
  const ws = keys.map((k) => Math.pow(Math.max(score[k], 0.02), sharp));
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rng.f() * total;
  for (let i = 0; i < keys.length; i += 1) {
    r -= ws[i];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
}
