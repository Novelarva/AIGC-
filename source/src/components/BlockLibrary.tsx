import { useState, type MouseEvent } from "react";
import type { BlockDef } from "../types";
import { BLOCKS_BY_CATEGORY, CATEGORY_META } from "../data/blocks";
import { engine } from "../audio/AudioEngine";
import { nextInstanceId, useBlocksStore } from "../store";

function Dots({ pattern }: { pattern: number[] }) {
  return (
    <div className="pattern-dots">
      {pattern.map((v, i) => (
        <span key={i}>{v ? "●" : "·"}</span>
      ))}
    </div>
  );
}

function WaveIcon() {
  const heights = [4, 9, 13, 7, 12, 5, 10, 6];
  return (
    <div className="wave-icon">
      {heights.map((h, i) => (
        <span key={i} style={{ height: h }} />
      ))}
    </div>
  );
}

function LibraryCard({ def }: { def: BlockDef }) {
  const setDragPayload = useBlocksStore((s) => s.setDragPayload);
  const dragPayload = useBlocksStore((s) => s.dragPayload);
  const setPlaced = useBlocksStore((s) => s.setPlaced);
  const currentPage = useBlocksStore((s) => s.page);
  const [previewing, setPreviewing] = useState(false);

  const draggingThis = dragPayload?.kind === "new" && dragPayload.blockId === def.id;

  const addToCanvas = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const current = useBlocksStore.getState().placed;
    const preferredLane = def.category === "rhythm" ? 2 : 0;
    const laneOrder = [preferredLane, ...[0, 1, 2].filter((lane) => lane !== preferredLane)];
    const lane = laneOrder.find((candidate) =>
      current.filter((item) => item.page === currentPage && item.lane === candidate).length < 8,
    );
    if (lane === undefined) return;
    const occupied = new Set(current.filter((item) => item.page === currentPage && item.lane === lane).map((item) => item.col));
    const col = Array.from({ length: 8 }, (_, index) => index).find((candidate) => !occupied.has(candidate));
    if (col === undefined) return;
    setPlaced((previous) => [...previous, { instanceId: nextInstanceId(), blockId: def.id, lane, col, page: currentPage }]);
    engine.blip("add");
  };

  // 节奏 / 音色积木整张用美工贴图（hat 的文件名是 hihat.png）；变化积木没有贴图，保留原字形
  const hasSticker = def.category !== "modifier";
  const stickerSrc = hasSticker
    ? `/stickers/${def.id === "hat" ? "hihat" : def.id}.png`
    : null;

  return (
    <div
      className={`lib-card ${def.category} ${hasSticker ? "has-sticker" : ""} ${
        draggingThis ? "dragging-src" : ""
      }`}
      draggable
      title={`${def.name} · ${def.description}（拖到画布 / 点击试听）`}
      onDragStart={(e) => {
        setDragPayload({ kind: "new", blockId: def.id, category: def.category });
        e.dataTransfer.setData("text/plain", def.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => setDragPayload(null)}
      onClick={() => {
        setPreviewing(true);
        engine.audition(def);
        window.setTimeout(() => setPreviewing(false), 350);
      }}
      style={
        previewing
          ? { boxShadow: `4px 5px 0 ${def.color}`, transform: "translateY(-3px) rotate(-1.2deg)" }
          : undefined
      }
    >
      {hasSticker ? (
        <>
          <img className="icon-sticker" src={stickerSrc ?? undefined} alt={def.name} draggable={false} />
          <button className="lib-add" type="button" aria-label={`${def.name} add to canvas`} title={`Add ${def.name} to canvas`} onClick={addToCanvas}>+</button>
        </>
      ) : (
        <>
          <div className="icon" style={{ color: def.color }}>
            {def.icon}
          </div>
          <button className="lib-add" type="button" aria-label={`${def.name} add to canvas`} title={`Add ${def.name} to canvas`} onClick={addToCanvas}>+</button>
          <div className="name">{def.name}</div>
          <div className="en">{def.en}</div>
          {def.pattern && <Dots pattern={def.pattern} />}
          {def.category === "sound" && <WaveIcon />}
        </>
      )}
    </div>
  );
}

export function BlockLibrary() {
  return (
    <aside className="library">
      {/* 左上角原封不动贴上封面里的 BLOCKS + No Notes 贴图 */}
      <img
        className="brand-sticker"
        src="/cover/logo-blocks.png"
        alt="BLOCKS · No Notes. Just Blocks. 把音乐拆成可以玩的积木"
      />
      {BLOCKS_BY_CATEGORY.map(({ category, blocks }, i) => (
        <section className="lib-section" key={category}>
          <div className="sec-head">
            <span className="sec-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="sec-title">{CATEGORY_META[category].title}</span>
            <span className="sec-sub">{CATEGORY_META[category].subtitle}</span>
          </div>
          <div className="lib-grid">
            {blocks.map((b) => (
              <LibraryCard key={b.id} def={b} />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
