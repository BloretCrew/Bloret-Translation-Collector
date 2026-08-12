#!/usr/bin/env python3
from pathlib import Path
import re

lines = Path("/data/Bloret-Translation-Collector/public/js/forms.js").read_text(encoding="utf-8").splitlines()
for i, l in enumerate(lines):
    if "保存失败" in l or ( "网络错误" in l and "BTC.t" not in l) or ('busyLabel: "创建' in l):
        print(i + 1, repr(l[:160]))

# Force replace known residual strings with replace_all style
p = Path("/data/Bloret-Translation-Collector/public/js/forms.js")
src = p.read_text(encoding="utf-8")
replacements = [
    ('"保存失败"', "BTC.t('保存失败')"),
    ("'保存失败'", "BTC.t('保存失败')"),
    ('"网络错误"', "BTC.t('网络错误')"),
    ("'网络错误'", "BTC.t('网络错误')"),
    ('"创建中..."', "BTC.t('创建中...')"),
    ("'创建中...'", "BTC.t('创建中...')"),
    ('"保存中..."', "BTC.t('保存中...')"),
    ("'保存中...'", "BTC.t('保存中...')"),
    ('"语言保存失败"', "BTC.t('语言保存失败')"),
    ("'语言保存失败'", "BTC.t('语言保存失败')"),
    ('"删除中..."', "BTC.t('删除中...')"),
    ("'删除中...'", "BTC.t('删除中...')"),
    ('"删除失败"', "BTC.t('删除失败')"),
    ("'删除失败'", "BTC.t('删除失败')"),
    ('"创建失败"', "BTC.t('创建失败')"),
    ("'创建失败'", "BTC.t('创建失败')"),
    ('"保存"', "BTC.t('保存')"),
    # careful with bare 保存 - only idleLabel contexts maybe too aggressive
    ('"保存 README"', "BTC.t('保存 README')"),
    ('"保存设置"', "BTC.t('保存设置')"),
    ('"创建项目"', "BTC.t('创建项目')"),
    ('"删除项目"', "BTC.t('删除项目')"),
    ('"删除文件"', "BTC.t('删除文件')"),
    ('"组织已更新"', "BTC.t('组织已更新')"),
]
# Avoid double wrapping: if already BTC.t('x') don't turn inner
n = 0
for old, new in replacements:
    # only replace when not already inside BTC.t(
    # simple: replace occurrences not preceded by BTC.t(
    parts = []
    last = 0
    start = 0
    while True:
        idx = src.find(old, start)
        if idx < 0:
            break
        prev = src[max(0, idx - 10) : idx]
        if prev.endswith("BTC.t(") or prev.endswith("t("):
            start = idx + len(old)
            continue
        parts.append(src[last:idx])
        parts.append(new)
        last = idx + len(old)
        start = last
        n += 1
    if parts:
        parts.append(src[last:])
        src = "".join(parts)

p.write_text(src, encoding="utf-8")
print("manual replacements", n)

# recount bare
left = 0
for i, l in enumerate(src.splitlines(), 1):
    if re.search(r'["\'][^"\']*[\u4e00-\u9fff]', l) and "BTC.t" not in l and not l.strip().startswith("//"):
        # still has quoted cjk without BTC.t on line
        if re.search(r"""['\"][^'\"]*[\u4e00-\u9fff][^'\"]*['\"]""", l):
            left += 1
            if left <= 25:
                print("left", i, l.strip()[:120])
print("left lines", left)
