import type { ArtworkInput } from "./analyze";
import { topMoods } from "./analyze";
import { LANES, STEPS } from "../types";
import { BLOCK_MAP } from "../data/blocks";
import { makeRng, weightedPick, type Rng } from "./rng";
import { MOODS, MOOD_ELEMENTS, MOOD_MAP, moodsOf, type MoodId } from "./tags";

/**
 * 曲绘生成器 —— 输出 SVG 字符串。
 *
 * 分工（三者正交，组合空间才够大）：
 *   构图骨架 ← 结构指纹（积木摆在什么位置）
 *   元素形状 ← 情绪标签（用了什么积木）
 *   颜色     ← 玩家实际用到的积木颜色
 *
 * 画风对齐游戏本体（新版浅色拼贴 / 剪纸风）：
 *   纸感米白底 + 墨蓝描边 + 品牌色（蓝 / 黄 / 粉 / 红）实心块 + 硬偏移投影。
 *   每一枚形状都像一张被剪下来、贴上去的纸贴（sticker / 拼贴），
 *   不画人、不画写实乐器，全是抽象几何 —— 和创作界面的「拼贴卡片」语言一致。
 *
 * ── 第二版的核心修正 ──
 * 上一版只把结构指纹用来「挑一个骨架」，挑完之后骨架内部全靠随机，
 * 于是「第 1 拍堆三个块」和「第 1 拍空着」画出来几乎一样 —— 承诺没兑现。
 *
 * 这一版让 8 列的强度（peaks，也就是玩家的节奏地形）**驱动骨架本身的参数**：
 * 重拍那一拍，在画面上就是更凸、更大、更密。
 *
 * 统一隐喻：时间沿某个方向展开，每一拍的轻重直接决定那个位置的体量。
 *   曼陀罗  · 时间 = 角度（顺时针一圈）
 *   轨道    · 时间 = 半径（由内向外，像年轮）
 *   潮汐    · 时间 = 横轴（左→右），波幅 = 那一拍的轻重
 *   地层    · 时间 = 横轴，轨道 = 纵轴（流动）
 *   矩阵    · 时间 = 横轴，轨道 = 纵轴（严格网格，逐块映射）
 *   星丛    · 星点密度按每一拍的轻重加权
 */

const W = 1000;
const H = 1000;
const PAD = 110;

/** 品牌墨蓝：所有形状的描边与硬投影都来自它 */
const INK = "#0b1b3a";
/** 纸感米白底 */
const PAPER = "#f4f1e9";

type Skeleton = "mandala" | "constellation" | "strata" | "orbit" | "tide" | "lattice";

export const SKELETON_NAMES: Record<Skeleton, string> = {
  mandala: "曼陀罗",
  constellation: "星丛",
  strata: "地层",
  orbit: "轨道",
  tide: "潮汐",
  lattice: "矩阵",
};

interface El {
  svg: string;
  x: number;
  y: number;
  rot?: number;
}

/* ---------- 坐标映射：画布的「总拍数 × 3 轨」→ 画面坐标 ---------- */
/**
 * 列数不再是写死的 8：时间轴可以翻页，第 N 页就是第 8N+1..8N+8 拍。
 * 一首两页的曲子 = 16 列，横向骨架自然分成左右两"段"，
 * 径向骨架（曼陀罗 / 轨道）绕一整圈走完两页。
 */
type ColX = (c: number) => number;
type ColAngle = (c: number) => number;

/** 第 l 轨 → 画面纵坐标。lane 0 是旋律（高音）在上，lane 2 是节奏（低音）在下 */
const laneY = (l: number) => PAD + ((H - PAD * 2) * (l + 0.5)) / LANES.length;

/** 按列强度加权抽一列：重拍更容易被抽中 */
function weightedCol(rng: Rng, peaks: number[]): number {
  const total = peaks.reduce((a, b) => a + b, 0);
  if (total <= 0) return rng.int(0, peaks.length - 1);
  let r = rng.f() * total;
  for (let i = 0; i < peaks.length; i += 1) {
    r -= peaks[i];
    if (r <= 0) return i;
  }
  return peaks.length - 1;
}

/* ---------- 形状库：全部为抽象几何，像剪下来的纸贴 ---------- */
/**
 * 形状统一为「实心品牌色 + 墨蓝描边 + 硬偏移投影」。
 * geom(f, st) 只负责几何：f=填充色，st=描边属性串（投影副本里传空串）。
 * 投影 = 同一几何、墨蓝填充、整体右下移 (5,6)、低不透明，制造剪纸的厚度感。
 */
function shape(kind: string, s: number, color: string, op: number): string {
  const sw = `stroke="${INK}" stroke-width="${Math.max(1.6, s * 0.07).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"`;

  const geom = (f: string, st: string): string => {
    switch (kind) {
      case "disc":
        return `<circle r="${(s * 0.5).toFixed(1)}" fill="${f}" ${st}/>`;
      case "dot":
        return `<circle r="${(s * 0.42).toFixed(1)}" fill="${f}" ${st}/>`;
      case "star": {
        const pts: string[] = [];
        for (let i = 0; i < 10; i += 1) {
          const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
          const r = i % 2 ? s * 0.42 : s * 0.6;
          pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(" ")}" fill="${f}" ${st}/>`;
      }
      case "tri":
        return `<polygon points="0,${(-s * 0.55).toFixed(1)} ${(s * 0.5).toFixed(1)},${(s * 0.45).toFixed(1)} ${(-s * 0.5).toFixed(1)},${(s * 0.45).toFixed(1)}" fill="${f}" ${st}/>`;
      case "square":
        return `<rect x="${(-s * 0.5).toFixed(1)}" y="${(-s * 0.5).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.16).toFixed(1)}" fill="${f}" ${st}/>`;
      case "blob":
        return `<ellipse rx="${(s * 0.56).toFixed(1)}" ry="${(s * 0.4).toFixed(1)}" fill="${f}" ${st}/>`;
      case "ring": {
        // 圆环 = 实心盘 + 纸色中心孔（投影副本里 f=墨蓝，不画孔）
        const d = `<circle r="${(s * 0.5).toFixed(1)}" fill="${f}" ${st}/>`;
        const hole = f === INK ? "" : `<circle r="${(s * 0.2).toFixed(1)}" fill="${PAPER}" stroke="none"/>`;
        return d + hole;
      }
      case "wave": {
        const amp = s * 0.42;
        let d = `M${(-s * 1.7).toFixed(1)},${(-s * 0.5).toFixed(1)}`;
        for (let x = -s * 1.7; x <= s * 1.7; x += s * 0.3) {
          d += ` L${x.toFixed(1)},${(-s * 0.5 + Math.sin(x / s * 2) * amp).toFixed(1)}`;
        }
        d += ` L${(s * 1.7).toFixed(1)},${(s * 0.5).toFixed(1)}`;
        for (let x = s * 1.7; x >= -s * 1.7; x -= s * 0.3) {
          d += ` L${x.toFixed(1)},${(s * 0.5 + Math.sin(x / s * 2) * amp).toFixed(1)}`;
        }
        d += " Z";
        return `<path d="${d}" fill="${f}" ${st}/>`;
      }
      case "burst": {
        let out = "";
        const n = 10;
        for (let i = 0; i < n; i += 1) {
          const a = (Math.PI * 2 * i) / n;
          const w = 0.17;
          const p1x = Math.cos(a - w) * s;
          const p1y = Math.sin(a - w) * s;
          const p2x = Math.cos(a + w) * s;
          const p2y = Math.sin(a + w) * s;
          out += `<polygon points="0,0 ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}" fill="${f}" ${st}/>`;
        }
        return out;
      }
      case "arc":
        return `<path d="M${(-s).toFixed(1)},0 A${s.toFixed(1)},${s.toFixed(1)} 0 0 1 ${s.toFixed(1)},0 Z" fill="${f}" ${st}/>`;
      case "shard":
        return `<polygon points="0,${(-s * 0.6).toFixed(1)} ${(s * 0.55).toFixed(1)},${(s * 0.5).toFixed(1)} ${(-s * 0.6).toFixed(1)},${(s * 0.35).toFixed(1)}" fill="${f}" ${st}/>`;
      case "dots": {
        let out = "";
        for (let gx = -1; gx <= 1; gx += 1) {
          for (let gy = -1; gy <= 1; gy += 1) {
            out += `<circle cx="${(gx * s * 0.28).toFixed(1)}" cy="${(gy * s * 0.28).toFixed(1)}" r="${(s * 0.1).toFixed(1)}" fill="${f}" ${st}/>`;
          }
        }
        return out;
      }
      case "strip":
        return `<rect x="${(-s * 0.9).toFixed(1)}" y="${(-s * 0.18).toFixed(1)}" width="${(s * 1.8).toFixed(1)}" height="${(s * 0.36).toFixed(1)}" rx="${(s * 0.18).toFixed(1)}" fill="${f}" ${st}/>`;
      default:
        return `<circle r="${(s * 0.42).toFixed(1)}" fill="${f}" ${st}/>`;
    }
  };

  const shadow = `<g transform="translate(5,6)" opacity="0.16">${geom(INK, "")}</g>`;
  const main = geom(color, sw);
  return `<g opacity="${op.toFixed(2)}">${shadow}${main}</g>`;
}

/* ---------- 生成器 ---------- */
export function generateArtwork(input: ArtworkInput): { svg: string; skeleton: Skeleton } {
  const rng = makeRng(input.seed);
  const { moods, struct, colors } = input;
  const cx = W / 2;
  const cy = H / 2;
  const main = colors[0] ?? "#075eeb";
  const alt = colors[1] ?? colors[0] ?? "#ffd429";
  const third = colors[2] ?? alt;

  // 主情绪颜色：让画面中心的纸底微微染上「这首曲子的性格色」，
  // 强化「这张图就是这首曲子」的对应感（音乐相关度 B）。
  const topMood = topMoods(moods, 1)[0];
  const tint = topMood ? MOOD_MAP[topMood.id].color : main;

  // —— 总拍数（= 页数 × 每页 8 拍）。所有"8"都从这里走 ——
  const cols = Math.max(1, struct.occupancy.length || STEPS);
  const colDenom = Math.max(1, cols - 1);
  /** 第 c 拍 → 画面横坐标 */
  const colX: ColX = (c) => PAD + ((W - PAD * 2) * (c + 0.5)) / cols;
  /** 第 c 拍 → 极角（正上方为第 1 拍，顺时针一圈） */
  const colAngle: ColAngle = (c) => (Math.PI * 2 * c) / cols - Math.PI / 2;

  // 列变多以后元素得收一点，否则两页的曲子会糊成一团密不透风的点。
  const sc = Math.sqrt(STEPS / cols);

  // 没放任何积木时给一条均匀的兜底地形，避免画面塌成一片空
  const pk = input.blockIds.length ? struct.peaks : new Array(cols).fill(0.5);
  const accent = struct.accent;

  // 每一拍上分别是哪些积木（跨所有轨），供径向 / 横向骨架取用
  const colBlocks: string[][] = Array.from({ length: cols }, () => [] as string[]);
  struct.cells.forEach((row) => {
    row.forEach((ids, c) => ids.forEach((id) => colBlocks[c].push(id)));
  });

  // 权重经过配平：让六个骨架在「典型配置」下的期望得分都落在 2.1 附近。
  // 否则会出现某个骨架长期霸榜，一半的构图基本见不到。
  const skeleton = weightedPick<Skeleton>(
    {
      mandala: 1.0 + struct.symmetry * 1.8 + (1 - struct.spread) * 0.5,
      constellation: 0.62 + (1 - struct.density) * 1.6 + (1 - struct.coverage) * 0.7,
      strata: 0.96 + Math.abs(struct.register - 0.5) * 2.0 + struct.spread * 1.4,
      orbit: 0.9 + struct.centroid * 1.0 + struct.symmetry * 0.8 + struct.density * 1.2,
      tide: 0.78 + struct.spread * 1.4 + struct.coverage * 0.8,
      lattice: 1.0 + struct.density * 2.0 + struct.coverage * 1.0,
    },
    rng,
    2.4,
  );

  const els: El[] = [];
  const add = (e: El) => els.push(e);

  // 情绪 → 元素池（占比越高，该类元素出现概率越大）
  const pool: string[] = [];
  MOODS.forEach((m) => {
    const n = Math.round(moods[m.id] * 20);
    for (let i = 0; i < n; i += 1) pool.push(...MOOD_ELEMENTS[m.id as MoodId]);
  });
  const pickKind = () => (pool.length ? rng.pick(pool) : "dot");
  const pickColor = () => rng.pick(colors);

  /** 自由撒一个元素（不绑定具体积木） */
  const at = (x: number, y: number, s: number, rot?: number) => {
    add({ svg: shape(pickKind(), s * sc, pickColor(), rng.range(0.7, 0.95)), x, y, rot });
  };

  /** 忠实映射：这一格上放的是哪块积木，就用它的标签取形状、用它的颜色上色 */
  const atCell = (blockId: string, x: number, y: number, s: number, rot?: number) => {
    const ms = moodsOf(blockId);
    const kind = rng.pick(MOOD_ELEMENTS[(ms[0] ?? "lucid") as MoodId] ?? ["dot"]);
    const color = BLOCK_MAP[blockId]?.color ?? main;
    add({ svg: shape(kind, s * sc, color, rng.range(0.78, 0.96)), x, y, rot });
  };

  /** 重拍主焦点：画面总要有个视觉中心，不然就是一盘散沙。做成一枚大号纸贴。 */
  const addAccent = (x: number, y: number, s: number) => {
    add({ svg: accentShape(x, y, s * sc, main), x: 0, y: 0 });
  };

  if (skeleton === "mandala") {
    // 时间 = 角度。越对称的曲子，重拍凸出得越含蓄（保住对称美）；
    // 越不对称，重拍越张扬。
    const bias = 1 - struct.symmetry * 0.5;
    const layers = rng.int(3, 4);
    addAccent(cx, cy, rng.range(110, 150));
    add({ svg: shape("star", rng.range(34, 52), alt, 0.95), x: cx, y: cy });
    for (let L = 1; L <= layers; L += 1) {
      const base = 96 + L * rng.range(70, 92);
      for (let c = 0; c < cols; c += 1) {
        const a = colAngle(c) + (L % 2 ? Math.PI / cols : 0);
        const R = base + pk[c] * 182 * bias;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const ids = colBlocks[c];
        const s = 15 + pk[c] * 34;
        if (ids.length) {
          atCell(rng.pick(ids), x, y, s, (a * 180) / Math.PI + 90);
        } else if (rng.chance(0.35)) {
          // 空拍：只留一枚极淡的小环。留白也是节奏的一部分，
          // 把空处画满反而会把重拍淹没掉。
          add({ svg: shape("ring", s * 0.45, alt, 0.22), x, y });
        }
      }
      els.push({
        svg: `<circle r="${(base + 26).toFixed(1)}" stroke="${alt}" stroke-width="1.4" fill="none" opacity="0.3"/>`,
        x: cx,
        y: cy,
      });
    }
    const aa = colAngle(accent);
    addAccent(cx + Math.cos(aa) * (96 + layers * 82), cy + Math.sin(aa) * (96 + layers * 82), 60 + pk[accent] * 46);
  } else if (skeleton === "constellation") {
    // 星点密度按每一拍的轻重加权：重拍那一片星更密
    const n = rng.int(13, 19);
    const pts: number[][] = [];
    for (let g = 0; g < n * 16 && pts.length < n; g += 1) {
      const c = weightedCol(rng, pk);
      const x = colX(c) + rng.range(-58, 58);
      const y = rng.range(110, H - 110);
      if (pts.every((p) => (p[0] - x) ** 2 + (p[1] - y) ** 2 > 132 * 132)) pts.push([x, y]);
    }
    let lines = "";
    pts.forEach((p) => {
      const near = pts
        .map((q, i) => ({ i, d: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(1, 3);
      near.forEach((o) => {
        lines += `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${pts[o.i][0].toFixed(1)}" y2="${pts[o.i][1].toFixed(1)}" stroke="${third}" stroke-width="1.6" opacity="0.4"/>`;
      });
    });
    els.push({ svg: lines, x: 0, y: 0 });
    pts.forEach((p) => at(p[0], p[1], rng.range(8, 22), rng.range(0, 360)));
    // 两团远景大贴：给画面一点重量，但不至于糊成一片。
    for (let i = 0; i < 2; i += 1) {
      const c = weightedCol(rng, pk);
      addAccent(colX(c) + rng.range(-50, 50), rng.range(180, H - 180), rng.range(50, 84) * (0.6 + pk[c] * 0.6));
    }
    addAccent(colX(accent), rng.range(cy - 130, cy + 130), 78 + pk[accent] * 58);
  } else if (skeleton === "strata") {
    // 3 条轨 → 3 个地层（正好对应 Melody / Harmony / Rhythm）。
    // 层内横向位置由该轨该列的积木决定，等于把画布摊平成了画面。
    const bands = LANES.length;
    const bh = (H - PAD * 2) / bands;
    for (let l = 0; l < bands; l += 1) {
      const top = PAD + bh * l;
      for (let c = 0; c < cols; c += 1) {
        const ids = struct.cells[l][c];
        for (let k = 0; k < ids.length; k += 1) {
          atCell(
            ids[k],
            colX(c) + rng.range(-24, 24),
            top + bh * 0.5 + rng.range(-bh * 0.26, bh * 0.26),
            rng.range(15, 33) * (0.7 + pk[c] * 0.85),
            rng.range(0, 360),
          );
        }
      }
      if (l < bands - 1) {
        els.push({
          svg: `<line x1="${rng.range(40, 110).toFixed(1)}" y1="${(top + bh).toFixed(1)}" x2="${rng
            .range(W - 110, W - 40)
            .toFixed(1)}" y2="${(top + bh).toFixed(1)}" stroke="${alt}" stroke-width="2" opacity="0.4"/>`,
          x: 0,
          y: 0,
        });
      }
    }
    addAccent(colX(accent), laneY(1), 58 + pk[accent] * 50);
  } else if (skeleton === "orbit") {
    // 时间 = 半径，由内向外像年轮。第 1 拍在最里圈，第 8 拍在最外圈。
    addAccent(cx, cy, rng.range(96, 124));
    add({ svg: shape(rng.pick(["star", "ring", "dot"]), rng.range(36, 56), alt, 0.95), x: cx, y: cy });
    const rMax = W * 0.4;
    for (let c = 0; c < cols; c += 1) {
      const R = 118 + ((rMax - 118) * c) / colDenom;
      const ry = R * rng.range(0.62, 0.95);
      const rot = rng.range(0, 180);
      const p = pk[c];
      els.push({
        svg: `<ellipse rx="${R.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${rot.toFixed(1)})" stroke="${alt}" stroke-width="${(2 + p * 2.4).toFixed(1)}" fill="none" opacity="${(0.3 + p * 0.4).toFixed(2)}"/>`,
        x: cx,
        y: cy,
      });
      const bodies = Math.max(1, struct.occupancy[c]);
      for (let i = 0; i < bodies; i += 1) {
        const a = rng.range(0, Math.PI * 2);
        const ca = Math.cos((rot * Math.PI) / 180);
        const sa = Math.sin((rot * Math.PI) / 180);
        const dx = Math.cos(a) * R;
        const dy = Math.sin(a) * ry;
        const px = cx + dx * ca - dy * sa;
        const py = cy + dx * sa + dy * ca;
        const ids = colBlocks[c];
        if (ids.length) atCell(rng.pick(ids), px, py, 11 + p * 22, rng.range(0, 360));
        else add({ svg: shape("dot", 7, alt, 0.4), x: px, y: py });
      }
    }
    const aa = colAngle(accent);
    addAccent(cx + Math.cos(aa) * rMax * 0.62, cy + Math.sin(aa) * rMax * 0.62, 62 + pk[accent] * 46);
  } else if (skeleton === "tide") {
    // 横轴 = 时间，波幅 = 那一拍的轻重。空拍处水面几乎是平的。
    // 必须对相邻两拍做线性插值：直接按列取整会让水面变成台阶状折线，像方波不像水。
    const envAt = (x: number) => {
      const t = (x - PAD) / (W - PAD * 2);
      if (t < 0 || t > 1) return 0.03;
      const f = t * cols - 0.5;
      const i0 = Math.max(0, Math.min(cols - 1, Math.floor(f)));
      const i1 = Math.max(0, Math.min(cols - 1, i0 + 1));
      const k = Math.max(0, Math.min(1, f - i0));
      return 0.03 + (pk[i0] * (1 - k) + pk[i1] * k) * 1.25;
    };
    const n = rng.int(5, 7);
    const gap = H / (n + 0.4);
    for (let i = 0; i < n; i += 1) {
      const y = (H * (i + 0.6)) / (n + 0.4);
      // 振幅封顶在半层高以内：否则相邻两层的水面会互相穿插，看着像一团乱麻
      const amp = Math.min(rng.range(34, 78), gap * 0.44) * (1 - (Math.abs(i - n / 2) / n) * 0.5);
      const ph = rng.range(0, Math.PI * 2);
      let d = `M0,${y.toFixed(1)}`;
      for (let x = 0; x <= W; x += 14) d += ` L${x},${(y + Math.sin(x / 140 + ph) * amp * envAt(x)).toFixed(1)}`;
      els.push({
        svg: `<path d="${d}" stroke="${pickColor()}" stroke-width="${rng.range(3, 6).toFixed(1)}" fill="none" opacity="${rng
          .range(0.6, 0.9)
          .toFixed(2)}" stroke-linecap="round"/>`,
        x: 0,
        y: 0,
      });
    }
    for (let k = 0; k < rng.int(9, 14); k += 1) {
      const c = weightedCol(rng, pk);
      at(colX(c) + rng.range(-46, 46), rng.range(90, H - 90), rng.range(11, 30), rng.range(0, 360));
    }
    addAccent(colX(accent), cy, 62 + pk[accent] * 62);
  } else {
    // 矩阵：总拍数 × 3 轨严格对齐，画面就是画布摊平后的镜像。
    // 空格子只留一个几乎看不见的点 —— 留白也是节奏的一部分。
    const cellW = (W - PAD * 2) / cols;
    const cellH = (H - PAD * 2) / LANES.length;
    // 先给「有块的拍」铺一层淡色竖带：重拍那一列自带底色。
    // 没有它，元素就是一堆悬在虚空里的点，画面会很散。
    for (let c = 0; c < cols; c += 1) {
      if (struct.occupancy[c] === 0) continue;
      els.push({
        svg: `<rect width="${cellW.toFixed(1)}" height="${(H - PAD * 2).toFixed(1)}" fill="${main}" opacity="${(0.05 + pk[c] * 0.07).toFixed(3)}"/>`,
        x: PAD + cellW * c,
        y: PAD,
      });
    }
    let grid = "";
    for (let c = 0; c <= cols; c += 1) {
      const v = (PAD + cellW * c).toFixed(1);
      grid += `<line x1="${v}" y1="${PAD}" x2="${v}" y2="${(H - PAD).toFixed(1)}" stroke="${alt}" stroke-width="1" opacity="0.3"/>`;
    }
    for (let l = 0; l <= LANES.length; l += 1) {
      const v = (PAD + cellH * l).toFixed(1);
      grid += `<line x1="${PAD}" y1="${v}" x2="${(W - PAD).toFixed(1)}" y2="${v}" stroke="${alt}" stroke-width="1" opacity="0.3"/>`;
    }
    els.push({ svg: grid, x: 0, y: 0 });
    for (let l = 0; l < LANES.length; l += 1) {
      for (let c = 0; c < cols; c += 1) {
        const ids = struct.cells[l][c];
        const x = PAD + cellW * (c + 0.5);
        const y = PAD + cellH * (l + 0.5);
        if (ids.length === 0) {
          if (rng.chance(0.45)) add({ svg: `<circle r="3.6" fill="${alt}" opacity="0.32"/>`, x, y });
          continue;
        }
        ids.forEach((id, k) => {
          const off = ids.length > 1 ? (k - (ids.length - 1) / 2) * cellW * 0.2 : 0;
          atCell(id, x + off, y, cellW * (rng.chance(0.18) ? 0.52 : 0.32), rng.pick([0, 90, 180, 270]));
        });
      }
    }
    addAccent(colX(accent), laneY(1), 56 + pk[accent] * 62);
  }

  // 分页分节线：时间轴上翻一页，画面里也该留一道痕。
  // 横向骨架画竖分节线，曼陀罗画辐条，轨道画年轮圈 —— 各按自己的"时间方向"来。
  if (struct.pageCount > 1) {
    const per = struct.stepsPerPage;
    if (skeleton === "mandala") {
      let spokes = "";
      for (let k = 1; k < struct.pageCount; k += 1) {
        const a = colAngle(k * per);
        spokes += `<line x1="${(cx + Math.cos(a) * 96).toFixed(1)}" y1="${(cy + Math.sin(a) * 96).toFixed(1)}" x2="${(cx + Math.cos(a) * (W * 0.44)).toFixed(1)}" y2="${(cy + Math.sin(a) * (W * 0.44)).toFixed(1)}" stroke="${INK}" stroke-width="2" stroke-dasharray="6 10" opacity="0.3"/>`;
      }
      els.push({ svg: spokes, x: 0, y: 0 });
    } else if (skeleton === "orbit") {
      let rings = "";
      for (let k = 1; k < struct.pageCount; k += 1) {
        const R = 118 + ((W * 0.4 - 118) * (k * per)) / colDenom;
        rings += `<circle r="${R.toFixed(1)}" stroke="${INK}" stroke-width="2" stroke-dasharray="6 10" fill="none" opacity="0.28"/>`;
      }
      els.push({ svg: rings, x: cx, y: cy });
    } else {
      let marks = "";
      for (let k = 1; k < struct.pageCount; k += 1) {
        const x = (PAD + (W - PAD * 2) * ((k * per) / cols)).toFixed(1);
        marks += `<line x1="${x}" y1="${(PAD - 34).toFixed(1)}" x2="${x}" y2="${(H - PAD + 34).toFixed(1)}" stroke="${INK}" stroke-width="2" stroke-dasharray="7 11" opacity="0.26"/>`;
      }
      els.push({ svg: marks, x: 0, y: 0 });
    }
  }

  // 密度守恒：块多则少补，块少则多补 —— 不管摆几个，画面饱满度恒定。
  // 补的元素也往重拍附近聚，进一步强化"哪里有声音哪里就密"。
  const used = input.blockIds.length;
  const target = 30;
  const filler = Math.max(4, Math.min(20, target - used));
  for (let i = 0; i < filler; i += 1) {
    // 大部分补在重拍附近（哪里有声音哪里就密），但要留四分之一随机落点，
    // 否则块全堆在开头时右半边会彻底空掉，画面直接失衡。
    const c = rng.chance(0.18) ? rng.int(0, cols - 1) : weightedCol(rng, pk);
    const l = rng.int(0, LANES.length - 1);
    at(colX(c) + rng.range(-42, 42), laneY(l) + rng.range(-56, 56), rng.range(18, 42), rng.range(0, 360));
  }

  return { svg: wrapSvg(els, main, alt, input.fingerprint, tint), skeleton };
}

/**
 * 重拍焦点的一枚大号纸贴：实心品牌色盘 + 墨蓝粗描边 + 更厚的硬投影，
 * 像一张被刻意压在画面中央的贴纸，给整张图一个锚点。
 */
function accentShape(x: number, y: number, s: number, color: string): string {
  const disc = `<circle r="${(s * 0.5).toFixed(1)}" fill="${color}" stroke="${INK}" stroke-width="3"/>`;
  const ring = `<circle r="${(s * 0.64).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="3" opacity="0.9"/>`;
  const shadow = `<circle r="${(s * 0.5).toFixed(1)}" fill="${INK}" opacity="0.2" transform="translate(8,9)"/>`;
  return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">${shadow}${disc}${ring}</g>`;
}

/**
 * 右下角的作品标记：8 颗小点，大小与亮度对应指纹的 8 位十六进制。
 * 像版画下缘的版号 —— 同一首曲子，这枚标记也分毫不差。
 * 刻意做得极小，它只在凑近看时才存在，不会干扰画面。
 */
function fingerprintMark(fp: string, color: string): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const v = parseInt(fp[i] ?? "0", 16) / 15;
    out += `<circle cx="${(i * 15).toFixed(0)}" cy="0" r="${(1.6 + v * 2.1).toFixed(1)}" fill="${color}" opacity="${(0.16 + v * 0.3).toFixed(2)}"/>`;
  }
  return out;
}

function wrapSvg(els: El[], main: string, alt: string, fingerprint: string, tint: string): string {
  // 注意：定位 transform 放外层 <g>，生长动画放内层 <g>。
  // 因为 CSS 的 transform 会**覆盖** SVG 的 transform 属性，
  // 写在同一个元素上会让所有元素塌回原点。
  const body = els
    .map((e, i) => {
      const t = `translate(${e.x.toFixed(1)},${e.y.toFixed(1)})` + (e.rot ? ` rotate(${e.rot.toFixed(1)})` : "");
      return `<g transform="${t}"><g class="art-el" style="--d:${i * 32}ms">${e.svg}</g></g>`;
    })
    .join("");

  // 背景：纸感米白 radial（中心略提亮）+ 极淡半调网点（halftone），
  // 呼应美工封面里的纸张 + 点阵质感。art-bg / art-dots 的 id 会在联系表里被
  // 按格子重命名，避免 8 张图互相污染。
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<radialGradient id="art-bg" cx="50%" cy="46%" r="72%">
<stop offset="0%" stop-color="${tint}" stop-opacity="0.22"/>
<stop offset="38%" stop-color="#fffdf6" stop-opacity="1"/>
<stop offset="100%" stop-color="${PAPER}" stop-opacity="1"/>
</radialGradient>
<pattern id="art-dots" width="26" height="26" patternUnits="userSpaceOnUse">
<circle cx="4" cy="4" r="2" fill="${INK}" opacity="0.06"/>
</pattern>
</defs>
<rect width="${W}" height="${H}" fill="url(#art-bg)"/>
<rect width="${W}" height="${H}" fill="url(#art-dots)"/>
<g>${body}</g>
<circle cx="${W / 2}" cy="${H / 2}" r="${(W * 0.44).toFixed(1)}" stroke="${alt}" stroke-width="1.4" fill="none" opacity="0.13" stroke-dasharray="2 12"/>
<g transform="translate(${(W - PAD - 105).toFixed(1)},${(H - 52).toFixed(1)})" opacity="0.9">${fingerprintMark(fingerprint, INK)}</g>
</svg>`;
}
