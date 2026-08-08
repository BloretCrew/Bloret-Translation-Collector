#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess

ok = True
for p in sorted(Path("public/js").glob("*.js")):
    r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        ok = False
        print("FAIL", p)
        print(r.stderr[:400])
    else:
        print("OK", p.name)
print("all ok" if ok else "HAS FAILS")

s = Path("public/js/forms.js").read_text(encoding="utf-8")
print("--- toast samples ---")
for i, l in enumerate(s.splitlines(), 1):
    if "toast(" in l and ("BTC.t" in l or any(x in l for x in ("更新", "删除", "README", "成功"))):
        print(f"{i}:{l.strip()[:140]}")

print("--- bare ---")
n = 0
for i, l in enumerate(s.splitlines(), 1):
    if "BTC.t" in l or l.strip().startswith("//") or l.strip().startswith("*"):
        continue
    m = re.findall(r"""['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]""", l)
    if m:
        n += 1
        if n <= 20:
            print(i, m)
print("bare lines", n)
