#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ACE-Step 1.5 中转后端（relay）—— 给队友跑的，零依赖，只用 Python 标准库。

为什么需要它（踩过的坑）：
- ACE-Step 官方 REST API 跑在队友本机 localhost:8001。游戏玩家的浏览器**既跨域、
  又 localhost 指向玩家自己的机器**，绝不能让前端直连。
- 这个 relay 跑在队友机器上，跟 acestep-api 同机，替前端转发请求、并把生成好的
  音频下载成本地文件，通过 /files/ 静态路由返回给玩家浏览器。
- 前端只认一个地址：本服务的 http://<队友机局域网IP>:8010
- 不用 Vercel / 不用云 API（那俩要么没 GPU 跑不了、要么按次收费很贵）。本机免费跑。

队友用法（Windows PowerShell / 终端）：
    cd 这个文件所在目录
    python relay_server.py
默认监听 0.0.0.0:8010。需要 Windows 防火墙放行 8010 入站（否则玩家浏览器连不上）。
"""
import http.server
import json
import urllib.request
import base64
import tempfile
import os
import time
import traceback

ACE_API = "http://localhost:8001"   # 同机的 acestep-api（uv run acestep-api 默认 8001）
PORT = 8010
GENERATED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated")
TRACKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tracks.json")

os.makedirs(GENERATED_DIR, exist_ok=True)


def ace_post(path, payload, timeout=600):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ACE_API + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _download(url, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


class Handler(http.server.BaseHTTPRequestHandler):
    # 安静点，不打印每个请求
    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/health"):
            self._json(200, {"status": "ok", "relay": "ace-step-1.5", "ace_api": ACE_API})
            return
        if self.path == "/api/tracks":
            # 音乐墙拉取已发布曲目列表（前端 ExtensionModal 发布后，墙队友 GET 这个拿去渲染）
            self._json(200, self._load_tracks())
            return
        if self.path.startswith("/files/"):
            self._serve_file(self.path[len("/files/"):])
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.endswith("/api/tracks"):
            # 挂音乐墙：前端 ExtensionModal 在扩展曲试听后调用
            self._publish_track()
            return
        if not self.path.endswith("/api/extend"):
            self._json(404, {"error": "unknown endpoint, use /api/extend or /api/tracks"})
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception as e:
            self._json(400, {"error": f"bad request: {e}"})
            return

        prompt = (body.get("prompt") or "").strip()
        task_type = body.get("taskType", "cover")
        duration = int(body.get("duration") or 45)
        audio_b64 = body.get("audioB64") or ""
        bpm = body.get("bpm")

        if not prompt:
            self._json(400, {"error": "prompt 不能为空"})
            return

        # 参考音频：前端传 base64，本地存临时 wav。acestep-api 同机，用 src_audio_path 直接读。
        src_path = ""
        if audio_b64:
            try:
                raw = base64.b64decode(audio_b64)
                fd, p = tempfile.mkstemp(suffix=".wav", dir=GENERATED_DIR)
                os.write(fd, raw)
                os.close(fd)
                src_path = p
            except Exception as e:
                self._json(400, {"error": f"audio decode failed: {e}"})
                return

        payload = {
            "prompt": prompt,
            "audio_duration": duration,       # 秒，10~600
            "task_type": task_type,           # cover | repaint | complete | text2music ...
            "src_audio_path": src_path,       # cover/repaint 用：原曲在服务器上的绝对路径
            "audio_format": "mp3",
            "inference_steps": 8,             # turbo 模型 8 步够快
            "use_random_seed": True,
        }
        if bpm:
            payload["bpm"] = int(bpm)

        try:
            # 1) 提交任务
            sub = ace_post("/release_task", payload)
            tid = (sub.get("data") or {}).get("task_id")
            if not tid:
                self._json(500, {"error": "acestep 未返回 task_id", "raw": sub})
                return
            print(f"[relay] task {tid} 已提交 ({task_type}, {duration}s)")

            # 2) 轮询（最多 ~8 分钟）
            audio_url = None
            for _ in range(240):
                time.sleep(2)
                q = ace_post("/query_result", {"task_id_list": [tid]})
                item = (q.get("data") or [{}])[0]
                st = item.get("status")
                if st == 1:
                    result = json.loads(item.get("result") or "[]")
                    file_rel = result[0].get("file") if result else None
                    if not file_rel:
                        self._json(500, {"error": "生成成功但未返回音频地址", "raw": item})
                        return
                    dl = file_rel if file_rel.startswith("http") else ACE_API + file_rel
                    mp3 = _download(dl)
                    out_name = f"{tid}.mp3"
                    out_path = os.path.join(GENERATED_DIR, out_name)
                    with open(out_path, "wb") as f:
                        f.write(mp3)
                    # 用请求里的 Host 拼外网可访问 URL（自动拿到队友机局域网 IP）
                    host = self.headers.get("Host", f"localhost:{PORT}")
                    audio_url = f"http://{host}/files/{out_name}"
                    print(f"[relay] 完成 -> {audio_url} ({len(mp3)} bytes)")
                    break
                if st == 2:
                    self._json(500, {"error": "acestep 生成失败", "raw": item})
                    return

            if not audio_url:
                self._json(504, {"error": "等待生成超时（>8min）"})
                return

            self._json(200, {"audioUrl": audio_url, "taskId": tid})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})

    def _serve_file(self, name):
        path = os.path.normpath(os.path.join(GENERATED_DIR, name))
        if not path.startswith(GENERATED_DIR) or not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(os.path.getsize(path)))
        self._cors()
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

    # ───────────────── 挂音乐墙：曲目持久化 ─────────────────
    def _load_tracks(self):
        try:
            with open(TRACKS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_tracks(self, tracks):
        with open(TRACKS_FILE, "w", encoding="utf-8") as f:
            json.dump(tracks, f, ensure_ascii=False, indent=2)

    def _publish_track(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception as e:
            self._json(400, {"error": f"bad request: {e}"})
            return

        if not body.get("audioUrl") or not body.get("title"):
            self._json(400, {"error": "audioUrl 与 title 必填"})
            return

        tracks = self._load_tracks()
        tid = "t" + str(int(time.time() * 1000))
        rec = {
            "id": tid,
            "audioUrl": body.get("audioUrl"),
            "title": body.get("title"),
            "tags": body.get("tags") or [],
            "author": body.get("author") or "玩家",
            "source": body.get("source") or "ace-extension",
            "coverFingerprint": body.get("coverFingerprint"),
            "coverSeed": body.get("coverSeed"),
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        tracks.append(rec)
        self._save_tracks(tracks)
        print(f"[relay] 新曲目上墙 -> {tid} 《{rec['title']}》by {rec['author']}")
        self._json(200, {"id": tid})

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"ACE-Step 1.5 relay 监听 0.0.0.0:{PORT}")
    print(f"  -> 转发到同机 acestep-api: {ACE_API}")
    print(f"  -> 生成音频存于: {GENERATED_DIR}")
    print(f"  -> 前端请填: http://<本机局域网IP>:{PORT}")
    print(f"  -> 记得 Windows 防火墙放行 {PORT} 入站")
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
