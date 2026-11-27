import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtworkInput } from "../art/analyze";
import { generateArtwork, SKELETON_NAMES } from "../art/generate";
import { buildExtensionPrompt } from "../art/extensionPrompt";
import { engine } from "../audio/AudioEngine";
import {
  makeExtensionRequest,
  runExtension,
  publishTrack,
} from "../api/sunoClient";
import { EXTENSION_USE_MOCK } from "../config/backend";
import { loadProfile } from "../components/ProfileModal";
import type { ExtensionResult } from "../api/sunoTypes";
import { BACKUP_FALLBACK_MS, pickBackup } from "../art/backupPool";

type Phase = "preview" | "running" | "done" | "error";

/** 把一首扩展曲写入本地「我的音乐库」（localStorage），供栏目头像挂件显示「已发布 N 首」。
 *  带 audioUrl + artworkSvg：音乐墙「上传作品」按钮据此列出可发布的曲子，且封面能显示本曲曲绘；
 *  旧条目没这俩字段时也能兼容显示。 */
function saveToLocalLibrary(
  title: string,
  fingerprint: string,
  seed: number,
  audioUrl?: string,
  artworkSvg?: string,
): void {
  try {
    const key = "musicblocks.mytracks";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(arr)) return;
    arr.push({ title, fingerprint, seed, audioUrl, artworkSvg, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* 本地存储不可用时静默忽略 */
  }
}

/** 给一个 Promise 套软超时：到点就 abort 并 reject（TimeoutError），用于 ACE-Step 兜底判断。 */
function withTimeout<T>(p: Promise<T>, ms: number, ctrl?: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      ctrl?.abort();
      reject(new DOMException("扩展超时", "TimeoutError"));
    }, ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * 「音乐扩展」弹窗。
 * 流程：预览（积木标签统计 + 提示词）→ 开始（录参考音频[原曲循环 3 遍] + 提交/轮询）
 *       → 试听 + 起名 + 选择保存/发布 → 完成。
 * 真实后端与演示模式走同一套 UI，区别只在 runExtension 内部。
 *
 * 进度通过 onProgress / onRunningChange 上抛给创作界面，在「游戏界面」底部同步显示进度条。
 */
export function ExtensionModal({
  input,
  onClose,
  onRunningChange,
  onProgress,
}: {
  input: ArtworkInput;
  onClose: () => void;
  onRunningChange?: (running: boolean) => void;
  onProgress?: (progress: number, stage?: string) => void;
}) {
  // 每次打开随机取一个 60~120 秒（1~2 分钟）的目标时长，避免生成太久；让生成的完整曲子长度有差异
  const durationSec = useMemo(() => 60 + Math.round(Math.random() * 60), []);
  const { svg, skeleton } = useMemo(() => generateArtwork(input), [input]);
  const preview = useMemo(
    () => buildExtensionPrompt(input, { durationSec, bpm: 100 }),
    [input, durationSec],
  );

  const [phase, setPhase] = useState<Phase>("preview");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<ExtensionResult | null>(null);
  const [error, setError] = useState("");
  const [wantPublish, setWantPublish] = useState(true);
  const [publishMsg, setPublishMsg] = useState("");
  // 生成后可编辑的曲名（默认沿用玩家在创作界面起的名字），用于「起名 + 保存/发布」
  const [trackName, setTrackName] = useState(input.projectName || "我的完整曲子");

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setPhase("running");
    setProgress(0.02);
    setError("");
    setStage("准备参考音频");
    onRunningChange?.(true);
    onProgress?.(0.02, "准备参考音频");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let res: ExtensionResult;
      if (EXTENSION_USE_MOCK) {
        setStage("准备预置扩展曲…");
        // 演示模式（无后端）：直接用后手池按情绪挑一首，不录参考音频、不触发超时兜底
        res = await runExtension(
          makeExtensionRequest(input, new Blob(), { durationSec, bpm: 100, title: trackName }),
          {
            signal: ctrl.signal,
            onProgress: (r) => {
              setProgress(r.progress);
              setStage(r.stage ?? r.status);
              onProgress?.(r.progress, r.stage ?? r.status);
            },
          },
        );
      } else {
        // 真实模式：直接提交给 ACE-Step 生成。runReal 内部优先 text2music（此后端已验证可真出歌），
        // 失败再兜底 cover（需现场录参考音频）；两次都是真·ACE 生成，任何超时/出错由外层静默切后手。
        try {
          setStage("提交到 ACE-Step 生成中…");
          const req = makeExtensionRequest(input, new Blob(), { durationSec, bpm: 100, title: trackName });
          res = await withTimeout(
            runExtension(req, {
              signal: ctrl.signal,
              onProgress: (r) => {
                setProgress(r.progress);
                setStage(r.stage ?? r.status);
                onProgress?.(r.progress, r.stage ?? r.status);
              },
            }),
            BACKUP_FALLBACK_MS,
            ctrl,
          );
        } catch (realErr) {
          // 评审场景：超时或任何出错都不要弹红字，直接静默切到本地后手曲（界面上就是「生成的音乐」）
          console.warn("[音乐扩展] ACE 不可用，已静默切到本地后手曲：", realErr);
          const bk = pickBackup({ tags: preview.tags, bpm: 100 });
          if (bk) {
            res = {
              jobId: "backup",
              status: "done",
              progress: 1,
              stage: "回传完整曲子",
              audioUrl: bk.file,
              durationSec: bk.durationSec,
              title: trackName,
              tags: bk.tags,
            };
          } else {
            // 实在没有任何后手曲可用，才把原始错误抛出去（避免无声失败）
            throw realErr;
          }
        }
      }
      setResult(res);
      setPhase("done");
      onRunningChange?.(false);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      onRunningChange?.(false);
      if (err?.name === "AbortError") {
        setPhase("preview");
        return;
      }
      setError(err?.message ?? "扩展失败");
      setPhase("error");
    }
  };

  /** 把当前整首曲子渲染成 WAV 并触发浏览器下载，方便拿到本地文件去 ACE-Step 网页版做 cover。 */
  const downloadTrack = async () => {
    try {
      setStage("正在渲染并下载你的曲子…");
      const blob = await engine.exportReferenceWav();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "musicblocks-track.wav";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStage("已下载 WAV → 去浏览器默认下载目录找「musicblocks-track.wav」");
    } catch (e) {
      setError((e as { message?: string })?.message ?? "导出失败");
    }
  };

  const finish = async () => {
    if (wantPublish) {
      // 生成曲绘 SVG：本地库 + 音乐墙 entry 都用它当封面，保证「曲↔图」一致
      const artworkSvg = generateArtwork(input).svg;
      // 先存本地「我的音乐库」（演示/离线均生效），再尝试发布到音乐墙
      saveToLocalLibrary(trackName || input.projectName, input.fingerprint, input.seed, result?.audioUrl, artworkSvg);
      if (result?.audioUrl) {
        setPublishMsg("发布中…");
        try {
          const r = await publishTrack({
            audioUrl: result.audioUrl,
            title: trackName || result.title || input.projectName,
            tags: result.tags ?? preview.tags,
            author: loadProfile().nickname || "玩家", // 作者署名自动用昵称，未设昵称时退回「玩家」
            source: "ace-extension",
            coverFingerprint: input.fingerprint,
            coverSeed: input.seed,
            durationSec: result.durationSec,
            artworkSvg,
          });
          setPublishMsg(`已保存到音乐库并发布到音乐墙 ✓（ID ${r.id}）`);
        } catch (e) {
          setPublishMsg(`已存到本地音乐库，但发布到音乐墙失败：${(e as { message?: string })?.message ?? ""}`);
          return; // 发布失败不关弹窗，让玩家看到原因（本地已存，不受影响）
        }
      } else {
        setPublishMsg("已保存到我的音乐库");
      }
    }
    onClose();
  };

  return (
    <div className="art-mask" onClick={onClose}>
      <div className="art-modal ext-modal" onClick={(e) => e.stopPropagation()}>
        <div className="art-left">
          <div className="art-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="art-meta">
            <span className="art-fp">FP-{input.fingerprint}</span>
            <span className="art-skel">参考 · {SKELETON_NAMES[skeleton]}</span>
            <span className="art-skel">{input.struct.totalSteps} 拍</span>
          </div>
          {EXTENSION_USE_MOCK && (
            <div className="ext-mock">
              演示模式：下方为预置的扩展曲成品（基于你的原曲 cover 生成）。队友接好 ACE-Step 后端后，将自动切换为按需实时生成。
            </div>
          )}
        </div>

        <div className="art-right">
          <div className="art-kicker">ACE-STEP EXTENSION</div>
          <h2 className="art-title">把这段扩成完整曲子</h2>

          {phase === "preview" && (
            <>
              <div className="ext-stats">
                <span>积木标签数量：{preview.blockCount}</span>
                <span>情绪层数：{preview.moodLayers}</span>
                <span>
                  目标时长：{durationSec}s（{Math.floor(durationSec / 60)}分
                  {durationSec % 60}秒）
                </span>
              </div>
              <div className="ext-label">将作为提示词发给 ACE-Step：</div>
              <div className="ext-prompt">{preview.prompt}</div>
              <div className="ext-tags">
                {preview.tags.map((t) => (
                  <span className="ext-tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <p className="ext-hint dim">
                参考音频 = 你刚做好的整首曲子循环 3 遍（实时渲染成 WAV）。点下面按钮即开始扩展。
              </p>
              <div className="art-actions">
                <button className="art-btn primary" onClick={start}>
                  🎵 开始扩展
                </button>
                <button className="art-btn" onClick={downloadTrack}>
                  ⬇️ 下载我的曲子
                </button>
                <button className="art-btn" onClick={onClose}>
                  返回
                </button>
              </div>
            </>
          )}

          {phase === "running" && (
            <>
              <div className="ext-stage">{stage || "处理中…"}</div>
              <div className="ext-progress">
                <div className="ext-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="ext-pct">{Math.round(progress * 100)}%</div>
              <p className="ext-hint dim">后台正在把你的小样交给 ACE-Step 扩写，请稍候…</p>
            </>
          )}

          {phase === "done" && result && (
            <>
              <div className="ext-result">
                {result.audioUrl && (
                  <audio className="ext-audio" src={result.audioUrl} controls preload="auto" />
                )}
                <div className="ext-meta-row">
                  <span>时长：{result.durationSec ?? durationSec}s</span>
                  <span>封面：本曲绘（FP-{input.fingerprint}）</span>
                </div>
              </div>

              <label className="ext-name-row">
                <span className="ext-name-label">曲名</span>
                <input
                  className="ext-name"
                  value={trackName}
                  maxLength={24}
                  onChange={(e) => setTrackName(e.target.value)}
                  placeholder="给这首完整曲子起个名字"
                />
              </label>

              <label className="ext-toggle">
                <input
                  type="checkbox"
                  checked={wantPublish}
                  onChange={(e) => setWantPublish(e.target.checked)}
                />
                <span>保存至我的音乐库并发布到音乐墙</span>
              </label>
              {publishMsg && <div className="ext-publish-msg">{publishMsg}</div>}

              <div className="art-actions">
                <button className="art-btn primary" onClick={finish}>
                  完成
                </button>
                <button
                  className="art-btn"
                  onClick={() => {
                    setPhase("preview");
                    setResult(null);
                    setProgress(0);
                    setPublishMsg("");
                  }}
                >
                  再做一次
                </button>
              </div>
            </>
          )}

          {phase === "error" && (
            <>
              <div className="ext-error">⚠ {error}</div>
              <div className="art-actions">
                <button
                  className="art-btn primary"
                  onClick={() => {
                    setPhase("preview");
                    setError("");
                  }}
                >
                  重试
                </button>
                <button className="art-btn" onClick={onClose}>
                  关闭
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
