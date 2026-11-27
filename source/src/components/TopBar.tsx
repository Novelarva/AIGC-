import { engine } from "../audio/AudioEngine";
import { useBlocksStore } from "../store";

export function TopBar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFinish,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onFinish: () => void;
}) {
  const isPlaying = useBlocksStore((s) => s.isPlaying);
  const projectName = useBlocksStore((s) => s.projectName);
  const setProjectName = useBlocksStore((s) => s.setProjectName);
  const clearPlaced = useBlocksStore((s) => s.clearPlaced);
  const placed = useBlocksStore((s) => s.placed);

  const toggle = async () => {
    await engine.togglePlay(); // 播放状态由 engine.onPlayState 统一同步到 store
  };

  return (
    <div className="topbar">
      <button className={`play-btn ${isPlaying ? "playing" : ""}`} title="播放 / 暂停" onClick={toggle}>
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <input
        className="project-name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        spellCheck={false}
        title="点击编辑你的音乐名称"
        aria-label="音乐名称"
      />
      <div className="spacer" />
      <div className="toolbar-right">
      <button
        className="icon-btn finish"
        title={placed.length ? "生成曲绘与评语" : "先在画布上放几块积木"}
        disabled={placed.length === 0}
        onClick={() => {
          if (engine.isPlaying()) engine.pause();
          onFinish();
        }}
      >
        ✦ 完成
      </button>
      <button className="icon-btn" title="撤销" disabled={!canUndo} onClick={onUndo}>
        ↶ 撤销
      </button>
      <button className="icon-btn" title="重做" disabled={!canRedo} onClick={onRedo}>
        ↷ 重做
      </button>
      <button
        className="icon-btn danger"
        title="删除全部积木"
        onClick={() => {
          clearPlaced();
          engine.blip("remove");
        }}
      >
        ✕ 清空
      </button>
      </div>
    </div>
  );
}
