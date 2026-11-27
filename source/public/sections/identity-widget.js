/* 玩家身份挂件：挂在栏目（音乐墙 / 社区）角落，
   显示玩家头像，点击弹出「昵称 + 已发布音乐数量」。
   读取与主应用同源的 localStorage：
     - musicblocks.profile.v1  → { nickname, avatar }
     - musicblocks.mytracks     → 已发布作品数组（ExtensionModal 写入）
   因为 iframe 与主站同源，localStorage 共享，无需跨域通信。 */
(function () {
  "use strict";

  var PROFILE_KEY = "musicblocks.profile.v1";
  var TRACKS_KEY = "musicblocks.mytracks";

  function readJSON(k, fallback) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mount(corner) {
    if (document.getElementById("mb-identity-widget")) return;

    var style = document.createElement("style");
    style.textContent = [
      "#mb-identity-widget{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:8px;font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif;}",
      "#mb-identity-widget.mb-bl{bottom:16px;left:16px;}",
      "#mb-identity-widget.mb-tr{top:16px;right:16px;}",
      "#mb-identity-widget .mb-ava{width:46px;height:46px;border-radius:50%;overflow:hidden;border:3px solid #0b1b3a;background:#121216;box-shadow:0 4px 14px rgba(11,27,58,.35);cursor:pointer;display:grid;place-items:center;flex:0 0 auto;padding:0;}",
      "#mb-identity-widget .mb-ava img{width:100%;height:100%;object-fit:cover;display:block;}",
      "#mb-identity-widget .mb-ava span{color:#fff;font-weight:800;font-size:16px;letter-spacing:.5px;}",
      "#mb-identity-widget .mb-pop{position:absolute;background:#fff;border:2.5px solid #0b1b3a;border-radius:6px 16px 6px 16px;box-shadow:6px 8px 0 rgba(11,27,58,.22);padding:12px 14px;min-width:168px;font-size:13px;color:#0b1b3a;}",
      "#mb-identity-widget.mb-bl .mb-pop{bottom:58px;left:0;}",
      "#mb-identity-widget.mb-tr .mb-pop{top:58px;right:0;}",
      "#mb-identity-widget .mb-name{font-weight:800;font-size:15px;margin-bottom:4px;}",
      "#mb-identity-widget .mb-sub{font-size:12.5px;color:#4a5680;}",
      "#mb-identity-widget .mb-tip{margin-top:8px;font-size:11px;color:#8a93b0;line-height:1.5;}",
    ].join("\n");
    document.head.appendChild(style);

    var cornerCls = corner === "tr" ? "mb-tr" : "mb-bl";
    var root = document.createElement("div");
    root.id = "mb-identity-widget";
    root.className = cornerCls;

    var btn = document.createElement("button");
    btn.className = "mb-ava";
    btn.setAttribute("aria-label", "我的资料");

    var pop = document.createElement("div");
    pop.className = "mb-pop";
    pop.style.display = "none";

    function render() {
      var p = readJSON(PROFILE_KEY, {});
      var nick = p.nickname || "";
      var tracks = readJSON(TRACKS_KEY, []);
      var count = Array.isArray(tracks) ? tracks.length : 0;
      if (p.avatar) {
        btn.innerHTML = '<img src="' + p.avatar + '" alt="">';
      } else {
        btn.innerHTML = "<span>MB</span>";
      }
      pop.innerHTML =
        '<div class="mb-name">' + (nick ? escapeHtml(nick) : "未设置昵称") + "</div>" +
        '<div class="mb-sub">已发布 ' + count + " 首</div>" +
        '<div class="mb-tip">在首页右上角可编辑昵称与头像</div>';
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.style.display = pop.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) pop.style.display = "none";
    });

    root.appendChild(btn);
    root.appendChild(pop);
    document.body.appendChild(root);

    render();
    window.addEventListener("storage", render);
  }

  var corner = window.__MB_IDENTITY_CORNER__ || "bl";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mount(corner);
    });
  } else {
    mount(corner);
  }
})();
