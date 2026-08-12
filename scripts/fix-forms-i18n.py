#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / "public" / "js" / "forms.js"
src = p.read_text(encoding="utf-8")
cjk = re.compile(r"[\u4e00-\u9fff]")
zh = json.loads((ROOT / "lang" / "zh.json").read_text(encoding="utf-8"))


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already(text: str, start: int) -> bool:
    left = text[max(0, start - 60) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left))


pattern = re.compile(r"""(['"])((?:\\.|[^\\])*?)\1""")
matches = []
for m in pattern.finditer(src):
    body = m.group(2)
    raw = (
        body.replace("\\'", "'")
        .replace('\\"', '"')
        .replace("\\n", "\n")
        .replace("\\\\", "\\")
    )
    if not cjk.search(raw):
        continue
    if len(raw) > 120 or any(ch in raw for ch in "<>{}"):
        continue
    if already(src, m.start()):
        continue
    matches.append((m.start(), m.end(), raw))

print("found", len(matches))
for _, _, raw in matches[:30]:
    print(repr(raw))

chars = list(src)
for start, end, raw in sorted(matches, key=lambda x: -x[0]):
    chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
    zh.setdefault(raw, raw)
p.write_text("".join(chars), encoding="utf-8")
print("replaced", len(matches))
(ROOT / "lang" / "zh.json").write_text(
    json.dumps(zh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
en_path = ROOT / "lang" / "en.json"
en = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
for k in zh:
    en.setdefault(k, k)
en_path.write_text(
    json.dumps({k: en.get(k, k) for k in zh}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
