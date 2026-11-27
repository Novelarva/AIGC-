import { useEffect, useRef } from "react";

interface Props {
  /** 按任意键 / 点击后触发（在用户手势里，才能起音乐） */
  onEnter: () => void;
  /** 转场中：播放收束动画，并停止接受输入 */
  leaving: boolean;
}

/**
 * 封面 / Splash（首屏）。
 *
 * 视觉严格对齐美工设计稿 `UI-Handoff/reference/cover-reference.png`：
 *   纯品牌蓝底 + BLOCK MUSIC（Anton）+ MUSIC MADE BY PIECE.（黄）+ Desktop
 * 按 README 要求用 HTML/CSS 重建，而不是贴那张参考图 —— 这样文字是矢量清晰的，
 * 也才能在右下角加那行忽闪的「点击任意按键进入」。
 */
export function Cover({ onEnter, leaving }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (leaving) return;
    firedRef.current = false;
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onEnter();
    };
    const onKey = (e: KeyboardEvent) => {
      // 别被 F5 / F12 / Ctrl+R 之类抢走
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["F5", "F11", "F12", "Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      fire();
    };
    const onPointer = () => fire();

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onEnter, leaving]);

  return (
    <div className="stage-wrap">
      <div className={`stage stage--cover`}>
        <div className={`cover ${leaving ? "cover--leaving" : ""}`}>
        <div className="cover-inner">
          <h1 className="cover-title">Block Music</h1>
          <p className="cover-tagline">Music Made By Piece.</p>
          <p className="cover-version">Desktop</p>
          <p className="cover-prompt">点击任意按键进入</p>
        </div>
      </div>
      </div>
    </div>
  );
}
