import { useEffect, useRef } from "react";
import { engine } from "../audio/AudioEngine";
import { useBlocksStore } from "../store";

function WaveCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const data = engine.getWaveformValue();
      if (data) {
        const mid = height / 2;
        ctx.strokeStyle = "rgba(7,94,235,0.95)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(7,94,235,0.25)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const step = Math.max(1, Math.floor(data.length / width));
        for (let x = 0; x < width; x += 1) {
          const v = data[Math.min(data.length - 1, x * step)] ?? 0;
          const y = mid - v * mid * 0.9;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = "rgba(7,94,235,0.3)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        const t = performance.now() / 600;
        for (let x = 0; x < width; x += 2) {
          const y = height / 2 + Math.sin(x * 0.05 + t) * height * 0.15;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="wave-canvas" width={420} height={46} />;
}

export function Transport() {
  const isPlaying = useBlocksStore((s) => s.isPlaying);
  const placed = useBlocksStore((s) => s.placed);
  const activeIds = useBlocksStore((s) => s.activeIds);

  const loopOn = placed.some((p) => p.blockId === "loop");

  return (
    <div className="transport">
      <button
        className="mini-play"
        title="播放 / 暂停"
        onClick={() => {
          void engine.togglePlay();
        }}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <WaveCanvas />
      <div className="transport-status">
        <div className="ts-main">
          {isPlaying ? `${activeIds.size} 个积木正在发声` : "已暂停"}
        </div>
        {loopOn && <div className="ts-sub">LOOP ∞ · 16 步循环</div>}
      </div>
    </div>
  );
}
