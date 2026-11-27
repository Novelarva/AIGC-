/**
 * AudioEngine —— 基于 Tone.js 的积木调度引擎。
 *
 * 语义：
 *   - 画布 = 8 步（= 4 拍，4/4）× 3 条 Lane 的网格；Transport 每隔一个 8 分音符触发一次 tick。
 *   - 时间轴可以有多页（每页 8 步）。第 0 页是第 1~8 步，第 1 页是第 9~16 步……
 *     播放时按页顺序走完，整首长度 = 页数 × 8 步。
 *   - 判定线（playhead）逐列右移：扫到第 c 列时，所有落在该列的积木各触发一次发声
 *     （节奏块击打 / 音色块奏其代表音，位置越靠后可按积木自有音阶上移音高）。
 *     即「判定线动到哪块积木，哪块就响」——积木是“时间点上的发声体”，不再自带循环 pattern。
 *   - Modifier（Loop / Reverse / Echo / Random）是全局开关：
 *       Loop-开：整首长度翻倍（第二轮旋律升高八度）；
 *       Reverse-开：每轮内部的门控顺序倒放；
 *       Echo-开：每次击打追加一次半拍后的回声；
 *       Random-开：有概率产生随机 flam / 替换音。
 *
 * 与 UI 通过 setBlocks() / setModifiers() / onStep / onPlayState 通信，保持数据与 UI 分离。
 */
import * as Tone from "tone";
import type { BlockDef, PlacedBlock } from "../types";
import { STEPS } from "../types";
import { BLOCK_MAP } from "../data/blocks";
import { encodeWav } from "./wavExport";

export interface ModifierFlags {
  loop: boolean;
  reverse: boolean;
  echo: boolean;
  random: boolean;
}

interface TickEvent {
  /** 本步在总步数中的位置：0..totalSteps-1 */
  step: number;
  /** 本轮（8 步）内的位置 */
  lap: number;
  /** 当前正在发声的是第几页（0 起） */
  page: number;
  /** 总步数（页数 × 8，Loop 开启时再翻倍） */
  totalSteps: number;
  /** 本步被触发、能听到声音的实例 id */
  active: string[];
}

type StepListener = (e: TickEvent) => void;

const RANDOM_PENTA = ["C4", "D4", "E4", "G4", "A4"];

function shiftOctave(note: string, oct: number): string {
  const m = note.match(/^([A-G]#?b?)(\d)$/);
  if (!m) return note;
  const newOct = Math.min(8, Math.max(0, parseInt(m[2], 10) + oct));
  return `${m[1]}${newOct}`;
}

class AudioEngineImpl {
  private ready = false;

  private master!: Tone.Gain;
  private limiter!: Tone.Limiter;
  analyser!: Tone.Analyser;

  // —— 乐器（在首次 ensureReady 时惰性创建）——
  private kickSynth!: Tone.MembraneSynth;
  private snareNoise!: Tone.NoiseSynth;
  private hatNoise!: Tone.NoiseSynth;
  private percSynth!: Tone.MembraneSynth;
  private melodies!: Record<string, Tone.PolySynth<any>>;

  private blocks: PlacedBlock[] = [];
  private mods: ModifierFlags = { loop: false, reverse: false, echo: false, random: false };

  private count = 0;
  private repeatId: number | null = null;
  private playing = false;

  private listener: StepListener | null = null;
  private playStateListener: ((playing: boolean) => void) | null = null;

  /** 必须由用户手势触发（浏览器自动播放限制）。 */
  async ensureReady(): Promise<void> {
    await Tone.start();
    if (this.ready) return;

    this.master = new Tone.Gain(0.85);
    this.limiter = new Tone.Limiter(-1);
    this.analyser = new Tone.Analyser("waveform", 1024);
    this.master.chain(this.limiter, this.analyser, Tone.getDestination());

    // --- 节奏乐器 ---
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.07,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.01 },
      volume: 1,
    }).connect(this.master);

    const snareFilter = new Tone.Filter(1600, "highpass").connect(this.master);
    this.snareNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.01 },
      volume: -4,
    }).connect(snareFilter);

    const hatFilter = new Tone.Filter(7200, "highpass").connect(this.master);
    this.hatNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
      volume: -12,
    }).connect(hatFilter);

    this.percSynth = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 1.6,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.01 },
      volume: -6,
    }).connect(this.master);

    // --- 旋律乐器 ---
    this.melodies = {
      piano: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.004, decay: 0.42, sustain: 0.2, release: 0.28 },
        volume: -2,
      }).connect(this.master),
      bass: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.005, decay: 0.28, sustain: 0.45, release: 0.15 },
        volume: -4,
      }).connect(this.master),
      synth: new Tone.PolySynth(Tone.AMSynth as any, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.02, decay: 0.2, sustain: 0.35, release: 0.35 },
        modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.2 },
        volume: -8,
      } as any).connect(this.master),
      bell: new Tone.PolySynth(Tone.FMSynth as any, {
        harmonicity: 2,
        modulationIndex: 14,
        envelope: { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.6 },
        modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.4 },
        volume: -6,
      } as any).connect(this.master),
    };

    // 默认 BPM。界面上不提供 BPM 输入，以免变成传统 DAW。
    Tone.Transport.bpm.value = 100;
    this.ready = true;
  }

  /** 画布上实际用到的页数（至少 1）。积木摆在越靠后的页，整首曲子就越长。 */
  pages(): number {
    let n = 1;
    for (const b of this.blocks) n = Math.max(n, (b.page ?? 0) + 1);
    return n;
  }

  totalSteps(): number {
    const base = this.pages() * STEPS;
    return this.mods.loop ? base * 2 : base;
  }

  stepSeconds(): number {
    // 每步 = 八分音符
    return 60 / Tone.Transport.bpm.value / 2;
  }

  transportSeconds(): number {
    return Tone.Transport.seconds;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setBlocks(blocks: PlacedBlock[]): void {
    this.blocks = blocks.slice();
  }

  setModifiers(mods: ModifierFlags): void {
    this.mods = { ...mods };
  }

  onStep(fn: StepListener | null): void {
    this.listener = fn;
  }

  onPlayState(fn: ((playing: boolean) => void) | null): void {
    this.playStateListener = fn;
  }

  async togglePlay(): Promise<boolean> {
    await this.ensureReady();
    if (this.playing) {
      this.pause();
      return false;
    }
    this.start();
    return true;
  }

  start(): void {
    if (!this.ready || this.playing) return;
    if (this.repeatId === null) {
      this.repeatId = Tone.Transport.scheduleRepeat((time) => this.tick(time), "8n");
    }
    Tone.Transport.start("+0.02");
    this.playing = true;
    this.playStateListener?.(true);
  }

  pause(): void {
    Tone.Transport.pause();
    this.playing = false;
    this.playStateListener?.(false);
  }

  /**
   * 每 8 分音符触发一次：判定线（playhead）扫到第 c 列时，
   * 所有落在第 c 列的积木各自触发一次发声（节奏块击打 / 音色块奏其代表音）。
   * 即「判定线动到哪块积木，哪块就响」——积木是时间点上的发声体，不再自带循环 pattern。
   * reverse 时判定线反向，loop 时整首走两遍（第二遍升八度）。
   */
  private tick(time: number): void {
    const pageSpan = this.pages() * STEPS; // 走完所有页需要的步数
    const totalSteps = this.mods.loop ? pageSpan * 2 : pageSpan;
    const raw = this.count % totalSteps;
    this.count += 1;
    // 现在是第几页：页按顺序播放，播完第 0 页再进第 1 页
    const page = Math.floor((raw % pageSpan) / STEPS);
    const lap = raw % STEPS; // 页内的第几列（= 判定线位置）
    const isSecondPass = this.mods.loop && raw >= pageSpan;
    const audLap = this.mods.reverse ? STEPS - 1 - lap : lap;

    const active: string[] = [];
    const stepDur = Tone.Time("8n").toSeconds();

    for (const p of this.blocks) {
      const def = BLOCK_MAP[p.blockId];
      if (!def || def.category === "modifier") continue;
      // 不在这页上的积木这轮不出声
      if ((p.page ?? 0) !== page) continue;
      // 新范式：判定线扫到该积木所在列才触发一次（不再读积木自带 pattern）
      if (audLap !== p.col) continue;

      if (def.category === "rhythm") {
        this.triggerRhythm(def, time, 0.95);
        active.push(p.instanceId);
        if (this.mods.echo) this.triggerRhythm(def, time + stepDur / 2, 0.45);
        if (this.mods.random && Math.random() < 0.15) {
          this.triggerRhythm(def, time + stepDur * (0.4 + Math.random() * 0.2), 0.35);
        }
      } else if (def.category === "sound") {
        // 音色块奏其代表音：优先取积木自有音阶中「该列对应」的音，缺则回退首音（积木“声音”不变）
        const notes = def.notes ?? [];
        let note =
          (p.col < notes.length ? notes[p.col] : null) ?? notes.find((n) => n) ?? "C4";
        if (isSecondPass) note = shiftOctave(note, 1); // Loop 第二轮升高八度
        if (this.mods.random && Math.random() < 0.12) {
          note = RANDOM_PENTA[Math.floor(Math.random() * RANDOM_PENTA.length)];
        }
        this.triggerMelody(def, note, time, 0.85);
        active.push(p.instanceId);
        if (this.mods.echo) this.triggerMelody(def, note, time + stepDur / 2, 0.4);
      }
    }

    // 判定线与积木的视觉同步：Tone 调度器会在发声前约 100ms（lookahead）提前调用本 tick，
    // 若在这里直接触发 listener，积木会先于判定线亮起（即你看到的「积木先响、判定线后到」）。
    // 用 Tone.getDraw() 把视觉回调锁到音频时钟的精确 time，使闪光 / 发声 / 判定线三者同帧。
    const draw = Tone.getDraw();
    if (draw && typeof draw.schedule === "function") {
      draw.schedule(
        () => this.listener?.({ step: raw, lap, page, totalSteps, active }),
        time,
      );
    } else {
      this.listener?.({ step: raw, lap, page, totalSteps, active });
    }
  }

  private triggerRhythm(def: BlockDef, time: number, vel: number): void {
    if (!this.ready) return;
    try {
      switch (def.id) {
        case "kick":
          this.kickSynth.triggerAttackRelease("C1", "8n", time, vel);
          return;
        case "snare":
          this.snareNoise.triggerAttackRelease("16n", time, vel);
          return;
        case "hat":
          this.hatNoise.triggerAttackRelease("32n", time, vel * 0.8);
          return;
        case "perc":
          this.percSynth.triggerAttackRelease("G3", "16n", time, vel);
          return;
      }
    } catch {
      // ignore
    }
  }

  private triggerMelody(def: BlockDef, note: string, time: number, vel: number): void {
    if (!this.ready) return;
    const synth = this.melodies[def.id];
    if (!synth) return;
    try {
      synth.triggerAttackRelease(note, "8n", time, vel);
    } catch {
      // ignore
    }
  }

  /** 拖入 / 删除时的 UI 反馈音。kind: add 清脆入位, remove 轻微“啪”。 */
  async blip(kind: "add" | "remove"): Promise<void> {
    await this.ensureReady();
    if (!this.ready) return;
    try {
      const freq = kind === "add" ? 880 : 260;
      const type = kind === "add" ? ("sine" as const) : ("square" as const);
      const osc = new Tone.Oscillator(freq, type).connect(this.master);
      osc.volume.value = kind === "add" ? -14 : -16;
      osc.start();
      osc.stop("+0.09");
      osc.onstop = () => osc.dispose();
    } catch {
      // ignore
    }
  }

  /** 用户在画布里“触摸积木”时单独发出对应的声音。 */
  async audition(def: BlockDef): Promise<void> {
    await this.ensureReady();
    if (!this.ready) return;
    const now = Tone.now();
    if (def.category === "rhythm") {
      this.triggerRhythm(def, now, 1);
    } else if (def.category === "sound") {
      const note = def.notes?.find((n) => n !== null) ?? "C4";
      this.triggerMelody(def, note, now, 0.9);
    } else {
      this.blip("add");
    }
  }

  getWaveformValue(): Float32Array | null {
    if (!this.ready || !this.analyser) return null;
    return this.analyser.getValue() as Float32Array;
  }

  /**
   * 把当前整首曲子渲染成一段 WAV，作为「音乐扩展」功能的参考音频。
   *
   * 做法：用 Tone 官方 Recorder（内部走 MediaStreamDestination + MediaRecorder）实时录制
   * master 最终输出，从头播放并录下来；Recorder 产物是 webm/opus，再用 decodeAudioData
   * 解码回 PCM 后编码成 16-bit 单声道 WAV Blob 返回。
   * 这样「玩家做好的音乐」就能原样发给队友的 ACE-Step 后端当 cover 参考。
   * 注意：绝不能用 createScriptProcessor —— Tone 15 的 context 被 standardized-audio-context
   * 包了一层兼容壳，该壳刻意不实现已废弃的 createScriptProcessor（调用即抛错）。
   *
   * @param loopTimes 循环录制遍数（默认 1）。音乐扩展需要把玩家原曲循环 3 遍当参考，
   *                  传 3 即可——Transport 本身是无限 repeat，这里只把录制时长撑到 N 遍。
   */
  async exportReferenceWav(loopTimes = 1): Promise<Blob> {
    await this.ensureReady();

    // 录制前先停掉可能在播的曲子，并把计数器归零，保证从第一拍录起
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.count = 0;

    const steps = this.totalSteps();
    const stepSec = this.stepSeconds();
    const baseSec = steps * stepSec;
    const tail = 0.8; // 留一点尾音，避免最后一步的 release 被截断
    const totalSec = baseSec * Math.max(1, loopTimes) + tail;

    // Tone 官方 Recorder：从 master 最终输出实时录制（绕开已废弃且被兼容层隐藏的 createScriptProcessor）
    const recorder = new Tone.Recorder();
    Tone.getDestination().connect(recorder);
    recorder.start();
    // 从头播放整首（Transport 无限 repeat），定时器在录够时长后停止
    this.start();

    await new Promise<void>((resolve) => {
      window.setTimeout(() => {
        try {
          this.pause();
        } catch {
          /* ignore */
        }
        resolve();
      }, Math.ceil(totalSec * 1000) + 60);
    });

    let blob: Blob;
    try {
      blob = await recorder.stop();
    } catch {
      blob = new Blob();
    }
    try {
      Tone.getDestination().disconnect(recorder);
    } catch {
      /* ignore */
    }
    // 不自动恢复 wasPlaying：避免和创作界面的播放状态打架，交给 UI 决定

    // Recorder 产物是 webm/opus，解码回 PCM 再编码成 16-bit 单声道 WAV 供后端当 cover 参考
    try {
      const arr = await blob.arrayBuffer();
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      const decodeCtx: AudioContext = new Ctor();
      const audioBuf = await decodeCtx.decodeAudioData(arr);
      decodeCtx.close();
      const samples = audioBuf.getChannelData(0);
      return encodeWav(new Float32Array(samples), audioBuf.sampleRate);
    } catch {
      // 极端环境解码失败则退回原始 blob（对格式不敏感的调用方可仍工作）
      return blob;
    }
  }
}

export const engine = new AudioEngineImpl();
