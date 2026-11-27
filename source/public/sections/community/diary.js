/* 日记墙（论坛 / 社区栏目内的一个小功能）
 * - 数据存在同源 localStorage 的 musicblocks.diaries（和主站、音乐墙共享同源）
 * - 作者署名 / 头像取自主站设置的昵称（musicblocks.profile.v1）
 * - 「关联我的音乐」取自主站「我的音乐库」musicblocks.mytracks（标题列表）
 * 纯原生 JS，跟随 community 的 script.js 之后加载。
 */
(function () {
  "use strict";

  const DIARY_KEY = "musicblocks.diaries";
  const PROFILE_KEY = "musicblocks.profile.v1";
  const TRACKS_KEY = "musicblocks.mytracks";

  const MAX_DIARIES = 50;
  const MAX_IMAGES = 6;

  /* ---------- 存储读取 ---------- */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function loadProfile() {
    const p = readJSON(PROFILE_KEY, {});
    return { nickname: typeof p.nickname === "string" ? p.nickname : "", avatar: p.avatar || null };
  }
  function loadTracks() {
    const arr = readJSON(TRACKS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function loadDiaries() {
    const arr = readJSON(DIARY_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveDiaries(arr) {
    try {
      localStorage.setItem(DIARY_KEY, JSON.stringify(arr));
    } catch {
      showToast("日记太多/图片太大，存不下了，先删几条试试");
    }
  }

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
    );
  }
  function truncate(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  function timeAgo(ts) {
    const d = Date.now() - ts;
    const m = 60000, h = 3600000, day = 86400000;
    if (d < m) return "刚刚";
    if (d < h) return Math.floor(d / m) + " 分钟前";
    if (d < day) return Math.floor(d / h) + " 小时前";
    if (d < 30 * day) return Math.floor(d / day) + " 天前";
    return new Date(ts).toLocaleDateString("zh-CN");
  }
  function initialsOf(name) {
    const n = (name || "我").trim();
    return n ? n.slice(0, 1).toUpperCase() : "我";
  }

  /** 把图片文件压成合适尺寸的 dataURL（避免 localStorage 爆炸） */
  function fileToDataURL(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) return reject(new Error("不是图片"));
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("图片解析失败"));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL("image/jpeg", quality));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- DOM 引用 ---------- */
  const grid = document.querySelector("#diaryGrid");
  const composeModal = document.querySelector("#diaryCompose");
  const detailModal = document.querySelector("#diaryDetail");
  const detailContent = document.querySelector("#diaryDetailContent");
  const titleInput = document.querySelector("#diaryTitle");
  const textInput = document.querySelector("#diaryText");
  const musicSelect = document.querySelector("#diaryMusic");
  const coverInput = document.querySelector("#diaryCover");
  const imagesInput = document.querySelector("#diaryImages");
  const publishBtn = document.querySelector("#diaryPublishBtn");
  const composeTitleEl = document.querySelector("#diaryComposeTitle");
  const coverPrev = document.querySelector("#diaryCoverPrev");
  const imgsPrev = document.querySelector("#diaryImgsPrev");

  function showToast(msg) {
    const t = document.querySelector("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove("is-visible"), 2200);
  }

  /* ---------- 渲染 ---------- */
  function authorBadge(d) {
    const av = d.avatar;
    const nm = d.author || "我";
    const avHtml = av
      ? `<img class="diary-avatar" src="${av}" alt="">`
      : `<span class="diary-avatar diary-avatar--txt">${escapeHtml(initialsOf(nm))}</span>`;
    return `${avHtml}<span>${escapeHtml(nm)}</span>`;
  }

  function emptyStateCard() {
    return (
      '<button class="diary-empty" id="diaryEmptyBtn" type="button" aria-label="写第一篇日记">' +
      '<span class="diary-empty-box"><span class="diary-plus">+</span></span>' +
      '<span class="diary-empty-hint">在这里记录你的生活，快来试试吧！</span>' +
      "</button>"
    );
  }

  function diaryCard(d) {
    const cover = d.cover
      ? `<img class="diary-card-cover" src="${d.cover}" alt="">`
      : `<div class="diary-card-cover diary-card-cover--ph">📝</div>`;
    return (
      `<button class="diary-card" type="button" data-id="${d.id}">` +
      cover +
      '<div class="diary-card-body">' +
      `<h3 class="diary-card-title">${escapeHtml(d.title || "无题")}</h3>` +
      `<p class="diary-card-text">${escapeHtml(truncate(d.text || "（没有写正文）", 60))}</p>` +
      `<div class="diary-card-author">${authorBadge(d)}</div>` +
      "</div></button>"
    );
  }

  function addCard() {
    return (
      '<button class="diary-add" id="diaryAddBtn" type="button">' +
      '<span class="diary-plus">+</span><span>写新日记</span></button>'
    );
  }

  /* 待发布（已在弹窗里选好、转成 dataURL 的图片） */
  let pendingCover = null;
  let pendingImages = [];

  function renderCoverPrev() {
    if (!coverPrev) return;
    if (pendingCover) {
      coverPrev.hidden = false;
      coverPrev.innerHTML =
        '<div class="diary-prev-item"><img src="' + pendingCover + '" alt="封面预览">' +
        '<button class="diary-prev-x" type="button" data-cover-x aria-label="移除封面">×</button></div>';
    } else {
      coverPrev.hidden = true;
      coverPrev.innerHTML = "";
    }
  }
  function renderImagesPrev() {
    if (!imgsPrev) return;
    if (pendingImages.length) {
      imgsPrev.hidden = false;
      imgsPrev.innerHTML = pendingImages
        .map((s, i) =>
          '<div class="diary-prev-item"><img src="' + s + '" alt="">' +
          '<button class="diary-prev-x" type="button" data-img-x="' + i + '" aria-label="移除">×</button></div>')
        .join("");
    } else {
      imgsPrev.hidden = true;
      imgsPrev.innerHTML = "";
    }
  }

  function render() {
    if (!grid) return;
    const list = loadDiaries();
    if (!list.length) {
      grid.innerHTML = emptyStateCard();
    } else {
      grid.innerHTML = list.map(diaryCard).join("") + addCard();
    }
  }

  /* ---------- 发布弹窗 ---------- */
  function fillMusicSelect() {
    if (!musicSelect) return;
    const tracks = loadTracks();
    const opts = ['<option value="">不关联</option>'];
    tracks.forEach((t, i) => {
      const title = (t && t.title) || `我的作品 ${i + 1}`;
      opts.push(`<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`);
    });
    musicSelect.innerHTML = opts.join("");
  }

  function openCompose() {
    if (titleInput) titleInput.value = "";
    if (textInput) textInput.value = "";
    if (coverInput) coverInput.value = "";
    if (imagesInput) imagesInput.value = "";
    pendingCover = null;
    pendingImages = [];
    renderCoverPrev();
    renderImagesPrev();
    fillMusicSelect();
    if (composeTitleEl) composeTitleEl.textContent = "写新日记";
    if (composeModal) composeModal.hidden = false;
  }
  function closeCompose() {
    if (composeModal) composeModal.hidden = true;
  }

  async function publish() {
    const title = (titleInput && titleInput.value.trim()) || "";
    const text = (textInput && textInput.value.trim()) || "";
    if (!title && !text) {
      showToast("至少写个题目或一点正文吧");
      return;
    }
    const musicTitle = musicSelect && musicSelect.value ? musicSelect.value : null;
    publishBtn.disabled = true;
    publishBtn.textContent = "发布中…";
    try {
      const cover = pendingCover || null;
      const images = pendingImages.slice();

      const profile = loadProfile();
      const list = loadDiaries();
      const entry = {
        id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title,
        text,
        cover,
        images,
        musicTitle,
        author: profile.nickname || "我",
        avatar: profile.avatar || null,
        createdAt: Date.now(),
      };
      list.unshift(entry);
      if (list.length > MAX_DIARIES) list.length = MAX_DIARIES;
      saveDiaries(list);
      render();
      closeCompose();
      showToast("日记已发布 ✓");
    } catch (e) {
      showToast("发布失败：" + ((e && e.message) || "图片处理出错"));
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = "发布";
    }
  }

  /* ---------- 详情浏览 ---------- */
  function openDetail(id) {
    const d = loadDiaries().find((x) => x.id === id);
    if (!d || !detailContent) return;
    const cover = d.cover ? `<img class="diary-detail-cover" src="${d.cover}" alt="">` : "";
    const music = d.musicTitle
      ? `<div class="diary-music">♪ 关联音乐：${escapeHtml(d.musicTitle)}</div>`
      : "";
    const imgs = d.images && d.images.length
      ? `<div class="diary-detail-imgs">${d.images.map((s) => `<img src="${s}" alt="">`).join("")}</div>`
      : "";
    detailContent.innerHTML =
      cover +
      `<h2 class="diary-detail-title">${escapeHtml(d.title || "无题")}</h2>` +
      `<div class="diary-detail-meta">${authorBadge(d)}<span>${timeAgo(d.createdAt)}</span></div>` +
      `<div class="diary-detail-text">${escapeHtml(d.text || "")}</div>` +
      music +
      imgs;
    if (detailModal) detailModal.hidden = false;
  }
  function closeDetail() {
    if (detailModal) detailModal.hidden = true;
  }

  /* ---------- 事件绑定 ---------- */
  if (grid) {
    grid.addEventListener("click", (e) => {
      if (e.target.closest("#diaryEmptyBtn") || e.target.closest("#diaryAddBtn")) {
        openCompose();
        return;
      }
      const card = e.target.closest(".diary-card");
      if (card && card.dataset.id) openDetail(card.dataset.id);
    });
  }

  const newBtn = document.querySelector("#diaryNewBtn");
  if (newBtn) newBtn.addEventListener("click", openCompose);

  if (composeModal) {
    composeModal.querySelectorAll("[data-close-compose]").forEach((el) =>
      el.addEventListener("click", closeCompose),
    );
  }
  if (detailModal) {
    detailModal.querySelectorAll("[data-close-detail]").forEach((el) =>
      el.addEventListener("click", closeDetail),
    );
  }
  if (coverInput) coverInput.addEventListener("change", async () => {
    const f = coverInput.files && coverInput.files[0];
    if (!f) return;
    try { pendingCover = await fileToDataURL(f, 1000, 0.82); renderCoverPrev(); }
    catch (e) { showToast("封面读取失败"); }
  });
  if (imagesInput) imagesInput.addEventListener("change", async () => {
    const files = imagesInput.files ? Array.from(imagesInput.files) : [];
    if (!files.length) return;
    try {
      const urls = await Promise.all(files.map((f) => fileToDataURL(f, 1200, 0.8)));
      pendingImages = pendingImages.concat(urls);
      if (pendingImages.length > MAX_IMAGES) {
        pendingImages = pendingImages.slice(-MAX_IMAGES);
        showToast("最多 " + MAX_IMAGES + " 张内附图片，多余的已忽略");
      }
      renderImagesPrev();
    } catch (e) { showToast("图片读取失败"); }
  });
  if (coverPrev) coverPrev.addEventListener("click", (e) => {
    if (e.target.closest("[data-cover-x]")) { pendingCover = null; if (coverInput) coverInput.value = ""; renderCoverPrev(); }
  });
  if (imgsPrev) imgsPrev.addEventListener("click", (e) => {
    const b = e.target.closest("[data-img-x]");
    if (b) { pendingImages.splice(Number(b.getAttribute("data-img-x")), 1); renderImagesPrev(); }
  });

  if (publishBtn) publishBtn.addEventListener("click", publish);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (composeModal && !composeModal.hidden) closeCompose();
      if (detailModal && !detailModal.hidden) closeDetail();
    }
  });

  render();
})();
