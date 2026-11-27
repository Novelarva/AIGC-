#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
队友部署后一键自检：确认 acestep-api + relay 整条链路是通的。
跑法：python smoke_test.py
全部 [OK] 后，把 relay 的局域网地址（http://<你机IP>:8010）发给友友填进游戏 .env。
"""
import urllib.request
import json
import sys

ACE = "http://localhost:8001"
RELAY = "http://localhost:8010"


def get(url, timeout=15):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except Exception as e:
        return None, str(e)


def post(url, payload, timeout=600):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "ignore")
    except Exception as e:
        return None, str(e)


print("== 1) acestep-api 是否起来 ==")
st, body = get(f"{ACE}/v1/models")
print("  GET /v1/models ->", st, (body[:100] if body else ""))
if st != 200:
    print("  [FAIL] acestep-api 没起来。先 `uv run acestep-api` 并等模型加载完（首次会下载约 10GB）。")
    sys.exit(1)
print("  [OK]")

print("== 2) relay 是否起来 ==")
st, body = get(f"{RELAY}/health")
print("  GET /health ->", st, body)
if st != 200:
    print("  [FAIL] relay 没起来。另开一个终端 `python relay_server.py`。")
    sys.exit(1)
print("  [OK]")

print("== 3) 端到端冒烟（text2music 15s，不需参考音频）==")
st, body = post(
    f"{RELAY}/api/extend",
    {"prompt": "test instrumental electronic loop, bright synth", "taskType": "text2music", "duration": 15},
)
print("  POST /api/extend ->", st)
if st != 200:
    print("  [FAIL] 端到端失败：", body[:300])
    sys.exit(1)
data = json.loads(body)
if not data.get("audioUrl"):
    print("  [FAIL] 没返回 audioUrl：", body[:300])
    sys.exit(1)
print("  [OK] audioUrl =", data["audioUrl"])

print("\n全部通过 ✅  把 relay 的局域网地址（http://<你机IP>:8010）发给友友，")
print("填进游戏根目录 .env 的 VITE_ACE_API_BASE 即可接入前端。")
