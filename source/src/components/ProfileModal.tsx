import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent as RChangeEvent,
  type PointerEvent as RPointerEvent,
} from "react";

/* ── 用户资料（昵称 + 头像）持久化 ── */
export interface Profile {
  nickname: string;
  /** 圆形头像的 dataURL（null = 未设置，退回 MB 黑圈） */
  avatar: string | null;
}

const PROFILE_KEY = "musicblocks.profile.v1";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return {
        nickname: typeof p.nickname === "string" ? p.nickname : "",
        avatar: typeof p.avatar === "string" ? p.avatar : null,
      };
    }
  } catch {
    /* 读取失败按未设置处理 */
  }
  return { nickname: "", avatar: null };
}

export function persistProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* 配额满 / 隐私模式：忽略即可，不影响当次展示 */
  }
}

/* ── 裁切参数 ── */
const CROP = 236; // 预览圆直径（css px）
const OUT = 320; // 导出圆图边长

interface Props {
  open: boolean;
  initial: Profile;
  onClose: () => void;
  onSave: (p: Profile) => void;
}

export function ProfileModal({ open, initial, onClose, onSave }: Props) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [saved, setSaved] = useState<string | null>(initial.avatar);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // 每次打开重置为当前资料
  useEffect(() => {
    if (!open) return;
    setNickname(initial.nickname);
    setSaved(initial.avatar);
    setImg(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [open, initial.nickname, initial.avatar]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 图片"铺满圆"的基准倍率
  const baseScale = img
    ? Math.max(CROP / img.naturalWidth, CROP / img.naturalHeight)
    : 1;
  const dw = img ? img.naturalWidth * baseScale * scale : 0;
  const dh = img ? img.naturalHeight * baseScale * scale : 0;

  const clampOffset = (o: { x: number; y: number }, s = scale) => {
    if (!img) return o;
    const w = img.naturalWidth * baseScale * s;
    const h = img.naturalHeight * baseScale * s;
    const mx = Math.max(0, (w - CROP) / 2);
    const my = Math.max(0, (h - CROP) / 2);
    return {
      x: Math.min(mx, Math.max(-mx, o.x)),
      y: Math.min(my, Math.max(-my, o.y)),
    };
  };

  const changeScale = (s: number) => {
    setOffset((o) => clampOffset(o, s));
    setScale(s);
  };

  const pickFile = (e: RChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一张
    if (!f) return;
    // 读成 dataURL：预览 <img> 与裁切 Image 共用同一份数据，
    // 避免 blob URL 被 revoke 后预览图变成空白。
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      if (!url) return;
      const image = new Image();
      image.onload = () => {
        setImg(image);
        setScale(1);
        setOffset({ x: 0, y: 0 });
      };
      image.src = url;
    };
    reader.readAsDataURL(f);
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  const onUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  /** 把当前裁切结果画到 canvas，导出圆形 PNG */
  const renderAvatar = (): string | null => {
    if (!img) return null;
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const k = OUT / CROP;
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.translate(OUT / 2, OUT / 2);
    ctx.translate(offset.x * k, offset.y * k);
    ctx.scale(baseScale * scale * k, baseScale * scale * k);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    return c.toDataURL("image/png");
  };

  const handleSave = () => {
    const avatar = img ? renderAvatar() : saved;
    onSave({ nickname: nickname.trim(), avatar });
  };

  if (!open) return null;

  const showImg = Boolean(img);
  const showSaved = !showImg && Boolean(saved);

  return (
    <div className="profile-modal" onPointerDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="profile-card" role="dialog" aria-label="编辑个人资料">
        <div className="profile-head">
          <span className="profile-title">我的资料</span>
          <button
            type="button"
            className="profile-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="profile-body">
          <div>
            <div className="profile-label">昵称</div>
            <input
              className="profile-input"
              type="text"
              maxLength={12}
              placeholder="给自己起个名字（最多 12 字）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <div>
            <div className="profile-label">头像</div>
            <div
              className={`profile-crop ${dragging ? "is-dragging" : ""}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {showImg && img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: dw,
                    height: dh,
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />
              )}
              {showSaved && !img && (
                <img
                  src={saved as string}
                  alt=""
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    left: 0,
                    top: 0,
                    transform: "none",
                    position: "absolute",
                    objectFit: "cover",
                  }}
                />
              )}
              {!showImg && !showSaved && (
                <span className="profile-crop-ph">MB</span>
              )}
            </div>

            <div className="profile-tools">
              <button
                type="button"
                className="profile-btn"
                onClick={() => fileRef.current?.click()}
              >
                📁 选择图片
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={pickFile}
              />
              {(showImg || showSaved) && (
                <button
                  type="button"
                  className="profile-btn profile-btn--ghost"
                  onClick={() => {
                    setImg(null);
                    setSaved(null);
                  }}
                >
                  恢复默认
                </button>
              )}
            </div>

            {showImg && (
              <div className="profile-zoom">
                <span aria-hidden>🔍</span>
                <input
                  type="range"
                  min={100}
                  max={300}
                  value={Math.round(scale * 100)}
                  onChange={(e) => changeScale(Number(e.target.value) / 100)}
                  aria-label="缩放头像"
                />
              </div>
            )}

            <div className="profile-hint">
              {showImg
                ? "拖动图片调整位置，滑杆缩放到合适的构图。"
                : "从电脑里选一张图片作为头像，可拖动截成圆形。"}
            </div>
          </div>
        </div>

        <div className="profile-actions">
          <button type="button" className="profile-btn profile-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="profile-btn profile-btn--primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
