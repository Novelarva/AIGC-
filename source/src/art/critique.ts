import type { ArtworkInput } from "./analyze";
import { topMoods } from "./analyze";
import { makeRng, type Rng } from "./rng";
import { MOOD_MAP, type MoodId } from "./tags";

/**
 * 作品评语。
 *
 * 铁律：文案里**不许出现任何数字和统计依据**。
 * 玩家要的是一句能记住的话，不是一份体检报告 ——
 * "热情占比 0.35"这种东西一旦写进去，magic 就没了。
 */

export interface Critique {
  /** 4 字作品名 */
  title: string;
  /** 主情绪总评 */
  verdict: string;
  /** 织体形态（来自结构指纹，也就是"摆在什么位置"） */
  texture: string;
  /** 收尾 */
  closing: string;
  /** 两个气质关键词 */
  keywords: string;
}

const VERDICT: Record<MoodId, string[]> = {
  pulse: [
    "这首曲子有一副停不下来的心跳，像深夜里还亮着的那盏灯。",
    "节拍一下一下砸在胸口，你不由得跟着它加快脚步。",
    "它的能量是直给的，第一秒就把人拽进现场。",
  ],
  deep: [
    "低频压在最底下，像潮水漫过脚踝，回头才发现已经很深。",
    "它不急着表现，声音沉在下面，越听越往下走。",
    "底下有一层很厚的东西，一直托着整首曲子。",
  ],
  lucid: [
    "声音干净得能看见光，像雨刚停时的那扇窗。",
    "每一个音都站得很清楚，不抢、不糊、不拖泥带水。",
    "像把一颗石子丢进很浅很清的水里，涟漪都数得清。",
  ],
  flow: [
    "它一直在往前走，没有一处是停住的。",
    "声音像水一样推着你走，你猜不到下一句要拐去哪。",
    "整首曲子是一条从头到尾没有断过的线。",
  ],
  frenzy: [
    "细节多到抓不住，像一场没有预告的烟火。",
    "它在动，一直在动，而且每一遍都不太一样。",
    "碎、快、亮，带着一点不讲道理的兴奋。",
  ],
  retro: [
    "声音后面拖着尾巴，像在跟过去的自己说话。",
    "它总是慢半拍回头，把刚才说过的再讲一遍。",
    "有回声的地方，时间就变厚了。",
  ],
};

const ECHO: Record<MoodId, string[]> = {
  pulse: ["听完很久，耳朵里还留着它走路的声音。", "像旁边有人一直在轻轻敲桌子，你才发现自己也在跟着数。"],
  deep: ["适合关掉灯，一个人听到最后。", "留白比声音多，可那点留白里全是内容。"],
  lucid: ["听着它，脑子会慢慢安静下来。", "亮而不刺，是那种可以盯很久的光。"],
  flow: ["适合看着窗外，任它自己流过去。", "你按下播放，它就自己走完了全程。"],
  frenzy: ["适合在很困的下午硬撑着听完。", "它不太听话，可正因如此才有意思。"],
  retro: ["像一台老机器，还在认认真真地工作。", "你听到的是现在，它回答的是刚才。"],
};

const TITLE_A: Record<MoodId, string[]> = {
  pulse: ["心跳", "脉冲", "鼓点", "节拍"],
  deep: ["深海", "暗涌", "沉底", "夜色"],
  lucid: ["微光", "星尘", "澄澈", "薄冰"],
  flow: ["潮汐", "长河", "流动", "风声"],
  frenzy: ["烟火", "碎光", "疾走", "热风"],
  retro: ["回声", "倒带", "旧梦", "余温"],
};

function densityLine(s: number, rng: Rng): string {
  if (s > 0.6) return rng.pick(["画面塞得很满，几乎没留喘气的缝", "每一格都被填上了，热闹得挤"]);
  if (s < 0.25) return rng.pick(["它留了很多空，空得让人想往里填点什么", "落笔很省，省到有点倔"]);
  return rng.pick(["疏密刚好，有内容也有呼吸", "该密的地方密，该空的地方空"]);
}

function centroidLine(s: number, rng: Rng): string {
  if (s < 0.38) return rng.pick(["起手就很笃定，开头先把话说完", "力气都使在前半段，一上来就是高潮"]);
  if (s > 0.62) return rng.pick(["重心压在后半段，越听越有后劲", "慢慢铺，到最后才把牌翻开"]);
  return rng.pick(["前后匀着走，不抢也不拖", "从头到尾一个速度，很稳"]);
}

function symmetryLine(s: number, rng: Rng): string {
  if (s > 0.78) return rng.pick(["首尾呼应得很好，像绕一圈又回到原处", "它是对称的，站得很正"]);
  if (s < 0.35) return rng.pick(["一路向前，从不回头看", "每一步都不重复上一步"]);
  return rng.pick(["大体平衡，局部有点歪，反倒生动", "左右大致照应，但不死板"]);
}

function spreadLine(s: number, rng: Rng): string {
  if (s < 0.3) return rng.pick(["所有东西都挤在一处，力气往一个点上使", "聚成一团，像攥紧的拳头"]);
  if (s > 0.7) return rng.pick(["摊得很开，每个角落都有声音", "铺满了整个画面，没有中心"]);
  return rng.pick(["聚散有致，有焦点也有延伸", "中间紧两边松，收得住"]);
}

/**
 * 节奏地形句 —— 说的是「哪几拍挤、哪几拍空」。
 * 这是曲绘第二版才引入画面的维度（重拍凸出、空拍留白），评语得跟上，
 * 否则玩家看着图上明显的疏密，评语却只字不提。
 */
function terrainLine(st: ArtworkInput["struct"], rng: Rng): string {
  const maxOcc = Math.max(...st.occupancy, 0);
  if (maxOcc === 0) {
    return rng.pick([
      "现在还是空的，等你往里放下第一块。",
      "什么都还没有，但也正因为什么都还没有，才什么都放得下。",
    ]);
  }
  const denseCols = st.occupancy.filter((c) => c >= Math.max(2, maxOcc)).length;
  // 阈值随总拍数缩放：时间轴能翻页了，16 拍里空 4 拍不算"一半空着"
  const total = st.occupancy.length;
  if (st.rests.length >= Math.max(3, Math.round(total / 2))) {
    return rng.pick([
      "一半的拍子空着，可正是那些空处，让响的地方显得响。",
      "它很敢留白，安静的部分和热闹的部分一样重要。",
    ]);
  }
  if (denseCols >= Math.max(3, Math.round(total * 0.25))) {
    return rng.pick(["好几拍同时站满了，热闹是一起发生的。", "拍子挨着拍子，几乎没有喘气的地方。"]);
  }
  if (st.rests.length === 0) {
    return rng.pick(["每一拍都有人站着，一个都没落下。", "从头到尾没有间断，它是连成一条线的。"]);
  }
  return rng.pick(["有的拍子挤，有的拍子松，像呼吸。", "轻重是分开的，不是一个平调子。"]);
}

export function critique(input: ArtworkInput): Critique {
  const rng = makeRng(input.seed ^ 0x9e3779b9);
  const top = topMoods(input.moods, 2);
  const primary = top[0]?.id ?? "pulse";
  const secondary = top[1]?.id ?? primary;

  // 结构句：从五个维度里抽两个说，避免又长又空
  const pool = [
    densityLine(input.struct.density, rng),
    centroidLine(input.struct.centroid, rng),
    symmetryLine(input.struct.symmetry, rng),
    spreadLine(input.struct.spread, rng),
    terrainLine(input.struct, rng),
  ];
  const picked = rng.int(0, pool.length - 1);
  let second = rng.int(0, pool.length - 1);
  if (second === picked) second = (second + 1) % pool.length;
  const texture = `${pool[picked]}，${pool[second]}。`;

  const a = rng.pick(TITLE_A[primary]);
  const b = secondary === primary ? "独白" : rng.pick(TITLE_A[secondary]);

  return {
    title: `${a}${b}`,
    verdict: rng.pick(VERDICT[primary]),
    texture,
    closing: rng.pick(secondary === primary ? ECHO[primary] : ECHO[secondary]),
    keywords: secondary === primary
      ? MOOD_MAP[primary].name
      : `${MOOD_MAP[primary].name} · ${MOOD_MAP[secondary].name}`,
  };
}
