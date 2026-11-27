import { useEffect, useMemo, useRef } from "react";
import type { ArtworkInput } from "../art/analyze";
import { critique } from "../art/critique";
import { generateArtwork, SKELETON_NAMES } from "../art/generate";
import { MOODS } from "../art/tags";

function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

function exportPng(svgEl: SVGSVGElement, name: string) {
  const str = new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 2000;
    c.height = 2000;
    const ctx = c.getContext("2d");
    if (ctx) ctx.drawImage(img, 0, 0, 1200, 1200);
    c.toBlob((b) => {
      if (b) download(URL.createObjectURL(b), `${name}.png`);
    });
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

export function ArtworkModal({
  input,
  onClose,
  onExtend,
}: {
  input: ArtworkInput;
  onClose: () => void;
  onExtend?: (input: ArtworkInput) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  const { svg, skeleton } = useMemo(() => generateArtwork(input), [input]);
  const words = useMemo(() => critique(input), [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bars = MOODS.map((m) => ({ ...m, v: input.moods[m.id] })).sort((a, b) => b.v - a.v);

  return (
    <div className="art-mask" onClick={onClose}>
      <div className="art-modal" onClick={(e) => e.stopPropagation()}>
        <div className="art-left">
          <div className="art-canvas" ref={boxRef} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="art-meta">
            <span className="art-fp">FP-{input.fingerprint}</span>
            <span className="art-skel">构图 · {SKELETON_NAMES[skeleton]}</span>
            {input.struct.pageCount > 1 && (
              <span className="art-skel">
                长度 · {input.struct.pageCount} 页 / {input.struct.totalSteps} 拍
              </span>
            )}
          </div>
        </div>

        <div className="art-right">
          <div className="art-kicker">ARTWORK GENERATED</div>
          <h2 className="art-title">{words.title}</h2>
          <div className="art-keys">{words.keywords}</div>

          <div className="art-lines">
            <p>{words.verdict}</p>
            <p className="dim">{words.texture}</p>
            <p className="dim">{words.closing}</p>
          </div>

          <div className="art-compo">
            <div className="compo-head">作品成分</div>
            {bars
              .filter((b) => b.v > 0.001)
              .map((b) => (
                <div className="compo-row" key={b.id}>
                  <span className="compo-name">{b.name}</span>
                  <span className="compo-track">
                    <i style={{ width: `${(b.v * 100).toFixed(1)}%`, background: b.color }} />
                  </span>
                </div>
              ))}
          </div>

          <div className="art-actions">
            <button
              className="art-btn primary"
              onClick={() => {
                const el = boxRef.current?.querySelector("svg");
                if (el) exportPng(el, `${input.projectName}-${input.fingerprint}`);
              }}
            >
              导出 PNG
            </button>
            <button
              className="art-btn"
              onClick={() => {
                const el = boxRef.current?.querySelector("svg");
                if (el) {
                  const str = new XMLSerializer().serializeToString(el);
                  download(
                    URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" })),
                    `${input.projectName}-${input.fingerprint}.svg`,
                  );
                }
              }}
            >
              导出 SVG
            </button>
            <button className="art-btn" onClick={onClose}>
              继续编辑
            </button>
          </div>

          {onExtend && (
            <div className="art-extend-cta">
              <div className="art-extend-divider" />
              <button className="art-btn extend-full" onClick={() => onExtend(input)}>
                🎵 扩展成完整音乐
              </button>
              <p className="dim art-extend-note">
                用这段曲绘当封面，把你的小样循环 3 遍作参考，交给 AI 扩成 1~2 分钟的完整曲子。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
