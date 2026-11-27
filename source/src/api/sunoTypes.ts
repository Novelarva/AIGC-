/**
 * 音乐扩展（ACE-Step 1.5）功能的类型定义。
 * 前端与 ACE-Step 1.5 REST API 之间就靠这几个结构通信，详见 SUNO_EXTENSION_CONTRACT.md。
 */

/** 任务状态机：提交 → 排队 → 合成中 → 完成 / 失败 */
export type ExtensionJobStatus = "queued" | "processing" | "done" | "failed";

/** 前端发起一次扩展所需的全部材料 */
export interface ExtensionRequest {
  /** 作品名（同时也是扩展曲的默认曲名） */
  title: string;
  /** 给 ACE-Step 的提示词（由曲绘分析里的「情绪标签 + 结构指纹」自动拼出来） */
  prompt: string;
  /** 统计出来的标签（同样来自曲绘分析），作为提示词的补充维度 */
  tags: string[];
  /** 玩家做好的音乐，渲染成的参考音频（WAV Blob） */
  referenceAudio: Blob;
  /** 期望扩展出的目标时长（秒），仅供参考 */
  durationSec?: number;
  /** 当前曲子的 BPM（固定 100），作为提示词补充 */
  bpm?: number;
}

/** 后端返回的单个任务状态 */
export interface ExtensionResult {
  jobId: string;
  status: ExtensionJobStatus;
  /** 进度 0~1，给进度条用 */
  progress: number;
  /** 人类可读的阶段描述，如「ACE-Step 合成中」 */
  stage?: string;
  /** 完成后才有：扩展好的完整曲子地址（由 ACE-Step 服务托管） */
  audioUrl?: string;
  /** 完成后才有：实际时长（秒） */
  durationSec?: number;
  /** 完成后才有：曲名 */
  title?: string;
  /** 完成后可能有：后端回写的标签（缺省时前端用请求里的 tags 兜底） */
  tags?: string[];
  /** 失败时有：错误原因 */
  error?: string;
}

/** 挂到音乐墙的一条曲目 */
export interface MusicWallTrack {
  audioUrl: string;
  title: string;
  tags: string[];
  /** 作者昵称（演示模式写「玩家」） */
  author?: string;
  /** 来源标记，方便音乐墙区分普通上传与 ACE-Step 扩展 */
  source: "ace-extension";
  /** 曲绘指纹（FP-xxxxxxxx），让音乐墙卡片能复用同一张曲绘 */
  coverFingerprint?: string;
  /** 曲绘种子，音乐墙可据此复现同一张图 */
  coverSeed?: number;
  /** 实际时长（秒），音乐墙卡片「时长」展示用 */
  durationSec?: number;
  /**
   * 曲绘 SVG 字符串（来自 src/art/generate.ts 的 generateArtwork）。
   * 音乐墙据此直接渲染成封面（data URI），保证「曲↔图」一致——
   * 不依赖任何后端，也不需要音乐墙重新跑曲绘生成器。
   */
  artworkSvg?: string;
}

/** 音乐墙返回的新增曲目 id */
export interface MusicWallPublishResult {
  id: string;
}
