import { useEffect, useRef, useState } from "react";
import { BlockLibrary } from "../components/BlockLibrary";
import { MusicCanvas } from "../components/MusicCanvas";
import { TopBar } from "../components/TopBar";
import { Transport } from "../components/Transport";
import { CombinationPanel } from "../components/CombinationPanel";
import { TutorialBar } from "../components/TutorialBar";
import { ArtworkModal } from "../components/ArtworkModal";
import { ExtensionModal } from "../components/ExtensionModal";
import { analyze } from "../art/analyze";
import { engine } from "../audio/AudioEngine";
import { useBlocksStore } from "../store";
import { COMBINATIONS } from "../data/combinations";
import type { PlacedBlock } from "../types";

function comboKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

interface Props {
  /** 返回首页 */
  onBackToHome: () => void;
}

/**
 * 创作界面（原来的 App 主体）。
 *
 * 这里只做了一处外壳改动：加一个「返回首页」浮钮（复用 .section-frame__back，
 * 与音乐墙/社区栏目一致的左上角浮钮样式）。
 * 内部的积木库 / 画布 / 组合面板 / 走带 / 曲绘 全部保持原样，没有被动过。
 */
export function CreationStudio({ onBackToHome }: Props) {
  const placed = useBlocksStore((s) => s.placed);
  const discovered = useBlocksStore((s) => s.discovered);
  const justDiscovered = useBlocksStore((s) => s.justDiscovered);

  const [past, setPast] = useState<PlacedBlock[][]>([]);
  const [future, setFuture] = useState<PlacedBlock[][]>([]);
  const prevJson = useRef("[]");
  const bannerTimer = useRef<number | null>(null);
  const [artInput, setArtInput] = useState<ReturnType<typeof analyze> | null>(null);
  const [extInput, setExtInput] = useState<ReturnType<typeof analyze> | null>(null);
  // 扩展进行中：在「游戏界面」底部同步显示进度条（与 ExtensionModal 内部的进度互为镜像）
  const [extRunning, setExtRunning] = useState(false);
  const [extProgress, setExtProgress] = useState(0);
  const [extStage, setExtStage] = useState("");

  // —— AudioEngine 数据同步（数据 / UI 分离，Audio 不知道 React）——
  useEffect(() => {
    engine.setBlocks(placed);
    engine.setModifiers({
      loop: placed.some((p) => p.blockId === "loop"),
      reverse: placed.some((p) => p.blockId === "reverse"),
      echo: placed.some((p) => p.blockId === "echo"),
      random: placed.some((p) => p.blockId === "random"),
    });
  }, [placed]);

  // 每步回调 → 发光动画 / 活跃积木集合；播放状态同步到 store
  useEffect(() => {
    engine.onStep((e) => {
      const s = useBlocksStore.getState();
      useBlocksStore.setState({ activeIds: new Set(e.active) });
      // 多页时间轴：播到哪一页就把画布翻到哪一页。
      // 正在拖东西时不翻，免得刚放下的积木"跑掉"。
      if (s.isPlaying && !s.dragPayload && s.page !== e.page) {
        useBlocksStore.setState({ page: e.page });
      }
    });
    engine.onPlayState((p) => {
      useBlocksStore.setState({ isPlaying: p });
    });
    return () => {
      engine.onStep(null);
      engine.onPlayState(null);
    };
  }, []);

  // —— Undo / Redo（极简历史栈）——
  useEffect(() => {
    const json = JSON.stringify(placed);
    if (json === prevJson.current) return;
    const prev = JSON.parse(prevJson.current) as PlacedBlock[];
    setPast((p) => [...p.slice(-49), prev]);
    setFuture([]);
    prevJson.current = json;
  }, [placed]);

  const undo = () => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      const rest = p.slice(0, -1);
      setFuture((f) => [...f, placed]);
      prevJson.current = JSON.stringify(prev);
      useBlocksStore.setState({ placed: prev });
      return rest;
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[f.length - 1];
      const rest = f.slice(0, -1);
      setPast((p) => [...p, placed]);
      prevJson.current = JSON.stringify(next);
      useBlocksStore.setState({ placed: next });
      return rest;
    });
  };

  // —— 组合发现 ——
  useEffect(() => {
    const ids = new Set(placed.map((p) => p.blockId));
    for (const c of COMBINATIONS) {
      const key = comboKey(c.a, c.b);
      if (ids.has(c.a) && ids.has(c.b) && !discovered.has(key)) {
        useBlocksStore.setState({
          discovered: new Set([...useBlocksStore.getState().discovered, key]),
          justDiscovered: c.result,
        });
        if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
        bannerTimer.current = window.setTimeout(() => {
          useBlocksStore.setState({ justDiscovered: null });
        }, 2600);
      }
    }
  }, [placed, discovered]);

  return (
    <div className="app">
      <BlockLibrary />
      <div className="center" style={{ position: "relative" }}>
        <TopBar
          onUndo={undo}
          onRedo={redo}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onFinish={() => setArtInput(analyze(placed, useBlocksStore.getState().projectName))}
        />
        <MusicCanvas />
        {/* 封面同款贴纸：右上角 GOOD MUSIC BETTER DAYS（贴在顶栏留白处，不压画布积木） */}
        <img className="deco deco-goodmusic" src="/cover/goodmusic.png" alt="" aria-hidden />
        {justDiscovered && (
          <div className="discover-banner">
            ✦ {justDiscovered.toUpperCase()} · NEW SOUND DISCOVERED ✦
          </div>
        )}
        <Transport />
        <TutorialBar />
      </div>
      <CombinationPanel />
      {artInput && (
        <ArtworkModal
          input={artInput}
          onClose={() => setArtInput(null)}
          onExtend={(i) => {
            // 点「扩展成完整音乐」：先收掉曲绘弹窗，再打开扩展流程
            setArtInput(null);
            setExtInput(i);
          }}
        />
      )}
      {extInput && (
        <ExtensionModal
          input={extInput}
          onClose={() => {
            setExtInput(null);
            setExtRunning(false);
            setExtProgress(0);
            setExtStage("");
          }}
          onRunningChange={setExtRunning}
          onProgress={(p, s) => {
            setExtProgress(p);
            if (s) setExtStage(s);
          }}
        />
      )}

      {/* 游戏界面底部「扩展中」进度条（与扩展弹窗里的进度同步） */}
      {extRunning && (
        <div className="ext-gamebar" role="status" aria-live="polite">
          <div className="ext-gamebar-label">🎧 扩展中 · {extStage || "处理中…"}</div>
          <div className="ext-gamebar-track">
            <div
              className="ext-gamebar-fill"
              style={{ width: `${Math.round(extProgress * 100)}%` }}
            />
          </div>
          <div className="ext-gamebar-pct">{Math.round(extProgress * 100)}%</div>
        </div>
      )}

      {/* 返回首页：复用与音乐墙/社区栏目一致的左上角浮钮样式，三块界面统一 */}
      <button type="button" className="section-frame__back" onClick={onBackToHome}>
        ← 返回首页
      </button>
    </div>
  );
}
