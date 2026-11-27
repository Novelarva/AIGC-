import { COMBINATIONS } from "../data/combinations";
import { BLOCK_MAP } from "../data/blocks";
import { engine } from "../audio/AudioEngine";
import { useBlocksStore } from "../store";
import { presentBlockIds, findActiveCombos } from "../audio/CombinationEngine";

function blockColor(id: string): string {
  return BLOCK_MAP[id]?.color ?? "#8fb3ff";
}

export function CombinationPanel() {
  const placed = useBlocksStore((s) => s.placed);
  const isPlaying = useBlocksStore((s) => s.isPlaying);
  const activeCombos = findActiveCombos(placed);
  const ids = presentBlockIds(placed);
  const discovered = useBlocksStore((s) => s.discovered);

  const activeKeys = new Set(activeCombos.map((ac) => [ac.aName, ac.bName].sort().join("+")));

  // 音色预览：动画只用 CSS 类，数据从 analyser 实时驱动，这里给一个心跳渲染即可
  void engine;

  return (
    <aside className="side-panel">
      <div className="panel-card">
        <h3>🎛 当前组合 Current Mix</h3>
        {placed.length === 0 && <div className="panel-empty">还没有积木——从左侧拖一块进来吧。</div>}
        {activeCombos.length === 0 && placed.length > 0 && (
          <div className="panel-empty">再看看……也许 Rhythm + Sound 会产生魔法。</div>
        )}
        {activeCombos.map(({ aName, bName, combo }) => (
          <div className="combo-item" key={`${aName}+${bName}`}>
            <span style={{ color: blockColor(aName) }}>{BLOCK_MAP[aName]?.name}</span>
            <span className="eq">+</span>
            <span style={{ color: blockColor(bName) }}>{BLOCK_MAP[bName]?.name}</span>
            <span className="result">
              {combo.emoji} {combo.result}
            </span>
          </div>
        ))}
      </div>

      <div className="panel-card">
        <h3>音色预览</h3>
        <div className={`preview-orb ${isPlaying ? "playing" : ""}`}>
          <div className="orb-core" />
          {[
            { l: "18%", t: "30%", d: "0s" },
            { l: "72%", t: "22%", d: "0.6s" },
            { l: "30%", t: "76%", d: "1.1s" },
            { l: "78%", t: "72%", d: "0.3s" },
            { l: "50%", t: "12%", d: "1.5s" },
          ].map((p, i) => (
            <span
              key={i}
              className="particle"
              style={{ left: p.l, top: p.t, animationDelay: p.d }}
            />
          ))}
        </div>
      </div>

      <div className="panel-card">
        <h3>🔭 探索更多组合 Discover</h3>
        {COMBINATIONS.map((c) => {
          const key = [c.a, c.b].sort().join("+");
          const has = ids.has(c.a) && ids.has(c.b);
          const isActive = activeKeys.has(key);
          return (
            <div className="combo-item" key={key}>
              <span style={{ color: blockColor(c.a) }}>{BLOCK_MAP[c.a]?.name}</span>
              <span className="eq">+</span>
              <span style={{ color: blockColor(c.b) }}>{BLOCK_MAP[c.b]?.name}</span>
              <span className={`result ${has && !isActive ? "" : "unknown"}`}>
                {discovered.has(key) || has ? `${c.emoji} ${c.result}` : "???"}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
