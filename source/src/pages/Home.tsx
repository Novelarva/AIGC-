import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useBgm } from "../audio/bgm";
import {
  ProfileModal,
  loadProfile,
  persistProfile,
  type Profile,
} from "../components/ProfileModal";

/* ── 设计稿基准尺寸（卡片 / 音符坐标按美工 1440×1024 设计稿换算成百分比）── */
const REF_W = 1440;
const REF_H = 1024;

const px = (v: number, base: number) => `${(v / base) * 100}%`;

/** 把设计稿里的绝对像素矩形转成舞台百分比定位 */
function box(x: number, y: number, w: number, h: number) {
  return {
    left: px(x, REF_W),
    top: px(y, REF_H),
    width: px(w, REF_W),
    height: px(h, REF_H),
  };
}

/** 三张卡片的坐标：由模板匹配在参考图里精确定位得到 */
const CARDS = [
  { key: "music-wall", src: "/home/cards/card-music-wall.png", x: 122, y: 436, w: 416, h: 465 },
  { key: "create", src: "/home/cards/card-create.png", x: 537, y: 436, w: 387, h: 475 },
  { key: "community", src: "/home/cards/card-community.png", x: 915, y: 436, w: 409, h: 475 },
] as const;

type CardKey = (typeof CARDS)[number]["key"];

/* ── 音符 ──
   7 个音符是从新底图 `bg-side.jpg` 里**原样抠出来**的（原位置已补成纯背景，
   见 `bg-side-clean.jpg`），坐标即底图自身坐标系（1920×1080）。
   它们挂在 `.home-notes` 这一层上：该层与底图同为 16:9、按 `cover` 对齐，
   所以不管屏幕是 16:10 还是 16:9，音符都精确落在美工设计的原位。 */
const NOTE_REF_W = 1920;
const NOTE_REF_H = 1080;

const NOTES = [
  { src: "/home/notes/n1.png", x: 556, y: 51, w: 84, h: 81 },
  { src: "/home/notes/n2.png", x: 38, y: 717, w: 62, h: 61 },
  { src: "/home/notes/n3.png", x: 1841, y: 317, w: 63, h: 61 },
  { src: "/home/notes/n4.png", x: 1640, y: 765, w: 63, h: 61 },
  { src: "/home/notes/n5.png", x: 1372, y: 988, w: 63, h: 61 },
  { src: "/home/notes/n6.png", x: 1362, y: 222, w: 58, h: 60 },
  { src: "/home/notes/n7.png", x: 201, y: 638, w: 58, h: 60 },
];

/* ── 全视口舞台上的元素定位 ──
   %(左/上) 相对视口；尺寸用 vw，保证圆形/方形不随屏幕比例拉伸变形。 */
const TITLE = { left: 27, top: 7.5, w: 46, h: 33 }; // 标题块（object-fit: contain）
const DISC = { size: 3.2 }; // 旋转黑胶（音量），右上角交互簇
const AVATAR = { size: 3.2 }; // MB 头像

interface Props {
  /** 跳到创作界面 */
  onCreate: () => void;
  /** 跳到队友的独立栏目（音乐墙 / 社区） */
  onOpenSection: (v: "musicwall" | "community") => void;
}

export function Home({ onCreate, onOpenSection }: Props) {
  const enabled = useBgm((s) => s.enabled);
  const volume = useBgm((s) => s.volume);
  const panelOpen = useBgm((s) => s.panelOpen);
  const setPanelOpen = useBgm((s) => s.setPanelOpen);
  const setVolume = useBgm((s) => s.setVolume);
  const toggleEnabled = useBgm((s) => s.toggleEnabled);
  const suspendBgm = useBgm((s) => s.suspend);

  const [pressed, setPressed] = useState<CardKey | null>(null);
  const pressTimer = useRef<number | null>(null);

  // 用户资料（昵称 + 头像）
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [profileOpen, setProfileOpen] = useState(false);

  // 面板：点别处 / 按 Esc 关闭
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".home-disc") || t?.closest(".home-panel")) return;
      setPanelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, setPanelOpen]);

  useEffect(
    () => () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
    },
    [],
  );

  const handleCard = useCallback(
    (card: (typeof CARDS)[number]) => {
      // 先给一个"按下去"的反馈，再动作 —— 不然卡片跳转太快没有手感
      setPressed(card.key);
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => setPressed(null), 130);

      if (card.key === "create") {
        window.setTimeout(onCreate, 120);
        return;
      }
      // 音乐墙 / 社区：跳到队友各自独立的栏目页面（iframe 加载，代码互不干扰）
      suspendBgm(); // 离开首页氛围 → 背景音乐暂停
      const view = card.key === "music-wall" ? "musicwall" : "community";
      window.setTimeout(() => onOpenSection(view), 120);
    },
    [onCreate, onOpenSection],
  );

  const saveProfile = useCallback((p: Profile) => {
    setProfile(p);
    persistProfile(p);
    setProfileOpen(false);
  }, []);

  return (
    <>
      <div className="stage-wrap">
        <div className="stage stage--home">
          <div className="home home-enter">
            {/* 整屏底图：美工交的"左右装饰 + 中间留白"图（音符已抠出为独立层） */}
            <img
              className="home-bg"
              src="/home/bg-side-clean.jpg"
              alt=""
              aria-hidden
              draggable={false}
            />

            {/* 轻轻摇摆的音符（满屏铺底，与底图 16:9 对齐，不随画布缩放） */}
            <div className="home-notes" aria-hidden>
              {NOTES.map((n, i) => (
                <img
                  key={n.src}
                  className="home-note"
                  src={n.src}
                  alt=""
                  draggable={false}
                  style={
                    {
                      left: `${(n.x / NOTE_REF_W) * 100}%`,
                      top: `${(n.y / NOTE_REF_H) * 100}%`,
                      width: `${(n.w / NOTE_REF_W) * 100}%`,
                      height: `${(n.h / NOTE_REF_H) * 100}%`,
                      "--sway-dur": `${3.6 + (i % 3) * 0.7}s`,
                      "--sway-delay": `${i * 0.5}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            {/* UI 画布：固定 1440×1024 比例，元素按比例缩放、不拉伸变形 */}
            <div className="home-ui">
            {/* 标题块（从旧稿抠出，叠在新底图上） */}
            <img
              className="home-title"
              src="/home/title.png"
              alt="LET'S MAKE MUSIC, PIECE BY PIECE"
              draggable={false}
              style={{
                left: `${TITLE.left}%`,
                top: `${TITLE.top}%`,
                width: `${TITLE.w}%`,
                height: `${TITLE.h}%`,
              }}
            />

            {/* 三张可交互卡片 */}
            {CARDS.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`home-card home-card--${c.key} ${
                  pressed === c.key ? "home-card--pressed" : ""
                }`}
                style={box(c.x, c.y, c.w, c.h)}
                onClick={() => handleCard(c)}
                aria-label={
                  c.key === "music-wall" ? "音乐墙" : c.key === "create" ? "创作" : "社区"
                }
                title={
                  c.key === "music-wall" ? "音乐墙" : c.key === "create" ? "创作" : "社区"
                }
              >
                <img src={c.src} alt="" draggable={false} />
              </button>
            ))}

            {/* 右上角交互簇：音量光碟 + 我的头像 + 昵称（昵称显示在头像右侧） */}
            <div className="home-topright">
              {/* 慢慢旋转的黑胶：点开调音量 / 关背景音乐 */}
              <div className="home-disc-wrap">
                <button
                  type="button"
                  className={`home-disc ${enabled ? "" : "home-disc--off"}`}
                  style={{ width: `${DISC.size}cqw`, aspectRatio: "1" }}
                  onClick={() => setPanelOpen(!panelOpen)}
                  aria-label="背景音乐设置"
                  aria-expanded={panelOpen}
                  title="背景音乐设置"
                >
                  <span className="home-disc-disc" />
                  <span className="home-disc-hole" />
                </button>

                {panelOpen && (
                  <div className="home-panel" role="dialog" aria-label="背景音乐设置">
                    <div className="home-panel-title">背景音乐</div>
                    <div className="home-panel-sub">OPENING THEME · 循环播放</div>
                    <div className="home-panel-row">
                      <span className="home-panel-ico" aria-hidden>
                        {!enabled || volume === 0 ? "🔇" : volume < 0.45 ? "🔉" : "🔊"}
                      </span>
                      <input
                        className="home-slider"
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(volume * 100)}
                        style={{ "--fill": `${Math.round(volume * 100)}%` } as CSSProperties}
                        onChange={(e) => setVolume(Number(e.target.value) / 100)}
                        aria-label="音量"
                      />
                      <span className="home-panel-pct">{Math.round(volume * 100)}%</span>
                    </div>
                    <div className="home-panel-actions">
                      <button
                        type="button"
                        className={`home-btn ${!enabled ? "home-btn--on" : ""}`}
                        onClick={toggleEnabled}
                      >
                        {enabled ? "⏸ 关闭音乐" : "▶ 开启音乐"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* MB 头像：点开改昵称 / 头像 */}
              <button
                type="button"
                className={`home-avatar ${profile.avatar ? "home-avatar--set" : ""}`}
                style={{ width: `${AVATAR.size}cqw`, aspectRatio: "1" }}
                onClick={() => setProfileOpen(true)}
                aria-label="我的资料"
                title="我的资料"
              >
                <span className="home-avatar-ring">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="我的头像" draggable={false} />
                  ) : (
                    <span
                      className="home-avatar-mb"
                      style={{ fontSize: `${AVATAR.size * 0.4}cqw` }}
                    >
                      MB
                    </span>
                  )}
                </span>
              </button>

              {/* 昵称：显示在头像右侧（无底色、黑色字） */}
              {profile.nickname && <span className="home-nick">{profile.nickname}</span>}
            </div>
            </div>
          </div>
        </div>
      </div>

      <ProfileModal
        open={profileOpen}
        initial={profile}
        onClose={() => setProfileOpen(false)}
        onSave={saveProfile}
      />
    </>
  );
}
