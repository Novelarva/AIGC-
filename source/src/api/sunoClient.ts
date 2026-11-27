/**
 * 音乐扩展（ACE-Step 1.5）功能的客户端。
 *
 * 设计目标：前端只认一个入口 `runExtension()`，它对 UI 完全透明——
 *   - 没配后端地址时走「演示模式」mock（用预置成品《Epic Trance Surge》当占位结果）；
 *   - 配了队友中继后端地址时走真实提交 + 等待（relay 内部连 acestep-api 并轮询）。
 *
 * 真实模式下前端**只调队友的中转后端** `{base}/api/extend`（relay_server.py），
 * 由 relay 去连同机的 ACE-Step 官方 REST API（localhost:8001）。前端绝不直连 8001
 * （跨域 + localhost 指玩家自己机器，会连错）。
 * 部署与接口细节见 src/api/deploy/DEPLOY_GUIDE.md 与同目录 SUNO_EXTENSION_CONTRACT.md。
 */
import {
  ACE_API_BASE,
  MUSICWALL_API_BASE,
  EXTENSION_USE_MOCK,
  TARGET_DURATION_SECONDS,
} from "../config/backend";
import type {
  ExtensionRequest,
  ExtensionResult,
  MusicWallTrack,
  MusicWallPublishResult,
} from "./sunoTypes";
import type { ArtworkInput } from "../art/analyze";
import { pickBackup, BACKUP_POOL } from "../art/backupPool";
import { buildExtensionPrompt } from "../art/extensionPrompt";
import { engine } from "../audio/AudioEngine";

/** 进度回调 + 可中断信号 */
export interface ExtensionHandlers {
  onProgress?: (r: ExtensionResult) => void;
  signal?: AbortSignal;
}

/** 进度条上展示的几个阶段文案 */
const STAGES = [
  "准备参考音频",
  "上传到 ACE-Step",
  "ACE-Step 合成中",
  "回传完整曲子",
];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * 把「玩家的曲绘分析 + 参考音频」整理成一次扩展请求。
 * 提示词和标签都来自 analyze() 算好的 ArtworkInput（情绪 + 结构）。
 */
export function makeExtensionRequest(
  input: ArtworkInput,
  referenceAudio: Blob,
  opts: { durationSec?: number; bpm?: number; title?: string },
): ExtensionRequest {
  const durationSec = opts.durationSec ?? TARGET_DURATION_SECONDS;
  const { prompt, tags } = buildExtensionPrompt(input, { durationSec, bpm: opts.bpm });
  return {
    title: opts.title ?? input.projectName,
    prompt,
    tags,
    referenceAudio,
    durationSec,
    bpm: opts.bpm,
  };
}

/** 统一入口：根据是否配置后端，自动选 mock 或真实实现。 */
export async function runExtension(
  req: ExtensionRequest,
  handlers: ExtensionHandlers = {},
): Promise<ExtensionResult> {
  if (EXTENSION_USE_MOCK) return runMock(req, handlers);
  return runReal(req, handlers);
}

/* ───────────────── 演示模式（无后端时） ───────────────── */

/**
 * 演示模式：没有真实后端可连，直接用「后手曲池」里按情绪挑一首当演示结果。
 * 与真实模式失败兜底走的是同一套 BACKUP_POOL（见 backupPool.ts），保证演示/兜底听感一致。
 */
async function runMock(req: ExtensionRequest, handlers: ExtensionHandlers): Promise<ExtensionResult> {
  const jobId = `mock-${Date.now()}`;
  // 按情绪挑一首后手曲当演示结果（与真实模式失败兜底同一逻辑）
  const preset = pickBackup({ tags: req.tags, bpm: req.bpm }) ?? BACKUP_POOL[0];
  const steps: ExtensionResult[] = STAGES.map((stage, i) => {
    const last = i === STAGES.length - 1;
    return {
      jobId,
      status: last ? "done" : "processing",
      progress: (i + 1) / STAGES.length,
      stage,
      // 演示模式：用预置的真实成品（基于玩家原曲 cover 生成）当结果，
      // 黑客松现场可直接试听完整扩展曲；队友接好 ACE-Step 后端后会自动切真实生成。
      audioUrl: last ? preset.file : undefined,
      durationSec: last ? preset.durationSec : req.durationSec,
      title: last ? preset.label : req.title,
      tags: req.tags,
    };
  });

  for (const s of steps) {
    if (handlers.signal?.aborted) throw new DOMException("已取消", "AbortError");
    handlers.onProgress?.(s);
    await sleep(650 + Math.random() * 450);
  }
  return steps[steps.length - 1];
}

/* ───────────────── 真实后端：队友中转 relay（/api/extend） ───────────────── */

/** 把参考音频 Blob 转 base64（前端上传给 relay，relay 解码存本地给 acestep-api） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const result = r.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** relay 返回的结构 */
interface RelayResp {
  audioUrl?: string;
  error?: string;
  taskId?: string;
}

/**
 * 修正 relay 回传的音频地址协议。
 * relay 用请求的 Host 拼 URL（`http://<host>/files/xxx.mp3`），拿到的是明文 http。
 * 而部署版游戏跑在 https 上 → https 页面加载 http 音频会触发浏览器「混合内容」拦截。
 * 实测（无头 Edge + CDP，宿主=线上 https 页）：原始 http 地址加载直接失败（readyState=0），
 * 升级成 https 后正常（loadedmetadata，时长正确）。故不能依赖"浏览器会自动升级"。
 * 队友的 Tailscale Funnel 同一路径 https 可用，因此页面是 https 时把 http 升级为 https，
 * 从源头消除混合内容问题（音乐墙存的 audioUrl 也走同一入口，一并修好）。
 */
function normalizeAudioUrl(url: string): string {
  if (
    typeof location !== "undefined" &&
    location.protocol === "https:" &&
    url.startsWith("http://")
  ) {
    return "https://" + url.slice("http://".length);
  }
  return url;
}

/**
 * 真实后端提交。策略（2026-09-12 实测确认）：
 *   队友这个 ACE-Step 后端 /api/extend 的 cover 模式在 acestep-api 侧会 400（relay 的 smoke_test
 *   只测了 text2music，cover 从未跑通），而 text2music 已实测可真出歌（~46s 返回合法 mp3）。
 *   因此主路径走 text2music（不需要参考音频、零录音开销），若它失败再兜底 cover（现场录原曲当参考）。
 *   两次都是「真·ACE-Step 生成」；只有当两次都失败/超时，调用方 ExtensionModal 才会静默切本地后手曲。
 */
async function runReal(req: ExtensionRequest, handlers: ExtensionHandlers): Promise<ExtensionResult> {
  /** 发一次 /api/extend，成功返回 RelayResp，失败抛错（带 relay 返回的错误信息） */
  const postExtend = async (payload: Record<string, unknown>): Promise<RelayResp> => {
    const inner = new AbortController();
    const soft = window.setTimeout(() => inner.abort(), 280_000); // 次级保险，主超时由 handlers.signal 裁决
    try {
      const resp = await fetch(`${ACE_API_BASE}/api/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: handlers.signal ?? inner.signal,
      });
      if (!resp.ok) {
        let msg = `提交失败（${resp.status}）`;
        try {
          const d = (await resp.json()) as RelayResp;
          if (d.error) msg = d.error;
        } catch {
          /* 解析失败就用状态码兜底 */
        }
        throw new Error(msg);
      }
      const data = (await resp.json()) as RelayResp;
      if (!data.audioUrl) throw new Error(data.error || "未返回音频地址");
      data.audioUrl = normalizeAudioUrl(data.audioUrl);
      return data;
    } finally {
      window.clearTimeout(soft);
    }
  };

  const tick = window.setInterval(() => {
    handlers.onProgress?.({ jobId: "", status: "processing", progress: 0.55, stage: "ACE-Step 合成中" });
  }, 3000);

  try {
    handlers.onProgress?.({ jobId: "", status: "queued", progress: 0.1, stage: "上传到 ACE-Step" });

    // 主路径：text2music（此后端已验证可真出歌，且不需要参考音频）
    let data: RelayResp;
    try {
      data = await postExtend({
        prompt: req.prompt,
        tags: req.tags,
        duration: req.durationSec ?? TARGET_DURATION_SECONDS,
        taskType: "text2music",
        bpm: req.bpm,
      });
    } catch (t2mErr) {
      // 兜底：cover（用玩家原曲当参考），需现场录参考音频
      console.warn("[音乐扩展] text2music 失败，改 cover 重试：", t2mErr);
      const audioB64 = await blobToBase64(
        req.referenceAudio && req.referenceAudio.size > 0 ? req.referenceAudio : await engine.exportReferenceWav(3),
      );
      data = await postExtend({
        prompt: req.prompt,
        tags: req.tags,
        duration: req.durationSec ?? TARGET_DURATION_SECONDS,
        taskType: "cover",
        audioB64,
        bpm: req.bpm,
      });
    }

    return {
      jobId: data.taskId ?? "relay",
      status: "done",
      progress: 1,
      stage: "回传完整曲子",
      audioUrl: data.audioUrl,
      durationSec: req.durationSec,
      title: req.title,
      tags: req.tags,
    };
  } finally {
    window.clearInterval(tick);
  }
}

/* ───────────────── 挂到音乐墙（同源 localStorage 桥） ───────────────── */
//
// 音乐墙是 public/sections/music-wall/index.html 这个静态页（iframe 同源加载），
// 没有独立后端。主游戏和音乐墙同源（都在 127.0.0.1:8124），共享 localStorage，
// 所以用 localStorage 当桥：publishTrack 把扩展曲写进 musicblocks.wall-tracks，
// 音乐墙启动时读这个 key 合并到作品列表 + 用 <audio> 播真实音频。
// 这样既不依赖任何后端，也保证评审时本地就能看到/听到发布的曲子。
//
export async function publishTrack(track: MusicWallTrack): Promise<MusicWallPublishResult> {
  if (EXTENSION_USE_MOCK) await sleep(450);
  const id = `ext-${Date.now()}`;
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const entry = {
    id,
    title: track.title,
    author: track.author || "玩家",
    audioUrl: track.audioUrl,
    tags: track.tags,
    source: track.source,
    coverFingerprint: track.coverFingerprint,
    coverSeed: track.coverSeed,
    artworkSvg: track.artworkSvg,
    duration: track.durationSec ?? 90,
    status: "published" as const,
    createdAt: iso,
    updatedAt: iso,
    ts: now.getTime(),
  };
  try {
    const KEY = "musicblocks.wall-tracks";
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(arr)) {
      // 去重：同 audioUrl 视为重新发布，覆盖旧的
      const dedup = arr.filter(
        (x: { audioUrl?: string }) => x.audioUrl !== track.audioUrl,
      );
      dedup.unshift(entry);
      localStorage.setItem(KEY, JSON.stringify(dedup));
    }
  } catch {
    /* localStorage 不可用时静默：本地音乐库仍可用 */
  }
  return { id };
}
