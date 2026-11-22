"""Sprite folder report: missing -movement sheets, empty folders, folders not created yet, extra files.

usage: python3 tools/mistakes.py [repo-root]   -> <repo-root>/tmp/reports/mistakes.md (git-ignored, regenerate any time)
"""
import os, re, sys, glob, unicodedata

if any(a in ("-h", "--help") for a in sys.argv[1:]):
    print(__doc__); sys.exit(0)
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DEX = os.path.join(ROOT, "assets", "units")
ROW = re.compile(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|")

def slug(name):
    s = name.lower().replace("♀", "-f").replace("♂", "-m")
    s = re.sub(r"['’.]+", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

def ranges(nums):
    out, start, prev = [], None, None
    for n in nums:
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append((start, prev)); start = prev = n
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"#{a:03d}" if a == b else f"#{a:03d}–#{b:03d}" for a, b in out)

partial, empty, extra, legacy = [], [], [], []
summary = []
for gen_dir in sorted(glob.glob(os.path.join(DEX, "Gen*"))):
    gen = os.path.basename(gen_dir)
    mds = glob.glob(os.path.join(gen_dir, "gen[0-9]*.md"))
    if not mds:  # Gen6+ folders (e.g. Gen6-Kalos) have no species list yet: nothing to check against
        continue
    md = mds[0]
    mons = {}
    for line in open(md, encoding="utf-8"):
        m = ROW.match(line)
        if m:
            mons[int(m.group(1))] = m.group(2)
    done, todo = 0, []
    expected_dirs = set()
    for no, name in sorted(mons.items()):
        folder = f"{no:03d}-{name}"
        expected_dirs.add(folder)
        path = os.path.join(gen_dir, folder)
        files = {f"{slug(name)}-movement.png"}            # posses dropped 2026-11-18 (optional, never "missing")
        optional = {f"{slug(name)}-posses.png"}
        if not os.path.isdir(path):
            todo.append(no)
            continue
        have = set(os.listdir(path))
        missing = sorted(files - have)
        if have - files - optional:
            extra.append((gen, folder, sorted(have - files - optional)))
        if not have:
            empty.append((gen, folder))
        elif missing:
            partial.append((gen, folder, missing))
        else:
            done += 1
    for d in sorted(os.listdir(gen_dir)):
        if os.path.isdir(os.path.join(gen_dir, d)) and d not in expected_dirs:
            legacy.append((gen, d))
    summary.append((gen, len(mons), done, todo))

L = ["# Mistakes — thư mục / file sprite còn thiếu", "",
     "Mỗi thư mục Pokémon cần file `<slug>-movement.png` (sheet posses không còn được tạo, file cũ vẫn giữ) "
     "(xem `.agents/skills/expedition-sprite-generator/SKILL.md`).", "",
     "## Tổng quan", "",
     "| Thế hệ | Tổng | Đã đủ 2 file | Thiếu file | Thư mục rỗng | Chưa tạo thư mục |",
     "|---|---:|---:|---:|---:|---:|"]
for gen, total, done, todo in summary:
    np = sum(1 for g, *_ in partial if g == gen)
    ne = sum(1 for g, _ in empty if g == gen)
    L.append(f"| {gen} | {total} | {done} | {np} | {ne} | {len(todo)} |")
L.append("")

no_move = [(g, f) for g, f, miss in partial if any(x.endswith("-movement.png") for x in miss)] + list(empty)
no_move.sort(key=lambda x: (x[0], x[1]))
L += ["## ⚠️ Thiếu file movement", "",
      f"Thư mục đã tạo nhưng chưa có `<slug>-movement.png`: **{len(no_move)}**", ""]
if no_move:
    L += ["| Thế hệ | Thư mục | File cần tạo |", "|---|---|---|"]
    L += [f"| {g} | `{f}` | `{slug(f.split('-', 1)[1])}-movement.png` |" for g, f in no_move]
else:
    L.append("_Không có._")
L.append("")

L += ["## 1. Thư mục thiếu file", ""]
if partial:
    L += ["| Thế hệ | Thư mục | File còn thiếu |", "|---|---|---|"]
    L += [f"| {g} | `{f}` | " + ", ".join(f"`{x}`" for x in miss) + " |" for g, f, miss in partial]
else:
    L.append("_Không có._")
L.append("")

L += ["## 2. Thư mục rỗng (đã tạo nhưng chưa có file nào)", ""]
if empty:
    L += ["| Thế hệ | Thư mục | File còn thiếu |", "|---|---|---|"]
    for g, f in empty:
        s = slug(f.split("-", 1)[1])
        L.append(f"| {g} | `{f}` | `{s}-movement.png` |")
else:
    L.append("_Không có._")
L.append("")

L += ["## 3. Chưa tạo thư mục", ""]
for gen, total, done, todo in summary:
    if todo:
        L.append(f"- **{gen}** ({len(todo)}): {ranges(todo)}")
L.append("")

if extra or legacy:
    L += ["## 4. Cần dọn dẹp", ""]
    for g, f, xs in extra:
        L.append(f"- `{g}/{f}`: file thừa " + ", ".join(f"`{x}`" for x in xs))
    for g, d in legacy:
        L.append(f"- `{g}/{d}`: thư mục sai tên (không theo dạng `<NNN>-<Tên>`)")
    L.append("")

OUT = os.path.join(ROOT, "tmp", "reports", "mistakes.md")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write("\n".join(L))
print("\n".join(L[:12]))
print(f"partial={len(partial)} empty={len(empty)} extra={len(extra)} legacy={len(legacy)}")
