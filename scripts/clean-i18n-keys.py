#!/usr/bin/env python3
"""Clean junk keys from lang/zh.json after extract."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CJK = re.compile(r"[\u4e00-\u9fff]")

zh_path = ROOT / "lang" / "zh.json"
en_path = ROOT / "lang" / "en.json"
zh = json.loads(zh_path.read_text(encoding="utf-8"))

drop = []
for k in list(zh.keys()):
    reason = None
    if "\n" in k or "\r" in k:
        reason = "multiline"
    elif len(k) > 100:
        reason = "too long"
    elif any(x in k for x in ("app.use(", "res.locals", "import {", "i18nMiddleware", "optional)", "- label:")):
        reason = "code-ish"
    elif k.count("'") >= 2 or k.count('"') >= 2:
        reason = "quotes"
    elif not CJK.search(k):
        reason = "no-cjk"
    # single char that's not common UI — keep 条 etc for now
    if reason:
        drop.append((reason, k))
        del zh[k]

print("dropped", len(drop))
for r, k in drop[:30]:
    print(r, repr(k)[:80])

zh_path.write_text(json.dumps(zh, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
# keep en in sync keys (identity until translated)
en = {k: zh[k] for k in zh}
en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("keys left", len(zh))
