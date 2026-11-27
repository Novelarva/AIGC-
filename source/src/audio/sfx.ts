/**
 * 相机快门「咔嚓」音效 —— 纯 Web Audio 实时合成，不依赖任何音频文件。
 *
 * 真实单反快门是两声：先反光板抬起（"咔"），约 50ms 后帘幕闭合（"嚓"）。
 * 每一声都由两部分组成：
 *   1. 金属撞击的瞬态 —— 极短的白噪声 + 带通滤波
 *   2. 机身的低频闷响 —— 快速衰减的正弦
 * 两声之间留一点时间差，听起来才像机械动作而不是电子提示音。
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** 一声「咔」：噪声瞬态 + 低频闷响 */
function click(
  ac: AudioContext,
  at: number,
  opts: { noiseGain: number; thumpGain: number; thumpFreq: number; len: number },
) {
  // —— 噪声瞬态 ——
  const n = Math.max(1, Math.floor(ac.sampleRate * opts.len));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i += 1) {
    // 指数衰减的白噪声：开头很硬，尾巴很快收干净
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;

  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2600;
  bp.Q.value = 0.9;

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;

  const g = ac.createGain();
  g.gain.value = opts.noiseGain;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(ac.destination);
  src.start(at);

  // —— 机身闷响 ——
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(opts.thumpFreq, at);
  osc.frequency.exponentialRampToValueAtTime(opts.thumpFreq * 0.5, at + 0.05);

  const og = ac.createGain();
  og.gain.setValueAtTime(0, at);
  og.gain.linearRampToValueAtTime(opts.thumpGain, at + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);

  osc.connect(og);
  og.connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.12);
}

/** 播放快门声。用户手势里调用（浏览器自动播放策略要求）。 */
export function playShutter(): void {
  const ac = getCtx();
  if (!ac) return;
  // 手势里创建/恢复上下文
  if (ac.state === "suspended") void ac.resume();
  const t0 = ac.currentTime + 0.005;
  click(ac, t0, { noiseGain: 0.5, thumpGain: 0.18, thumpFreq: 190, len: 0.03 });       // 咔
  click(ac, t0 + 0.055, { noiseGain: 0.34, thumpGain: 0.1, thumpFreq: 150, len: 0.024 }); // 嚓
}
