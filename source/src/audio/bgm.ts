/**
 * 首页背景音乐控制器。
 *
 * 为什么用原生 <audio> 而不是 Tone.js：
 *   创作界面（CreationStudio）自己占着 Tone.js 的全局 AudioContext，
 *   首页 BGM 若也走 Tone，两边会抢同一个上下文、互相影响。原生 <audio> 独立通道。
 *
 * 浏览器自动播放策略：带声音的播放必须在用户手势里触发。
 *   所以不是「进网页就放」，而是「按任意键进入首页」那一下（真实手势）才开始。
 *
 * 行为（按需求）：
 *   · 进入首页（按任意键 / 点击封面）→ 开始播放，并【循环播放】；音量从 0 缓缓渐响，避免突然炸响。
 *   · 首页左上角黑胶 → 点开面板，可拖音量，或「关闭 / 开启」背景音乐（真正的暂停/播放）。
 *   · 点击「创作 / 音乐墙 / 社区」任一卡片（离开首页氛围）→ 背景音乐暂停；
 *     回到首页 → 续播（除非黑胶关了）。
 *   · 切到后台标签页 → 暂停；回前台 → 续播（同样受黑胶开关约束）。
 *   · 关掉整个浏览器/标签页 → <audio> 元素随页面销毁，音乐自然停止（不会在后台偷响）。
 */
import { create } from "zustand";

const SRC = "/audio/home-bgm.mp3";
const LS_KEY = "bm-bgm-pref";
const DEFAULT_VOLUME = 0.34;

export interface BgmState {
  /** 是否已进入过首页（开始了 BGM 会话） */
  started: boolean;
  /** 黑胶总开关：true=响，false=关 */
  enabled: boolean;
  /** 0~1 线性音量 */
  volume: number;
  /** 音量面板是否展开 */
  panelOpen: boolean;
  /** 因进入创作/音乐墙/社区等子视图而临时暂停 */
  suspended: boolean;
  start: () => void;
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  setVolume: (v: number) => void;
  setPanelOpen: (v: boolean) => void;
  suspend: () => void;
  restore: () => void;
}

/* ---------- 底层：一个模块级单例 audio 元素 ---------- */
let el: HTMLAudioElement | null = null;

/* ---------- 渐入：防止开场音乐突然炸响 ---------- */
let fadeRaf = 0;
function cancelFade() {
  if (fadeRaf) {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }
}
/** 从 0 缓缓升到 target（默认 ~1.4s，easeOutQuad），避免一上来就满音量吓人 */
function fadeIn(a: HTMLAudioElement, target: number, dur = 1400) {
  cancelFade();
  a.volume = 0;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const e = 1 - (1 - k) * (1 - k); // 先快后慢的"涌起"感
    a.volume = target * e;
    if (k < 1) fadeRaf = requestAnimationFrame(step);
    else fadeRaf = 0;
  };
  fadeRaf = requestAnimationFrame(step);
}

function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio(SRC);
    el.loop = true; // 循环播放
    el.preload = "auto";
    el.volume = DEFAULT_VOLUME;
    // 挂进文档（<audio> 无 controls 不会渲染任何东西）
    el.setAttribute("data-bgm", "home");
    if (document.body) document.body.appendChild(el);
    // 循环播放时 ended 一般不会触发；留个守卫，万一到了就安静停下
    el.addEventListener("ended", () => useBgm.setState({ started: false }));
    // 标签页切到后台就暂停，回到前台若仍应响、且没被关/没临时暂停，就续上
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelFade();
        el?.pause();
        return;
      }
      const s = useBgm.getState();
      if (s.started && s.enabled && !s.suspended && !el?.ended) {
        el?.play()?.catch(() => undefined);
      }
    });
  }
  return el;
}

/* ---------- 偏好持久化：只存音量 ---------- */
function loadPref(): { volume: number } {
  const fallback = { volume: DEFAULT_VOLUME };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<{ volume: number }>;
    return {
      volume:
        typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1
          ? p.volume
          : fallback.volume,
    };
  } catch {
    return fallback;
  }
}

function savePref(volume: number) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ volume }));
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

const pref = typeof window === "undefined" ? { volume: DEFAULT_VOLUME } : loadPref();

export const useBgm = create<BgmState>((set, get) => ({
  started: false,
  enabled: true,
  volume: pref.volume,
  panelOpen: false,
  suspended: false,

  /** 在用户手势里调用：进入首页 → 开响 + 循环（带渐响，不吓人） */
  start: () => {
    const a = getEl();
    if (!a) return;
    const target = get().volume;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => undefined); // 被策略拦下就静默
    fadeIn(a, target); // 小小渐响：从 0 升到设定音量
    set({ started: true, enabled: true, suspended: false });
  },

  /** 黑胶总开关：true=响，false=关（真正的暂停/播放，不是只静音） */
  setEnabled: (v) => {
    const a = getEl();
    const s = get();
    if (a) {
      if (v && s.started && !s.suspended) {
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => undefined);
        fadeIn(a, s.volume);
      } else {
        cancelFade();
        a.pause();
      }
    }
    set({ enabled: v });
  },

  toggleEnabled: () => get().setEnabled(!get().enabled),

  setVolume: (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    const a = getEl();
    if (a) {
      cancelFade(); // 用户手动拉音量，别让渐变把音量抢回去
      a.volume = clamped;
    }
    savePref(clamped);
    set({ volume: clamped });
  },

  setPanelOpen: (v) => set({ panelOpen: v }),

  /** 进创作/音乐墙/社区等子视图：暂停（保留状态，回来能续） */
  suspend: () => {
    const a = getEl();
    cancelFade();
    if (a) a.pause();
    set({ suspended: true });
  },

  /** 回到首页：若黑胶开着就续播（同样渐响） */
  restore: () => {
    const a = getEl();
    const s = get();
    if (a && s.enabled && s.started) {
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
      fadeIn(a, s.volume);
    }
    set({ suspended: false });
  },
}));
