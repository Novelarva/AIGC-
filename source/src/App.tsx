import { useCallback, useEffect, useState } from "react";
import "./pages/pages.css";
import { Cover } from "./pages/Cover";
import { Home } from "./pages/Home";
import { CreationStudio } from "./pages/CreationStudio";
import { SectionFrame } from "./pages/SectionFrame";
import { playShutter } from "./audio/sfx";
import { useBgm } from "./audio/bgm";

/**
 * 视图路由（刻意做得很薄）。
 *
 *   cover（封面/首屏）→ 按任意键（快门声 + 闪白）→ home（首页）
 *   home 的「创作」卡 → create（创作界面，即原来那个 App 主体）
 *   home 的「音乐墙」/「社区」卡 → musicwall / community（队友各自独立的栏目，iframe 加载）
 *   create / 栏目的「返回首页」→ home
 *
 * 之所以不用 react-router：只有几个状态、没有 URL 需求，
 * 一个 useState 就够，也免得给原项目引入路由依赖。
 * 关键收益是**同一个页面内切换**——背景音乐不会断、也没有白屏重载。
 */
type View = "cover" | "home" | "create" | "musicwall" | "community";

/** 允许用 ?view=home|create|musicwall|community 直接落到某一页（方便调试与深链，默认仍从封面进） */
function initialView(): View {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "home" || v === "create" || v === "musicwall" || v === "community") return v;
  } catch {
    /* 忽略：无 URL API 时就老老实实从封面开始 */
  }
  return "cover";
}

export default function App() {
  const [view, setView] = useState<View>(initialView);
  const [leaving, setLeaving] = useState(false);
  const [flash, setFlash] = useState(false);

  const startBgm = useBgm((s) => s.start);
  const suspendBgm = useBgm((s) => s.suspend);
  const restoreBgm = useBgm((s) => s.restore);

  /** 封面 → 首页（必须在用户手势的调用栈里，才能出声 / 起音乐） */
  const enterHome = useCallback(() => {
    if (leaving) return;
    playShutter();
    startBgm();
    setLeaving(true);
    setFlash(true);
    // 一次性转场，不需要清理：封面随后就卸载了
    window.setTimeout(() => setView("home"), 250);
    window.setTimeout(() => setFlash(false), 660);
    window.setTimeout(() => setLeaving(false), 720);
  }, [leaving, startBgm]);

  /** 首页 → 创作界面：先把首页 BGM 停掉，免得和创作界面的合成器糊在一起 */
  const goCreate = useCallback(() => {
    suspendBgm();
    setView("create");
  }, [suspendBgm]);

  /** 首页 → 队友的栏目（音乐墙 / 社区）：同样先停掉首页 BGM，用 iframe 跳转加载 */
  const openSection = useCallback(
    (v: "musicwall" | "community") => {
      suspendBgm();
      setView(v);
    },
    [suspendBgm],
  );

  /** 创作界面 / 栏目 → 首页：接回刚才的背景音乐 */
  const backHome = useCallback(() => {
    setView("home");
    restoreBgm();
  }, [restoreBgm]);

  // 视图切到创作界面时，顺手把首页浮层状态收掉
  useEffect(() => {
    if (view !== "create") return;
    useBgm.getState().setPanelOpen(false);
  }, [view]);

  /** 接收栏目 iframe（社区 / 音乐墙）发来的「打开创作台」跳转请求，切到创作界面而不刷新 */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && (e.data as { type?: string }).type === "mb:go-create") goCreate();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [goCreate]);

  return (
    <>
      {view === "cover" && <Cover onEnter={enterHome} leaving={leaving} />}
      {view === "home" && <Home onCreate={goCreate} onOpenSection={openSection} />}
      {view === "create" && <CreationStudio onBackToHome={backHome} />}
      {view === "musicwall" && (
        <SectionFrame src="/sections/music-wall/index.html" title="音乐墙" onBack={backHome} />
      )}
      {view === "community" && (
        <SectionFrame src="/sections/community/index.html" title="社区" onBack={backHome} />
      )}
      {flash && <div className="shutter-flash shutter-flash--on" />}
    </>
  );
}
