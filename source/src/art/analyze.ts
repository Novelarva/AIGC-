import { LANES, STEPS } from "../types";
import { absStep } from "../types";
import type { PlacedBlock } from "../types";
import { BLOCK_MAP } from "../data/blocks";
import { fnv1a } from "./rng";
import { MOODS, moodsOf, type MoodId } from "./tags";

/**
 * 曲绘的两个指标。
 *
 * 指标一 · 情绪构成（用了什么积木）→ 决定"画什么元素、用什么颜色"
 * 指标二 · 结构指纹（摆在什么位置）→ 决定"画面怎么构图"
 *
 * 为什么需要第二个：积木只有 12 种，光靠"用了哪几种"组合数太少，
 * 十首歌能撞出五张像的图。而"摆在 8×3 网格的哪一格"是连续量，
 * 同一个 Kick 摆在第 1 拍和第 7 拍，画出来就不该一样 ——
 * 这也正是这个项目自己的设计哲学：「积木落点决定相位」。
 *
 * ── 多页时间轴（新增）──
 * 时间轴可以翻页，每页 8 拍。第 0 页是 1~8 拍，第 1 页是 9~16 拍……
 * 结构指纹因此改为按**整首曲子**统计：列数 = 页数 × 8。
 * 摆在第 2 页的积木不会跟第 1 页撞在同一列上，画出来天然分成左右两"段"，
 * 一首两页的曲子，图和一首一页的曲子不可能像。
 */

export type MoodDist = Record<MoodId, number>;

export interface Structure {
  /** 密度：整首曲子填得多满 0~1 */
  density: number;
  /** 节奏重心：偏向开头还是结尾 0~1（0=靠前，1=靠后） */
  centroid: number;
  /** 离散度：积木聚在一处还是铺开 0~1 */
  spread: number;
  /** 音区重心：偏旋律轨还是节奏轨 0~1（0=高音旋律，1=低音节奏） */
  register: number;
  /** 对称性：占用位图与其镜像的贴合度 0~1 */
  symmetry: number;
  /** 覆盖率：用到了几列 0~1 */
  coverage: number;
  /** 每一拍的积木数，长度 = 页数 × STEPS */
  occupancy: number[];
  /** 列强度 = occupancy 归一化到 0~1，即玩家的「节奏地形」 */
  peaks: number[];
  /** 最重的一拍（积木最多的列）；全空时为 0 */
  accent: number;
  /** 空着的拍，也就是休止 */
  rests: number[];
  /** [lane][absStep] 各有几个积木 */
  laneGrid: number[][];
  /** [lane][absStep] 上具体是哪些积木（blockId）—— 让画面能逐块忠实映射 */
  cells: string[][][];
  /** 曲子一共用了几页（至少 1） */
  pageCount: number;
  /** 每页几拍 */
  stepsPerPage: number;
  /** 总拍数 = pageCount × stepsPerPage */
  totalSteps: number;
}

export interface ArtworkInput {
  seed: number;
  fingerprint: string;
  moods: MoodDist;
  struct: Structure;
  /** 玩家实际用到的积木颜色 —— 曲绘配色直接取自这里，保证和画布观感一致 */
  colors: string[];
  blockIds: string[];
  projectName: string;
}

const FALLBACK_COLORS = ["#7c9aff", "#ff6bd6", "#ffd166"];

function emptyMoods(): MoodDist {
  const m = {} as MoodDist;
  MOODS.forEach((x) => {
    m[x.id] = 0;
  });
  return m;
}

export function analyze(placed: PlacedBlock[], projectName: string): ArtworkInput {
  // —— 页数：积木摆到第几页，曲子就有多长 ——
  const pageCount = placed.reduce((m, p) => Math.max(m, (p.page ?? 0) + 1), 1);
  const totalSteps = pageCount * STEPS;
  const clampStep = (p: PlacedBlock) => Math.max(0, Math.min(totalSteps - 1, absStep(p)));

  // —— 指标一：情绪构成 ——
  const moods = emptyMoods();
  let moodTotal = 0;
  placed.forEach((p) => {
    moodsOf(p.blockId).forEach((m) => {
      moods[m] += 1;
      moodTotal += 1;
    });
  });
  if (moodTotal === 0) {
    MOODS.forEach((x) => {
      moods[x.id] = 1 / MOODS.length;
    });
  } else {
    MOODS.forEach((x) => {
      moods[x.id] = moods[x.id] / moodTotal;
    });
  }

  // —— 指标二：结构指纹（按整首曲子 = 所有页）——
  const occupancy: number[] = new Array(totalSteps).fill(0);
  const cols: number[] = [];
  const lanes: number[] = [];
  placed.forEach((p) => {
    const c = clampStep(p);
    const l = Math.max(0, Math.min(LANES.length - 1, p.lane));
    occupancy[c] += 1;
    cols.push(c);
    lanes.push(l);
  });

  const n = placed.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const std = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
  };

  const colMean = mean(cols);
  const centroid = totalSteps > 1 ? colMean / (totalSteps - 1) : 0.5;
  // 两点极端分布（0 和最后一拍）的标准差是 (totalSteps-1)/2，用它归一化
  const spread = Math.min(1, std(cols) / ((totalSteps - 1) / 2));
  const register = LANES.length > 1 ? mean(lanes) / (LANES.length - 1) : 0.5;
  const density = Math.min(1, n / (totalSteps * LANES.length));
  const usedCols = occupancy.filter((c) => c > 0).length;
  const coverage = usedCols / totalSteps;

  // 对称性：位图和镜像的曼哈顿距离，归一化到 0~1。
  // 多页时镜像 = 「后半段和前半段的倒序像不像」，等于在问"两页手法一致吗"。
  let diff = 0;
  for (let i = 0; i < totalSteps; i += 1) diff += Math.abs(occupancy[i] - occupancy[totalSteps - 1 - i]);
  const symmetry = n > 0 ? Math.max(0, 1 - diff / (2 * n)) : 1;

  // —— 节奏地形：玩家的每一拍有多重 ——
  // 这是「我的摆放被看见」的关键。之前只算了 occupancy 却没喂给画面，
  // 导致第 1 拍堆三个块和第 1 拍空着画出来几乎一样，现在补上。
  const maxOcc = Math.max(...occupancy, 1);
  const peaks = occupancy.map((c) => c / maxOcc);
  let accent = 0;
  for (let i = 1; i < totalSteps; i += 1) if (occupancy[i] > occupancy[accent]) accent = i;
  const rests: number[] = [];
  occupancy.forEach((c, i) => {
    if (c === 0) rests.push(i);
  });

  // 轨 × 拍 网格：既记数量，也记住具体是哪一块（供画面逐块映射）
  const laneGrid: number[][] = LANES.map(() => new Array(totalSteps).fill(0));
  const cells: string[][][] = LANES.map(() =>
    Array.from({ length: totalSteps }, () => [] as string[]),
  );
  placed.forEach((p) => {
    const c = clampStep(p);
    const l = Math.max(0, Math.min(LANES.length - 1, p.lane));
    laneGrid[l][c] += 1;
    cells[l][c].push(p.blockId);
  });

  const struct: Structure = {
    density,
    centroid,
    spread,
    register,
    symmetry,
    coverage,
    occupancy,
    peaks,
    accent,
    rests,
    laneGrid,
    cells,
    pageCount,
    stepsPerPage: STEPS,
    totalSteps,
  };

  // —— 种子 ——
  // 位置按 (page, lane, col) 规范化排序，保证"摆成一样的配置 = 同一张图"，
  // 而不是被放入画布的先后顺序影响。
  const canonical = [...placed]
    .map((p) => `${p.blockId}:${p.page ?? 0}:${p.lane}:${p.col}`)
    .sort()
    .join(",");
  const moodKey = MOODS.map((m) => `${m.id}${moods[m.id].toFixed(4)}`).join("");
  const structKey = `${struct.density.toFixed(4)}${struct.centroid.toFixed(4)}${struct.spread.toFixed(
    4,
  )}${struct.register.toFixed(4)}${struct.symmetry.toFixed(4)}${struct.coverage.toFixed(4)}`;
  const seed = fnv1a(`${projectName}|${canonical}|${moodKey}|${structKey}`);
  const fingerprint = seed.toString(16).toUpperCase().padStart(8, "0").slice(0, 8);

  // —— 配色：直接取自玩家用到的积木 ——
  const seen: string[] = [];
  placed.forEach((p) => {
    const c = BLOCK_MAP[p.blockId]?.color;
    if (c && !seen.includes(c)) seen.push(c);
  });
  const colors = seen.length >= 2 ? seen : [...seen, ...FALLBACK_COLORS].slice(0, 3);

  return {
    seed,
    fingerprint,
    moods,
    struct,
    colors,
    blockIds: placed.map((p) => p.blockId),
    projectName,
  };
}

/** 取占比最高的 N 个标签（用于评语） */
export function topMoods(moods: MoodDist, n = 2): { id: MoodId; value: number }[] {
  return MOODS.map((m) => ({ id: m.id, value: moods[m.id] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}
