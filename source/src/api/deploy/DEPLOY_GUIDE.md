# ACE-Step 1.5 本地部署 · 队友照抄指南

> 给队友看的。目标：在你带 N 卡的电脑上把模型跑起来，让游戏「扩成曲子」按钮能真生成。  
> AI这边已经把**中转后端 `relay_server.py`、自检 `smoke_test.py`、前端对接**全写好了，你只照下面步骤装依赖 + 起服务即可。

---

## 🤖 零经验版（推荐）：把整篇丢给你的 AI 跑

如果你有能**直接操作你电脑**的 AI 助手（WorkBuddy / Claude / Cursor / 任何「agent 模式」AI），**直接把本文件 + 同目录的 `relay_server.py` + `smoke_test.py` 这 3 个文件一起丢给它**，说一句：

> 「照这个指南在我电脑上把 ACE-Step 1.5 跑起来，跑完把 `http://<我的局域网IP>:8010` 告诉我。」

它会自己装 uv → 克隆 → 起两个服务 → 跑自检 → 查 IP，全程你基本不用动手，也不用懂终端。

⚠️ **但有两件事你的 AI 替你拍不了板，得你自己做**：

1. **内存腾挪**：你 16GB 现在 90% 占用。AI 不知道哪些程序能关，得你**先手动关掉**微信 / 游戏 / 虚拟机之类吃内存的，给模型留出 4–8GB。不腾的话生成时可能直接崩。
2. **评审当天电脑常开 + 防火墙放行 8010**：这是物理 / 决策项。AI 起完服务后，你别忘了让电脑一直开着、并在 Windows 防火墙弹窗点「允许访问」（或手动放行 8010 入站）。

> 如果你的 AI 只是「给命令让你自己跑」（不是真正能操作你终端的那种），那你还是得面对终端红字——这时下面「步骤」章节就是你该照抄的命令。

---

## 为什么不用 Vercel / 云 API（你之前踩的坑）

你之前遇到的困难，根因其实是同一个：**音乐模型需要 GPU，而 Vercel Serverless 没有 GPU；云 API（Audio Outpaint 等）按次收费很贵**。

正确路线 = **在你自己电脑上本地部署 ACE-Step 1.5**：

- 免费、无限次、用你自己的显卡跑；
- 中转后端 `relay_server.py` 也放你本机，不走 Vercel；
- 你约 **8GB 显存**完全够用（官方自动选 2B-turbo DiT + 0.6B LM）。

---

## 前置条件

- Windows + N 卡（约 8GB 显存；**正好 8GB 是临界值**，见下方报错速查的 OOM 处理）
- 已装 **Git**
- ⚠️ **Python 版本**：ACE-Step 要 **3.11 / 3.12**（不是 3.13、不是预发布版）。`uv` 一般会自动装好；若你机器只有 3.13 且 `uv` 没法联网拉 3.12，就会报 Python 相关错。
- ⚠️ **ffmpeg**：ACE-Step 处理音频需要 ffmpeg。没装的话「生成」会报音频错（甚至出来 0:00 的空文件）。装法：`winget install ffmpeg`（装完重启终端），或到 ffmpeg.org 下载。
- 能联网。**首次会从 HuggingFace 下载模型约 10GB**——⚠️ **国内直连 HuggingFace 经常超时 / 断流**，这是最常见的报错源头。请用下方「中国大陆必看」的 ModelScope 镜像源。
- ⚠️ **内存**：你 16GB 现在 90% 占用。部署 / 生成时尽量关掉别的吃内存软件，否则可能崩。

> ### 🇨🇳 中国大陆必看（大概率就是你报错的源头）
> ACE-Step 首次启动会去 **HuggingFace** 拉约 10GB 模型权重。国内直连 HuggingFace 经常超时、断流、卡死，
> 表现就是 `uv run acestep-api`（或启动脚本）卡在下载、或报 `ConnectionError` / `Read timed out` / 网络相关红字。
> **解决：把下载源切到 ModelScope（国内镜像）**，速度正常、几分钟到十几分钟下完。切换方法见步骤 3。
> （官方安装文档也专门为此加了 `DOWNLOAD_SOURCE` 开关，说明这是国内用户的普遍坑。）

---

## 步骤（照抄）

> ### 先选路线
> - **A. 最省事（推荐，要求显卡驱动支持 CUDA 12.8）**：用官方 **Windows 便携包**（`ACE-Step-1.5.7z`，自带 `python_embedded` + 所有依赖 + CUDA 12.8）。下载解压后**双击 `start_api_server.bat` 就能跑**，不用装 uv / Python / torch。适合不想折腾环境的人。
> - **B. 标准路线（本文档默认）**：uv 安装 + `uv run acestep-api`。下面按这条写；想用 A 就下载便携包解压、双击脚本即可，后续 relay 步骤不变。
>
> 不确定驱动版本？右键桌面 → NVIDIA 控制面板 → 系统信息，看「驱动程序版本」对应的 CUDA。驱动太旧就走 B，或先更新驱动再走 A。

### 1. 装 uv（Python 包管理器）

PowerShell 里跑：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

装完**重启一下 PowerShell**（或重开终端），让 `uv` 进 PATH。

### 2. 克隆并安装

```powershell
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5
# 先确保有 3.11/3.12（ACE-Step 不支持 3.13）。uv 会自动下载该版本，无需你手动装。
uv python install 3.12
uv sync
```

> 若 `uv sync` 报 Python 相关错，先确认上面 `uv python install 3.12` 成功执行了。

### 3. 起官方 REST API（终端 1，一直开着）

**推荐用官方启动脚本**（自动装 uv、检测环境、可配国内下载源，比手敲命令稳）：

```powershell
# 在 ACE-Step-1.5 目录下，用记事本打开 start_api_server.bat，把这一行取消注释并改成 modelscope：
#   set DOWNLOAD_SOURCE=--download-source modelscope
# 然后双击运行，或在这里跑：
.\start_api_server.bat
```

想手敲命令也行（先把下载源设成 modelscope）：

```powershell
$env:DOWNLOAD_SOURCE="--download-source modelscope"
uv run acestep-api
```

等出现 `Application startup complete`，默认 `http://localhost:8001`。  
首次会自动下载模型（约 10GB）：**用 modelscope 源几分钟到十几分钟；用 HuggingFace 源在国内可能卡很久或失败**。**别关这个终端。**  
⚠️ 若报音频 / ffmpeg 相关错，回步骤 1 之前先装好 ffmpeg（见前置条件）。

### 4. 起中转后端 relay（终端 2，一直开着）

`relay_server.py` 在游戏仓库的 `src/api/deploy/` 里。在该目录跑：

```powershell
cd <游戏仓库>\src\api\deploy
python relay_server.py
```

看到 `ACE-Step 1.5 relay 监听 0.0.0.0:8010` 即成功。  
Windows 防火墙弹窗&#x9009;**「允许访问」**；若没弹，手动放行 **8010 入站**（否则玩家浏览器连不上）。

### 5. 一键自检

```powershell
python smoke_test.py
```

三步全 `[OK]` 就通了。

### 6. 把地址发给AI

在队友机器查局域网 IP：

```powershell
ipconfig
```

看「IPv4 地址」（如 `192.168.1.50`）。把 `http://192.168.1.50:8010` 发给AI，他填进游戏根 `.env` 的 `VITE_ACE_API_BASE` 就接入了。

---

## 评审当天

- 你电脑必须开着，`acestep-api`（终端1）+ `relay_server.py`（终端2）都在跑。这是本地方案的死穴，提前约好。
- 如果评委在自己浏览器打开游戏**公网链接**，那你的 8010 也得能被公网访问（用 ngrok 或你机器有公网 IP）；否则评委那边生成会失败、自动降级到预置曲《Epic Trance Surge》。

---

## 常见报错速查

| 现象                         | 原因 / 解决                                                |
| -------------------------- | ------------------------------------------------------ |
| `uv : 无法识别` / No module    | 第 1 步 uv 没装好或没重启终端                                     |
| `acestep-api` 起不来 / 卡在下载   | 网络问题，或显存不够；8GB 一般 OK，内存吃紧就关软件                          |
| relay 起了但 `/api/extend` 超时 | 模型还在加载或生成慢，正常等；8 分钟仍超时再查 `acestep-api` 日志              |
| 玩家浏览器连不上 relay             | 防火墙没放行 8010，或地址 IP 写错（必须用队友机**局域网 IP**，不是 `localhost`） |
| 生成出来有杂音/太短                 | 正常波动，多试几次；时长由前端 `duration` 控制（10~600s）                 |
| 首次启动卡在下载 / 报 ConnectionError·Read timed out | **国内 HuggingFace 不通**：把下载源切 modelscope（步骤 3）                |
| `uv sync` 报 Python 3.13 / version 错 | `uv python install 3.12` 后再 `uv sync`（ACE-Step 不支持 3.13）          |
| 生成音频 0:00 / 报音频错            | 没装 ffmpeg：`winget install ffmpeg` 后重启终端                          |
| CUDA out of memory（8GB 临界）      | 关掉别的 GPU 程序；或设 `OFFLOAD_TO_CPU=true` / 用 DiT-only（禁用 LLM）   |
| 跑 relay 时 `python` 不是内部命令    | 用 `uv run python relay_server.py`，或先装 Python 并加 PATH            |

---

## 备注

- **纯音乐**：前端 cover 时已设无歌词（instrumental），生成的就是纯音乐。
- **「扩成曲子」用的是 cover 模式**：你游戏里的原曲当参考音频，模型生成更长的完整版，保留共通感。
- 不用付一分钱，不用 Vercel，不踩 Serverless 无 GPU 的坑。
