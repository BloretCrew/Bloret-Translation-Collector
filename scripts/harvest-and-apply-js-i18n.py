#!/usr/bin/env python3
"""Extract all CJK string literals from public/js into lang/zh.json, then safe-wrap."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
zh_path = ROOT / "lang" / "zh.json"
zh = json.loads(zh_path.read_text(encoding="utf-8"))
cjk = re.compile(r"[\u4e00-\u9fff]")
# whole string literals only (no templates with ${ for safety — those need hand work)
STR = re.compile(r"""(['"])((?:\\.|[^\\${])*?)\1""")


def unescape(body: str) -> str:
    return (
        body.replace("\\'", "'")
        .replace('\\"', '"')
        .replace("\\n", "\n")
        .replace("\\\\", "\\")
    )


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def already(src: str, start: int) -> bool:
    left = src[max(0, start - 40) : start]
    return bool(re.search(r"BTC\.t\s*\(\s*$", left))


added = []
for p in sorted((ROOT / "public" / "js").glob("*.js")):
    src = p.read_text(encoding="utf-8")
    for m in STR.finditer(src):
        raw = unescape(m.group(2))
        if not cjk.search(raw):
            continue
        if len(raw) > 100:
            continue
        if any(ch in raw for ch in "<>{}"):
            continue
        if raw not in zh:
            zh[raw] = raw
            added.append(raw)

print("added to catalog", len(added))
for a in added[:40]:
    print(" ", repr(a))

zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
KEY_SET = {k for k in zh if cjk.search(k)}

# apply
total = 0
for p in sorted((ROOT / "public" / "js").glob("*.js")):
    src = p.read_text(encoding="utf-8")
    matches = []
    for m in STR.finditer(src):
        raw = unescape(m.group(2))
        if raw not in KEY_SET:
            continue
        if already(src, m.start()):
            continue
        matches.append((m.start(), m.end(), raw))
    if not matches:
        print(f"{p.name}: 0")
        continue
    chars = list(src)
    for start, end, raw in sorted(matches, key=lambda x: -x[0]):
        chars[start:end] = list(f"BTC.t('{js_escape(raw)}')")
    new_src = "".join(chars)
    p.write_text(new_src, encoding="utf-8")
    # syntax check immediately; rollback file on fail
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        p.write_text(src, encoding="utf-8")
        print(f"{p.name}: ROLLBACK {len(matches)} — {r.stderr.splitlines()[-1] if r.stderr else 'err'}")
    else:
        print(f"{p.name}: {len(matches)} OK")
        total += len(matches)

# rebuild en
subprocess.check_call(["python3", str(ROOT / "scripts" / "build-en-catalog.py")])
print("total applied", total, "keys", len(zh))
