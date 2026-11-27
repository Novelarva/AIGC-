const STEPS = [
  { n: "01", label: "拖动积木" },
  { n: "02", label: "拼接组合" },
  { n: "03", label: "播放音乐" },
  { n: "04", label: "调整积木" },
  { n: "05", label: "创造你的音乐" },
];

export function TutorialBar() {
  return (
    <div className="tutorial-bar">
      <div className="steps">
        {STEPS.map((s) => (
          <div className="tut-step" key={s.n}>
            <span className="num">{s.n}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="motto">简单的操作，创造无限可能。</div>
    </div>
  );
}
