import { useEffect, useRef, useState, type DragEvent } from "react";
import { LANES, MAX_PAGES, STEPS } from "../types";
import type { PlacedBlock } from "../types";
import { BLOCK_MAP } from "../data/blocks";
import { COMBO_MAP, comboKeyForIds } from "../data/combinations";
import { engine } from "../audio/AudioEngine";
import { useBlocksStore, nextInstanceId } from "../store";

const LABEL_W = 110;
const STRIP_H = 22; // 列头数字区
const CATEGORY_LABEL: Record<string, string> = { rhythm: "GATE", sound: "PLAY", modifier: "FX" };

function cellCenter(i: { col: number; lane: number }, w: number, laneH: number) {
  const colW = w / STEPS;
  return {
    x: i.col * colW + colW / 2,
    y: STRIP_H + i.lane * laneH + laneH / 2,
  };
}

/** 在目标 lane 的**当前页**里找空位：优先 desiredCol，否则向右（可环绕）。满则 -1 */
function findFreeCol(
  placed: PlacedBlock[],
  page: number,
  lane: number,
  desiredCol: number,
  excludeId?: string,
): number {
  const occupied = new Set(
    placed
      .filter((p) => p.page === page && p.lane === lane && p.instanceId !== excludeId)
      .map((p) => p.col),
  );
  for (let k = 0; k < STEPS; k += 1) {
    const col = (desiredCol + k) % STEPS;
    if (!occupied.has(col)) return col;
  }
  return -1;
}

function PlacedChip({
  item,
  w,
  laneH,
  activeHit,
}: {
  item: PlacedBlock;
  w: number;
  laneH: number;
  activeHit: boolean;
}) {
  const def = BLOCK_MAP[item.blockId];
  const setPlaced = useBlocksStore((s) => s.setPlaced);
  const setDragPayload = useBlocksStore((s) => s.setDragPayload);
  const [clicked, setClicked] = useState(false);
  const [ripples, setRipples] = useState<number[]>([]);
  const rippleSeq = useRef(0);

  const colW = w / STEPS;
  const col = Math.min(Math.max(item.col, 0), STEPS - 1);
  const lane = Math.min(Math.max(item.lane, 0), LANES.length - 1);
  const bw = Math.max(30, colW - 12);
  const bh = Math.max(30, laneH - 16);

  const remove = () => {
    setPlaced((prev) => prev.filter((p) => p.instanceId !== item.instanceId));
    engine.blip("remove");
  };

  const playPreview = () => {
    setClicked(true);
    setRipples((r) => [...r.slice(-3), rippleSeq.current++]);
    window.setTimeout(() => setClicked(false), 320);
    engine.audition(def);
  };

  return (
    <div
      className={`placed-block ${activeHit ? "active-hit" : ""} ${clicked ? "clicked" : ""}`}
      draggable
      style={{
        left: 6 + col * colW,
        top: STRIP_H + 5 + lane * laneH,
        width: bw,
        height: bh,
        background: `linear-gradient(150deg, ${def.color}26, #ffffff 70%)`,
        border: `2px solid ${def.color}`,
        color: def.color,
        boxShadow:
          activeHit || clicked
            ? `0 0 0 3px ${def.color}44, 4px 4px 0 ${def.color}`
            : `3px 3px 0 ${def.color}66`,
      }}
      title={`${def.name} · ${def.description}\n点击试听 · 拖动移动 · 双击 / 右键 / 拖出画布删除`}
      onContextMenu={(e) => {
        e.preventDefault();
        remove();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        remove();
      }}
      onClick={playPreview}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.instanceId);
        setDragPayload({ kind: "placed", instanceId: item.instanceId, blockId: item.blockId });
      }}
      onDragEnd={(e) => {
        setDragPayload(null);
        if (e.dataTransfer.dropEffect === "none") {
          remove();
        }
      }}
    >
      <div className="pb-icon">{def.icon}</div>
      <div className="pb-name">{def.name}</div>
      <div className="pb-tag" style={{ color: def.color, opacity: 0.75 }}>
        {CATEGORY_LABEL[def.category]}
      </div>
      {ripples.map((k) => (
        <span key={k} className="ripple" style={{ color: def.color }} />
      ))}
    </div>
  );
}

export function MusicCanvas() {
  const placed = useBlocksStore((s) => s.placed);
  const setPlaced = useBlocksStore((s) => s.setPlaced);
  const dragPayload = useBlocksStore((s) => s.dragPayload);
  const setDragPayload = useBlocksStore((s) => s.setDragPayload);
  const activeIds = useBlocksStore((s) => s.activeIds);
  const isPlaying = useBlocksStore((s) => s.isPlaying);
  const page = useBlocksStore((s) => s.page);
  const setPage = useBlocksStore((s) => s.setPage);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 700, h: 380 });
  const [draggingOver, setDraggingOver] = useState(false);
  const [canvasMessage, setCanvasMessage] = useState("");

  /** 画布上真正有积木的页数（用于页码标记 / 是否允许往回翻） */
  const usedPages = placed.length ? Math.max(...placed.map((p) => p.page + 1)) : 1;
  /** 当前可翻到的总页数（用户可能已经翻到了一个还空着的页） */
  const totalPages = Math.max(usedPages, page + 1);
  /** 本页上的积木。画布一次只显示一页，其余页的内容照样在曲子里发声。 */
  const pageItems = placed.filter((p) => p.page === page);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect0 = el.getBoundingClientRect();
    if (rect0.width > 0) setSize({ w: rect0.width, h: rect0.height });
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colW = size.w / STEPS;
  const laneH = Math.max(60, (size.h - STRIP_H) / LANES.length);

  const dropAt = (laneF: number, desiredCol: number) => {
    // 读取最新 store 状态，避免事件闭包中的旧 dragPayload / placed
    const payload = useBlocksStore.getState().dragPayload;
    const currentPlaced = useBlocksStore.getState().placed;
    const curPage = useBlocksStore.getState().page;
    if (!payload) return;
    const c = Math.max(0, Math.min(STEPS - 1, Math.round(desiredCol)));
    const l = Math.max(0, Math.min(LANES.length - 1, Math.round(laneF)));
    if (payload.kind === "new") {
      const col = findFreeCol(currentPlaced, curPage, l, c);
      if (col === -1) {
        setCanvasMessage("\u8fd9\u6761\u8f68\u9053\u5df2\u653e\u6ee1\uff0c\u8bf7\u6362\u4e00\u6761\u8f68\u9053\u6216\u5176\u4ed6\u5c0f\u8282\u3002");
        window.setTimeout(() => setCanvasMessage(""), 2400);
        setDragPayload(null);
        return;
      }
      const item: PlacedBlock = {
        instanceId: nextInstanceId(),
        blockId: payload.blockId,
        lane: l,
        col,
        page: curPage,
      };
      setPlaced((prev) => [...prev, item]);
      engine.blip("add");
    } else {
      const item = currentPlaced.find((p) => p.instanceId === payload.instanceId);
      if (!item) return;
      const occupied = currentPlaced.some(
        (p) =>
          p.instanceId !== item.instanceId && p.page === curPage && p.lane === l && p.col === c,
      );
      if (!occupied) {
        // 拖到哪一页就归哪一页 —— 跨页搬运靠左右翻页完成
        setPlaced((prev) =>
          prev.map((p) =>
            p.instanceId === item.instanceId ? { ...p, lane: l, col: c, page: curPage } : p,
          ),
        );
        engine.blip("add");
      } else {
        setCanvasMessage("\u8fd9\u4e2a\u4f4d\u7f6e\u5df2\u6709\u79ef\u6728\uff0c\u8bf7\u8bd5\u8bd5\u76f8\u90bb\u7a7a\u683c\u3002");
        window.setTimeout(() => setCanvasMessage(""), 2400);
      }
    }
    setDragPayload(null);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
    if (!useBlocksStore.getState().dragPayload || !surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top - STRIP_H;
    dropAt(Math.floor(y / laneH), x / colW);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const payload = useBlocksStore.getState().dragPayload;
    if (!payload) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = payload.kind === "placed" ? "move" : "copy";
  };

  // 播放头 rAF：整首曲子跨多页走，但画布只显示一页，
  // 所以只把「落在当前页里的那一段」画出来，走到别页时先隐藏。
  // 注意：loop 修饰符让整首走两遍（第二遍升八度），但判定线每遍都该在当前页内扫一遍，
  // 而不是扫到虚拟的「第二页」——所以这里用单遍 span（pages*STEPS），不用 engine.totalSteps()
  // （后者在 loop 下是 2 倍，会把第二遍映射到越界页导致判定线整遍消失）。
  const playheadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const line = playheadRef.current;
    const reverseOn = placed.some((p) => p.blockId === "reverse");
    let raf = 0;
    const draw = () => {
      if (line) {
        const pageSpan = Math.max(1, engine.pages() * STEPS); // 单遍步数（loop 下也只走一遍的步数）
        const spanSec = pageSpan * engine.stepSeconds();
        if (isPlaying && spanSec > 0) {
          const raw = engine.transportSeconds();
          const pos = ((raw % spanSec) + spanSec) % spanSec;
          const t = reverseOn ? 1 - pos / spanSec : pos / spanSec;
          // 整体进度 → 落在第几页 + 页内进度
          const g = Math.min(pageSpan - 1e-6, Math.max(0, t * pageSpan));
          const phPage = Math.floor(g / STEPS);
          const local = g / STEPS - phPage;
          if (phPage === page) {
            line.style.opacity = "1";
            line.style.left = `${LABEL_W + Math.max(0, Math.min(1, local)) * size.w}px`;
          } else {
            line.style.opacity = "0";
          }
        } else {
          line.style.opacity = "0.2";
          line.style.left = `${LABEL_W}px`;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, size.w, placed, page]);

  // 组合连接线：只连「真正能拼出结果」的一对，和右侧面板的当前组合一致。
  // （早先是按分类交叉连，12 块就能拉出三四十条线，把画面糊成一张网。）
  // 只在当前页内连线 —— 跨页的积木画不出线，硬连会穿出画面。
  const links: [number, number, number, number, string][] = [];
  for (let i = 0; i < pageItems.length; i += 1) {
    for (let j = i + 1; j < pageItems.length; j += 1) {
      const a = pageItems[i];
      const b = pageItems[j];
      if (a.blockId === b.blockId) continue;
      const da = BLOCK_MAP[a.blockId];
      if (!da) continue;
      if (!COMBO_MAP.has(comboKeyForIds(a.blockId, b.blockId))) continue;
      const c1 = cellCenter(a, size.w, laneH);
      const c2 = cellCenter(b, size.w, laneH);
      links.push([c1.x, c1.y, c2.x, c2.y, da.color]);
    }
  }

  return (
    <div
      className={`canvas-wrap ${page > 0 ? "has-prev" : ""}`}
      style={{ flex: 1, minHeight: 300 }}
    >
      <div className={`canvas-grid ${draggingOver ? "drag-over" : ""}`}>
        {canvasMessage && <div className="canvas-message" role="status">{canvasMessage}</div>}
        <div className="lane-labels">
          {LANES.map((lane) => (
            <div className="lane-label" key={lane.id} style={{ paddingTop: STRIP_H }}>
              {lane.label}
            </div>
          ))}
        </div>

        <div
          ref={surfaceRef}
          className="drop-zone"
          onDragOver={onDragOver}
          onDragEnter={(e) => {
            e.preventDefault();
            if (dragPayload) setDraggingOver(true);
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={onDrop}
        >
          {/* 列头数字：接着上一页往下数（第 2 页是 9..16） */}
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: 5,
                left: i * colW + colW / 2,
                transform: "translateX(-50%)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                color: "rgba(11,27,58,.34)",
                pointerEvents: "none",
              }}
            >
              {page * STEPS + i + 1}
            </div>
          ))}
          {/* 行分隔线 */}
          <div style={{ position: "absolute", left: 0, right: 0, top: STRIP_H, height: 1, background: "rgba(11,27,58,.13)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: STRIP_H + laneH, height: 1, background: "rgba(11,27,58,.13)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: STRIP_H + laneH * 2, height: 1, background: "rgba(11,27,58,.13)", pointerEvents: "none" }} />
          {/* 4/4 拍线：每 2 步 = 1 拍，在拍与拍之间画一条稍重的竖线 */}
          {Array.from({ length: STEPS / 2 - 1 }, (_, b) => (
            <div
              key={`beat-${b}`}
              style={{
                position: "absolute",
                left: (b + 1) * 2 * colW,
                top: STRIP_H,
                bottom: 0,
                width: 1,
                background: "rgba(11,27,58,.22)",
                pointerEvents: "none",
              }}
            />
          ))}

          {pageItems.map((p) => (
            <PlacedChip
              key={p.instanceId}
              item={p}
              w={size.w}
              laneH={laneH}
              activeHit={activeIds.has(p.instanceId)}
            />
          ))}

          <svg className="link-layer" width={size.w} height={size.h}>
            {links.map(([x1, y1, x2, y2, color], k) => {
              // 端点往回缩一点，别从积木正中心起笔（否则短连线被积木盖死看不见）
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const d = Math.min(22, len / 2 - 6);
              const ux = dx / len;
              const uy = dy / len;
              const ax1 = x1 + ux * d;
              const ay1 = y1 + uy * d;
              const ax2 = x2 - ux * d;
              const ay2 = y2 - uy * d;
              return (
                <g key={k}>
                  <line className="halo" x1={ax1} y1={ay1} x2={ax2} y2={ay2} />
                  <line
                    className="wire"
                    x1={ax1}
                    y1={ay1}
                    x2={ax2}
                    y2={ay2}
                    stroke={color}
                    strokeOpacity={0.9}
                  />
                </g>
              );
            })}
          </svg>

          {pageItems.length === 0 && (
            <div className="empty-hint">
              <div className="big">← 从左边拖一块积木进来</div>
              <div className="small">
                {page > 0
                  ? `第 ${page + 1} 页 · ${page * STEPS + 1}–${(page + 1) * STEPS} 拍，这一页还空着`
                  : "把积木放到任意格子 · 判定线扫到它就响一次 · Rhythm 与 Sound 搭一起会有新发现"}
              </div>
            </div>
          )}
        </div>

        {/* 播放线（覆盖整行，含标签列） */}
        <div ref={playheadRef} className="playline" style={{ left: LABEL_W }} />

        {/* 页码标记：贴在这一页左上角（Lane 标签列的列头上缘，本来就是空的） */}
        <div
          className="page-badge"
          title={`时间轴第 ${page + 1} 页 · ${page * STEPS + 1}–${(page + 1) * STEPS} 拍`}
        >
          P{page + 1}
          {totalPages > 1 && <span className="of">/{totalPages}</span>}
        </div>
      </div>

      {/* 翻页：小蓝圆圈 + 白箭头，钉在画布边框的中间 */}
      {page > 0 && (
        <button
          className="page-btn prev"
          title="上一页时间轴"
          aria-label="上一页时间轴"
          onClick={() => setPage(page - 1)}
        >
          <span className="arw" />
        </button>
      )}
      {page < MAX_PAGES - 1 && (
        <button
          className="page-btn next"
          title={`下一页时间轴（继续往后写 · 第 ${page * STEPS + STEPS + 1}–${page * STEPS + STEPS * 2} 拍）`}
          aria-label="下一页时间轴"
          onClick={() => setPage(page + 1)}
        >
          <span className="arw" />
        </button>
      )}
    </div>
  );
}
