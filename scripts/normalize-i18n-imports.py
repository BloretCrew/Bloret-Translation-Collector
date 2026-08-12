#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for p in (ROOT / "src").rglob("*.ts"):
    if p.name.endswith(".test.ts"):
        continue
    s = p.read_text(encoding="utf-8")
    lines = s.splitlines(True)
    out = []
    seen = False
    changed = False
    for line in lines:
        m = re.match(
            r"""^import\s*\{([^}]*)\}\s*from\s*['\"]@/lib/i18n['\"];\s*$""",
            line,
        )
        if m:
            if seen:
                changed = True
                continue
            seen = True
            names = [x.strip() for x in m.group(1).split(",") if x.strip()]
            uniq: list[str] = []
            for n in names:
                if n not in uniq:
                    uniq.append(n)
            if "t" in uniq:
                uniq = ["t"] + [x for x in uniq if x != "t"]
            new = f'import {{ {", ".join(uniq)} }} from "@/lib/i18n";\n'
            if new != line:
                changed = True
            out.append(new)
            continue
        out.append(line)
    new = "".join(out)
    if not s.endswith("\n") and new.endswith("\n"):
        new = new[:-1]
    if new != s:
        p.write_text(new, encoding="utf-8")
        print("fixed", p.relative_to(ROOT))
print("done")
