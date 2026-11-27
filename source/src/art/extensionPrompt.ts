/**
 * 把「曲绘分析（情绪标签 + 结构指纹）」翻译成给 Suno 的提示词与标签。
 *
 * 这就是用户说的「统计过了的标签当提示词」：
 *   情绪标签（用了什么积木）→ 决定曲子的性格（punchy / deep / bright…）
 *   结构指纹（密度 / 音区重心 / 长度）→ 决定编排的浓淡与取向
 *   这些全部来自 analyze() 已经算好的 ArtworkInput，不另起炉灶。
 */
import type { ArtworkInput } from "./analyze";
import { topMoods } from "./analyze";
import { MOOD_MAP, type MoodId } from "./tags";

/** 情绪 → 给 Suno 的风格形容词（英文，Suno 更吃英文 prompt） */
const MOOD_STYLE: Record<MoodId, string> = {
  pulse: "punchy and driving",
  deep: "deep and atmospheric",
  lucid: "bright and clean",
  flow: "smooth and flowing",
  frenzy: "energetic and restless",
  retro: "nostalgic and warm",
};

export interface ExtensionPrompt {
  /** 给 Suno 的完整自然语言提示词 */
  prompt: string;
  /** 结构化标签（也随请求一起发，作为 prompt 的补充维度） */
  tags: string[];
  /** 玩家用到的积木数量（统计用，也在预览里展示） */
  blockCount: number;
  /** 玩家曲子激活的情绪层数（统计用，也在预览里展示） */
  moodLayers: number;
}

export function buildExtensionPrompt(
  input: ArtworkInput,
  opts: { durationSec: number; bpm?: number },
): ExtensionPrompt {
  // 占比最高的两个情绪，作为主要性格
  const top = topMoods(input.moods, 2).map((m) => m.id);
  const moodStyles = top.map((id) => MOOD_STYLE[id]);
  const moodNames = top.map((id) => MOOD_MAP[id].name);

  const density = input.struct.density;
  const densityDesc =
    density > 0.45 ? "dense and layered" : density > 0.22 ? "balanced" : "sparse and airy";

  const registerDesc =
    input.struct.register > 0.66
      ? "rhythm-forward"
      : input.struct.register < 0.33
        ? "melody-forward"
        : "evenly balanced";

  const styleText = moodStyles[0] ?? "expressive";
  const twist = moodStyles[1] ? ` with a ${moodStyles[1]} twist` : "";
  const moodZh = moodNames.length ? `（${moodNames.join("·")}）` : "";

  // —— 统计积木标签：玩家实际用了几块、激活了几层情绪 ——
  const blockCount = input.blockIds.length;
  const moodLayers = Object.values(input.moods).filter((v) => v > 0).length;
  const blockZh = blockCount > 0 ? `（由玩家用 ${blockCount} 块积木搭出、含 ${moodLayers} 层情绪）` : "";

  const prompt =
    `A ${styleText}${twist} electronic track${moodZh}, ${densityDesc} and ${registerDesc}${blockZh}. ` +
    `The attached reference clip is the player's own loop — lock onto its exact groove, mood, ` +
    `instrumentation and key, do NOT change style. ` +
    `Extend it into a complete, radio-ready ${opts.durationSec}-second song with a natural ` +
    `intro → verse → build → chorus → bridge → outro, full stereo mix, and a seamless loop point. ` +
    `Keep ${opts.bpm ?? 100} BPM and the same tempo feel throughout.`;

  const tags: string[] = [
    ...top.map((id) => MOOD_MAP[id].en.toLowerCase()),
    "electronic",
    "loop",
    density > 0.45 ? "dense" : "sparse",
  ];
  if (opts.bpm) tags.push(`${opts.bpm}bpm`);

  return { prompt, tags, blockCount, moodLayers };
}
