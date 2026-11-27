/**
 * 本地「后手音乐」池（按情绪分组）。
 *
 * 用途：真实 ACE-Step（队友 relay）生成音乐时，如果超过 BACKUP_FALLBACK_MS 还没回传
 * （断网 / relay 挂了 / 生成太慢 / 接口报错），就从这里挑一首「情绪最像」的本地曲顶上，
 * 界面上和真生成的结果一模一样（不另加「备用」标识，明面上就是「生成的音乐」）。
 *
 * 分组规则（按玩家曲子的主导情绪自动选组，互不串台）：
 *   - 躁动 / 脉动（pulse / frenzy）→ pulse 组
 *   - 澄澈 / 涌动（lucid / flow）  → lucid 组
 *   - 深邃 / 回溯（deep / retro）   → deep 组（待用户稍后补充两首，见下方 TODO）
 *
 * 怎么加更多后手曲：
 *   1) 把 mp3 丢进 public/audio/backup/（建议按风格命名，如 ace-backup-deep-1.mp3）
 *   2) 在下面 BACKUP_POOL 里加一条：file 指向该文件，moods 填对的情绪组，
 *      tags 尽量和 buildExtensionPrompt 产出的标签同构（pulse/lucid/electronic/loop/100bpm…）。
 *
 * 注意：仅在真实 ACE-Step 超时/失败时才被顶上，演示模式（无后端）也走本池按情绪挑一首。
 */
export interface BackupTrack {
  /** 相对 public 的路径，例如 /audio/backup/xxx.mp3（构建时原样拷贝，可直接当 audioUrl） */
  file: string;
  /** 中文备注，仅日志/调试用，界面不展示 */
  label: string;
  /** 与 buildExtensionPrompt 产出的 tags 同构，用于相似度匹配 */
  tags: string[];
  /** 情绪组（pulse/lucid/deep…），匹配权重最高，决定「归到哪一组」 */
  moods: string[];
  bpm: number;
  /** 真实时长（秒），用于结果页「时长」展示，请照实填 */
  durationSec: number;
  /** 当初发给 ACE-Step 的提示词（存档，便于以后对照，不影响匹配） */
  prompt: string;
}

/**
 * 真实 ACE-Step 超过这么久（毫秒）没回传音乐，就启用本地后手曲顶上。
 * 取值思路：在「一般能生成出来的用时」基础上再加一点余量——
 * ACE-Step text2music 实测约 45 秒出歌，cover 一首常 1~2 分钟，
 * 这里给到 2 分钟：既不会让测试干等太久，也留足生成余量避免误杀正常生成。
 * （用户 2026-09-13 反馈 5 分钟等太久，调回 2 分钟。可按网络/机器情况调大调小。）
 */
export const BACKUP_FALLBACK_MS = 120_000;

export const BACKUP_POOL: BackupTrack[] = [
  /* ───────────── 澄澈 / 涌动 组（lucid / flow）—— 之前加的两首后手 ─────────────
   * 注：早期曾误把 WebAudio 离线渲染的 17s loop（backup-cleanglow-100bpm.mp3）塞进本组，
   * 用户 2026-09-13 反馈"混入了一个 17 秒的难听玩意"，已移除。 */
  {
    file: "/audio/epic_trance_surge.mp3",
    label: "澄澈·涌动（Epic Trance Surge，原 175s 已剪到 93.8s 落在乐句收束点 + 0.4s fade-out）",
    tags: ["lucid", "flow", "bright", "epic", "electronic", "loop", "dense", "100bpm"],
    moods: ["lucid", "flow"],
    bpm: 100,
    durationSec: 94,
    prompt: "Epic Trance Surge —— 基于玩家原曲 cover 生成的完整扩展曲（澄澈·涌动），已剪到约 94s。",
  },
  {
    file: "/audio/ace_backup_2.mp3",
    label: "澄澈·涌动（ACE-Step 生成 · 后手曲之一，90s）",
    tags: ["lucid", "flow", "smooth", "electronic", "loop", "dense", "100bpm"],
    moods: ["lucid", "flow"],
    bpm: 100,
    durationSec: 90,
    prompt: "ACE-Step 生成的后手曲之一（澄澈·涌动），90s。",
  },

  /* ───────────── 躁动 / 脉动 组（pulse / frenzy）—— 本次新增两首 ───────────── */
  {
    file: "/audio/backup/ace-backup-pulse-1.mp3",
    label: "躁动·脉动（pulse / frenzy，90s）",
    tags: ["pulse", "frenzy", "punchy", "driving", "electronic", "loop", "dense", "100bpm"],
    moods: ["pulse", "frenzy"],
    bpm: 100,
    durationSec: 90,
    prompt: "pulse / frenzy backup track #1（躁动·脉动），90s。",
  },
  {
    file: "/audio/backup/ace-backup-pulse-2.mp3",
    label: "躁动·脉动（pulse / frenzy，90s）",
    tags: ["pulse", "frenzy", "punchy", "driving", "electronic", "loop", "dense", "100bpm"],
    moods: ["pulse", "frenzy"],
    bpm: 100,
    durationSec: 90,
    prompt: "pulse / frenzy backup track #2（躁动·脉动），90s。",
  },

  /* ───────────── 深邃 / 回溯 组（deep / retro）—— 两首 S3 后手（用户 2026-09-13 提供） ───────────── */
  {
    file: "/audio/backup/ace-backup-deep-1.mp3",
    label: "深邃·回溯（deep / retro，94s S3 #1）",
    tags: ["deep", "retro", "atmospheric", "nostalgic", "ambient", "electronic", "loop", "dense", "100bpm"],
    moods: ["deep", "retro"],
    bpm: 100,
    durationSec: 94,
    prompt:
      "A deep and atmospheric with a nostalgic and retro twist electronic track（深邃·回溯 S3 #1）, ambient and flowing. Extend into a complete radio-ready song, keep 100 BPM.",
  },
  {
    file: "/audio/backup/ace-backup-deep-2.mp3",
    label: "深邃·回溯（deep / retro，90s S3 #2）",
    tags: ["deep", "retro", "atmospheric", "nostalgic", "ambient", "electronic", "loop", "dense", "100bpm"],
    moods: ["deep", "retro"],
    bpm: 100,
    durationSec: 90,
    prompt:
      "A deep and atmospheric with a nostalgic and retro twist electronic track（深邃·回溯 S3 #2）, ambient and flowing. Extend into a complete radio-ready song, keep 100 BPM.",
  },
];

/**
 * 从后手池里挑一首和当前扩展提示词「情绪最像」的；返回 null 表示没有可用后手。
 * 匹配逻辑：情绪组（moods）权重最高（命中 +4），其它标签（electronic/loop/bpm…）弱匹配（+1），
 * 这样「躁动/脉动曲」只会命中 pulse 组、「澄澈/涌动曲」只会命中 lucid 组，互不串台。
 */
export function pickBackup(input: { tags?: string[]; moods?: string[]; bpm?: number }): BackupTrack | null {
  if (BACKUP_POOL.length === 0) return null;

  const want = new Set(
    [...(input.tags ?? []), ...(input.moods ?? [])].map((t) => String(t).toLowerCase()),
  );
  const wantBpm = input.bpm ?? 100;

  const scoreOf = (t: BackupTrack): number => {
    let s = 0;
    // 情绪组权重最高：把请求里的情绪词（如 pulse/lucid）与后手的 moods 比对
    for (const m of t.moods) if (want.has(m.toLowerCase())) s += 4;
    // 其它标签弱匹配（electronic/loop/dense/100bpm…）
    for (const tag of t.tags) if (want.has(tag.toLowerCase())) s += 1;
    const diff = Math.abs((t.bpm ?? 100) - wantBpm);
    if (diff <= 6) s += 1;
    return s;
  };

  let best = -1;
  let cands: BackupTrack[] = [];
  for (const t of BACKUP_POOL) {
    const sc = scoreOf(t);
    if (sc > best) {
      best = sc;
      cands = [t];
    } else if (sc === best) {
      cands.push(t);
    }
  }
  // 同分时随机挑一首，避免每次都同一首
  return cands[Math.floor(Math.random() * cands.length)] ?? null;
}
