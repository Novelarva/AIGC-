# 操作单：给音乐游戏的中转服务配一个「永久固定」的公网地址

> 这份文档可以直接丢给 AI，让 AI 一步步指导操作。
> 目标：把现在那个「每次重启就变」的临时地址，换成**永久不变**的公网地址。

---

## 【给 AI 的上下文】先读这段

这台 **Windows** 电脑上已经跑着两个服务：

1. **ACE-Step 音乐生成服务**：`uv run acestep-api`，监听 `127.0.0.1:8001`
2. **中转服务** `relay_server.py`：监听 `0.0.0.0:8010`（纯 Python 标准库写的 HTTP 服务，自带 CORS）

现在需要给 **8010 端口**配一个**永久不变**的公网 HTTPS 地址，让一个网页能调用它。
方案用 **Tailscale Funnel**（免费、地址永久不变、开机自启、重启机器也不用重配）。

请你（AI）按下面步骤**逐条指导用户执行**，每条给出确切命令并简要解释为什么。
遇到报错就解释原因再给下一步。全部做完后，帮用户确认最后那个网址能打开。

---

## 前置条件（确认一下再开始）

- [ ] 这台电脑能上网。
- [ ] `acestep-api`（8001）和 `relay_server.py`（8010）**正在运行**。
- [ ] 有一个能接收验证的账号（Google / 微软 / GitHub / 邮箱都行，Tailscale 免费版够用）。

---

## 步骤

### 第 1 步：安装 Tailscale
打开 **PowerShell**（开始菜单搜 PowerShell 即可），运行：

```powershell
winget install --id tailscale.tailscale -e
```

> 如果 `winget` 不可用，就去官网下载安装包：https://tailscale.com/download/windows

### 第 2 步：登录
安装完成后，任务栏右下角会出现 Tailscale 图标。点它 → **Sign in** → 用你的账号登录。

### 第 3 步：记录这台机器的名字
浏览器打开管理后台：https://login.tailscale.com/admin/machines
找到这台机器，记下它的名字（形如 `desktop-xxxx`）。后面网址里会用到。名字不好记可以顺手改简单点。

### 第 4 步：开启 HTTPS 证书（Funnel 必需）
浏览器打开：https://login.tailscale.com/admin/dns
找到 **HTTPS Certificates**，点 **Enable**。

### 第 5 步：把 8010 端口发布给公网
回到 PowerShell，运行：

```powershell
tailscale funnel --bg 8010
```

- **第一次运行**通常不会直接成功，而是提示类似：
  `Funnel is not enabled on your tailnet. To enable, visit: https://login.tailscale.com/f/funnel?...`
  → **复制那个链接到浏览器打开，点启用（Enable Funnel）**，然后回到 PowerShell 再跑一次上面的命令。
- 成功后会打印出一个网址，形如：

  ```
  https://desktop-xxxx.你的tailnet名.ts.net
  ```

- 如果提示命令不认识 `--bg`，就把命令换成：`tailscale funnel 8010`

> **这个网址就是你要的「永久固定地址」。** 重启电脑、重开服务，它都不会变。

### 第 6 步：验证它真的通了
在 PowerShell 里运行（把网址换成上一步拿到的）：

```powershell
curl https://desktop-xxxx.你的tailnet名.ts.net/health
```

**期望看到**类似这样的返回：

```json
{"status": "ok", "relay": "ace-step-1.5", "ace_api": "http://127.0.0.1:8001"}
```

看到 `status: ok` 就说明成了。也可以直接用浏览器打开那个 `/health` 网址看。

---

## 做完之后，只需要发回一个东西

把第 5 步拿到的固定网址（**去掉结尾的斜杠**）发回来，例如：

```
https://desktop-xxxx.你的tailnet名.ts.net
```

对方（我）会把它填进游戏配置、重新发一次。发完就**彻底结束**——以后每天不用再抄地址、不用再发链接。

---

## 常见问题

**Q：电脑重启后还要再操作一遍吗？**
不用。Tailscale 会开机自启，Funnel 配置也是持久的。只要这台电脑开着、那两个服务在跑，网址就一直有效。

**Q：免费的够用吗？**
够。Tailscale Funnel 免费版就能用，做个演示绰绰有余。

**Q：占资源吗？**
几乎不占。Tailscale 只是个很轻的网络组件。

**Q：万一想撤销这个公网地址？**
运行 `tailscale funnel reset` 即可关闭。

**Q：验证时 `/health` 打不开或超时？**
1. 先确认 `relay_server.py`（8010）还在跑；
2. 确认 Tailscale 已登录（图标不是灰色）；
3. 确认第 4 步的 HTTPS 证书已 Enable；
4. 再跑一次 `tailscale funnel --bg 8010`，看有没有报错。

**Q：这台不是 Windows 电脑？**
命令基本一样：装 Tailscale → 登录 → 开 HTTPS 证书 → `tailscale funnel --bg 8010`。只是安装方式按 macOS/Linux 对应来。
