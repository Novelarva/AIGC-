# 音乐扩展功能 · 后端对接契约（给队友 / 华工大佬）

> **更新 2026-09-12**：队友确认有 **~8GB 专用显存 N 卡**，可本地部署。本版以 **自部署（localhost:8001）** 为主路线，云 API 降为附录备选。
>
> ⚠️ **重要纠错**：项目里 `sunoClient.ts` 之前写的是 `/v1/music/generate` + `/v1/jobs/{id}` —— 这是**猜错的格式**。真实自部署接口是 **`/release_task` + `/query_result` + `/v1/audio`**（异步轮询）。对接层必须按本版真实规格改，不能沿用旧代码。
>
> ⚠️ **路线已定型为本地部署**：队友此前试过 Vercel 中转（Serverless 无 GPU，模型根本跑不了）+ 云 API（Audio Outpaint 按次收费很贵），均不可行。现统一走「本地部署 ACE-Step 1.5 + 本机 relay 中转」，免费且可控。**交付物已落地在 `src/api/deploy/`**：`relay_server.py`（可直接跑的中转后端）、`smoke_test.py`（一键自检）、`DEPLOY_GUIDE.md`（队友照抄步骤）。前端 `sunoClient.ts` 已改为只调 relay 的 `/api/extend`，不再直连 8001。

---

## 0. 架构（自部署版）

```
[游戏前端]  ──HTTP──▶  [队友中转后端 :你起的端口]  ──HTTP──▶  [acestep-api @ localhost:8001]
   发: 提示词+标签+原曲音频                              Key/地址只在队友机器,前端绝不碰
   收: 一个可播放的音频 URL
```

**铁律（踩过坑）**：
- 游戏前端**绝不能直接连 `localhost:8001`** —— `localhost` 指玩家自己的机器，而且浏览器跨域会拦。必须经队友的中转后端。
- 中转后端和 `acestep-api` 跑在**同一台队友机器**上，所以中转后端能用 `src_audio_path`（本地绝对路径）把原曲喂给模型，不用 base64 上传。

---

## 1. ACE-Step 自部署真实接口（端口 8001，FastAPI，自带 `/docs`）

> 队友 `uv run acestep-api` 起来后，直接浏览器开 **http://localhost:8001/docs** 就能看到所有端点和参数（Swagger 交互文档），联调时照着它看最准。

### 1.1 提交任务 `POST /release_task`（立即返回 task_id，不返回音频）

```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "upbeat electronic pop, strong beat, bright synth",
    "audio_duration": 45,          # 秒，别名 duration；范围 10~600
    "task_type": "cover",          # text2music | cover | repaint | lego | extract | complete
    "src_audio_path": "/tmp/ref.wav",   # cover/repaint 用：原曲在服务器上的绝对路径
    "inference_steps": 8,
    "use_random_seed": true
  }'
```

响应（统一包装）：
```json
{ "data": { "task_id": "550e8400-...", "status": "queued", "queue_position": 1 },
  "code": 200, "error": null, "timestamp": 1700000000000, "extra": null }
```

### 1.2 轮询结果 `POST /query_result`（status: 0=排队/跑 1=成功 2=失败）

```bash
curl -X POST http://localhost:8001/query_result \
  -H 'Content-Type: application/json' \
  -d '{ "task_id_list": ["550e8400-..."] }'
```

成功时 `result` 是个 **JSON 字符串**，解析后里面的 `file` 是音频 URL：
```json
{ "data": [ { "task_id": "550e8400-...", "status": 1,
    "result": "[{\"file\": \"/v1/audio?path=/tmp/api_audio/abc.mp3\", \"metas\": {\"bpm\":120,\"duration\":45,\"keyscale\":\"C Major\"}, ...}]" } ],
  "code": 200, "error": null }
```

### 1.3 下载音频 `GET /v1/audio?path=...`

```bash
curl "http://localhost:8001/v1/audio?path=%2Ftmp%2Fapi_audio%2Fabc.mp3" -o output.mp3
```

**完整异步流程**：`release_task` 拿 task_id → 循环 `query_result` 直到 status=1 → 用返回的 `file` URL 调 `/v1/audio` 下载。

---

## 2. 队友的中转后端（极简示例，Python 零依赖，给大佬直接跑）

前端不直接连 8001，这个后端替前端转。跑在队友机器、和 acestep-api 同机即可。

```python
import http.server, json, urllib.request, base64, tempfile, os, time

ACE = "http://localhost:8001"

def ace_post(path, payload):
    req = urllib.request.Request(ACE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/extend":
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n))
        prompt = body["prompt"]; task_type = body.get("task_type", "text2music")
        duration = body.get("duration", 45); audio_b64 = body.get("audioB64")

        # 原曲存本地临时文件（同机，acestep-api 可用 src_audio_path 访问）
        src_path = ""
        if audio_b64:
            fd, p = tempfile.mkstemp(suffix=".wav")
            os.write(fd, base64.b64decode(audio_b64)); os.close(fd)
            src_path = p

        # 1) 提交
        r = ace_post("/release_task", {"prompt": prompt, "audio_duration": duration,
                                       "task_type": task_type, "src_audio_path": src_path})
        tid = r["data"]["task_id"]
        # 2) 轮询（最多 ~2 分钟）
        audio_url = None
        for _ in range(60):
            q = ace_post("/query_result", {"task_id_list": [tid]})
            item = q["data"][0]
            if item["status"] == 1:
                audio_url = ACE + json.loads(item["result"])[0]["file"]
                break
            if item["status"] == 2:
                return self._send(500, {"error": "generation failed"})
            time.sleep(2)
        if not audio_url:
            return self._send(504, {"error": "timeout"})
        # 3) 下载音频，存到本后端可访问的路径，返回给前端
        mp3 = urllib.request.urlopen(audio_url, timeout=30).read()
        out = tempfile.mktemp(suffix=".mp3")
        open(out, "wb").write(mp3)
        self._send(200, {"audioUrl": f"http://<队友机IP>:{PORT}/files/{os.path.basename(out)}"})

    def _send(self, code, obj):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")   # 前端跨域
        self.end_headers()
        self.wfile.write(json.dumps(obj).encode())

PORT = 8010
http.server.HTTPServer(("0.0.0.0", PORT), H).serve_forever()
```

> 简化版：生产可换 FastAPI、加 `/files/` 静态路由、加并发队列。大佬按自己习惯改都行，接口契约不变。

---

## 3. 前端对接改动点（已完成 ✅）

`src/api/sunoClient.ts` 的 `runReal` **已改好**：直接 `POST {ACE_API_BASE}/api/extend`，body 为 `{prompt, tags, duration, taskType:"cover", audioB64, bpm}`，拿到 `audioUrl` 喂给 `ExtensionModal` 播放器。前端不再直连 8001。`ACE_API_BASE` 现已指向队友 relay（默认 `http://<队友机IP>:8010`），由 `.env` 的 `VITE_ACE_API_BASE` 配置；演示模式降级逻辑保留。

> 接口验证门槛不变：改动后必须 `tsc --noEmit` 零错误 + `vite build` 成功。

---

## 4. 挂音乐墙（已实现 ✅）

中继 `relay_server.py` 已实现曲目持久化，前端 `ExtensionModal` 在扩展曲试听后调用：

- `POST {MUSICWALL_API_BASE}/api/tracks`（新增一首）：
  body `{audioUrl, title, tags, author, source:"ace-extension", coverFingerprint, coverSeed}`
  → 返回 `{ id }`，并落盘到中继同目录的 `tracks.json`。
- `GET {MUSICWALL_API_BASE}/api/tracks`（拉取列表）：
  → 返回已发布曲目数组 `[{id, audioUrl, title, tags, author, source, coverFingerprint, coverSeed, createdAt}, ...]`
  **音乐墙栏目（队友独立 app）用这个接口把发布的曲子渲染到墙上**；`MUSICWALL_API_BASE` 默认复用
  `VITE_ACE_API_BASE`（即同一中继），若音乐墙是独立服务则单独填 `VITE_MUSICWALL_API_BASE`。

`coverFingerprint`/`coverSeed` 来自曲绘，音乐墙据此复现同一张封面，保持「曲↔图」一致。
前端 `publishTrack` 已在 `src/api/sunoClient.ts` 接好，无需再改；唯一前提是 `.env` 里
`VITE_ACE_API_BASE`（或 `VITE_MUSICWALL_API_BASE`）指向运行中的中继。

---

## 5. 演示保底（关键，别丢）

自部署在队友机器上，评审现场任何一环抖都可能影响：
- **超时（建议 5s）自动降级**到预置音频 `epic_trance_surge.mp3`（已接进 `public/audio/`）；
- 前端「AI 正在作曲…」加载动画 + 轮询，拿到 `audioUrl` 再播；
- **评审当天队友电脑必须开着、acestep-api + 中转后端都在跑** —— 这是本地方案的死穴，提前约好。

---

## 6. 安全 & 注意事项

- 中转后端只跑在队友内网/机器，**不要**把 `localhost:8001` 直接暴露公网（除非用 ngrok/反代）；
- 若游戏发布成公网链接、评委在自己浏览器打开，则中转后端也得能被评委访问（队友机公网 IP 或 ngrok），否则生成会失败、降级到预置；
- 自部署无 API Key、无第三方依赖，比云 API 更可控，但吃队友显卡+内存+常开。

---

## 附录：云 API 备选（仅当队友机器不可用 / 不想常开时用）

`POST https://api.acemusic.ai/v1/chat/completions`，`Authorization: Bearer ${ACE_MUSIC_API_KEY}`，模型 `acemusic/acestep-v15-turbo`，音频以 base64 内嵌响应。Key 只在后端 env，前端绝不碰。实测脚本见 `_verify/demo_audio/test_ace_cloud.py`。
（注：官网 api-key 页面当前有 400 bug 暂拿不到 Key，故云 API 暂不可行，优先走自部署。）

---

## 附：为什么是 ACE-Step

- Suno 走 API 要付费；TokenDance 只有 TTS 无音乐模型；
- Web Audio 只能加工、造不出新旋律（已实测听感差）；
- ACE-Step 是真·作曲模型，支持吃原曲做 `cover`/`repaint` —— 正好解决「扩展曲要跟原曲有共通感」，且队友有 N 卡可本地跑。
