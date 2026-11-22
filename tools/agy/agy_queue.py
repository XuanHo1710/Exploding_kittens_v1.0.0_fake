#!/usr/bin/env python3
"""
One-at-a-time queue of headless agy requests (each `agy -p` is a NEW agy session with no memory: the request text
carries everything). Waits out image-model rate limits (429 / quota): when a run reports one, the same request goes
back to the front of the queue and the runner sleeps until the time agy names (or 20 minutes).

  python3 tools/agy/agy_queue.py add <species-key> <request text | @file>   # enqueue (used by auto_fix.py)
  python3 tools/agy/agy_queue.py list
  python3 tools/agy/agy_queue.py run                                         # the runner (prints one line per event)
Queue: tmp/agy-requests/queue.json; logs: tmp/agy-requests/<key>-<time>.log
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
DIR = os.path.join(REPO, "tmp", "agy-requests")
QUEUE = os.path.join(DIR, "queue.json")
STATE = os.path.join(DIR, "queue-state.json")
CMDS = ("python3", "python", "bash", "sh", "cp", "mv", "mkdir", "ls", "rm", "cat", "head", "tail", "grep", "find", "sed",
        "awk", "wc", "sort", "uniq", "cut", "tr", "echo", "printf", "cd", "pwd", "test", "file", "stat", "du", "diff",
        "cmp", "touch", "date", "which", "env", "xargs", "tee", "curl", "wget", "true", "sleep", "basename", "dirname",
        "realpath", "readlink", "md5sum", "identify", "convert",
        os.environ.get("MONS_PY3D") or "/home/huy/vya-ocr-staging/.venv/bin/python",       # 3D pose guides (numpy)
        os.environ.get("MONS_AGY_PY") or "/snap/antigravity-cli/24/usr/bin/python3.14")    # agy Pillow
ALLOW = {"permissions": {"allow": [f"command({c})" for c in CMDS] +
                         [f"{t}({d})" for t in ("read_file", "write_file") for d in (REPO, "/tmp/mons-refs", "/tmp")] +
                         ["read_url(*)"]}}
AGY_PREFIX = os.environ.get("MONS_AGY_PREFIX") or "/snap/antigravity-cli/"   # install dir of the agy binary (/proc match)
RULES_FILE = os.path.join(REPO, "tools", "agy", "agy_rules.md")   # re-read before every request
DENIED = re.compile(r"auto-denied|cannot prompt for", re.I)
LIMIT = re.compile(r"429|RESOURCE_EXHAUSTED|quota|rate.?limit|chạy lại yêu cầu (này )?sau|try again (after|later)"
                   r"|UNAVAILABLE|No capacity available|code 503", re.I)      # 503: the model servers are full
MOVES = os.path.join(REPO, "data", "battle", "moves.json")
TRIES = os.path.join(DIR, "move-tries.json")


def move_missing(key):
    """move-<identifier> requests: the 2 images the run had to write that are not there"""
    if not key.startswith("move-"):
        return []
    ident = key[len("move-"):]
    m = next((x for x in load(MOVES, {}).get("moves", []) if x["identifier"] == ident), None)
    if not m:
        return []
    folder = re.sub(r"[^A-Za-z0-9]+", "-", re.sub(r"[’'.,:]", "", m["name"])).strip("-")
    d = os.path.join(REPO, "assets", "skills", m["gen"], folder)
    return [k for k in ("cast", "effect") if not os.path.isfile(os.path.join(d, f"{ident}-{k}.png"))]
WHEN = re.compile(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)Z")


def load(p, default):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save(p, data):
    os.makedirs(DIR, exist_ok=True)
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def add(key, text):
    q = load(QUEUE, [])
    if any(r["key"] == key and r["text"] == text for r in q):
        print(f"QUEUED already {key}"); return
    q.append({"key": key, "text": text, "added": time.strftime("%H:%M:%S")})
    save(QUEUE, q)
    print(f"QUEUED {key} (#{len(q)} in queue)")


CONFIG = os.path.join(DIR, "queue-config.json")   # {"workers": 3}; re-read every loop, so it can be changed live


def species_of(key):
    """request key -> species: '<slug>-movement-…' / '<slug>-battle-…'"""
    for k in ("-movement", "-battle"):
        if k in key:
            return key.split(k)[0]
    return key


def agy_procs():
    """{pid: command line} of every headless agy run (also ones started before this runner)"""
    out = {}
    for pid in os.listdir("/proc"):          # full command lines (pgrep -a cuts long ones)
        if pid.isdigit():
            try:
                cmd = open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", "replace").replace("\0", " ")
            except OSError:
                continue
            if cmd.startswith(AGY_PREFIX) and " -p " in cmd[:80]:
                out[int(pid)] = cmd
    return out


def finish(req, log, running_note=""):
    """handle a finished run: 'done' (popped), 'limit' or 'denied' (kept in the queue)"""
    out = open(log, encoding="utf-8", errors="replace").read().split("---- agy ----", 1)[-1] if log else ""
    if log and DENIED.search(out) and len(out.strip()) < 600:
        save(STATE, {"not_before": time.time() + 3600})
        print(f"PERMISSION-DENIED {req['key']}: agy needed a command outside the allow list; the request stays in the queue, "
              f"queue paused 1 h (see agy's log in ~/snap/antigravity-cli/common/.gemini/antigravity-cli/log)", flush=True)
        return
    if log and LIMIT.search(out):
        m = WHEN.findall(out)
        until = (dt.datetime.fromisoformat(m[-1]).replace(tzinfo=dt.timezone.utc).timestamp() + 60) if m else time.time() + 1200
        save(STATE, {"not_before": max(until, load(STATE, {}).get("not_before", 0))})
        print(f"RATE-LIMITED {req['key']}: all workers wait until {time.strftime('%H:%M', time.localtime(until))}, then it is retried", flush=True)
        return
    missing = move_missing(req["key"])
    if missing:                 # agy ended without the images (e.g. its image subagent failed): keep it, retry later
        tries = load(TRIES, {})
        tries[req["key"]] = tries.get(req["key"], 0) + 1
        save(TRIES, tries)
        if tries[req["key"]] < 3:
            save(STATE, {"not_before": max(time.time() + 600, load(STATE, {}).get("not_before", 0))})
            print(f"NO-IMAGES {req['key']}: missing {'+'.join(missing)} (try {tries[req['key']]}/3); kept in the queue, "
                  f"all workers wait 10 min", flush=True)
            return
        print(f"GAVE UP {req['key']}: still missing {'+'.join(missing)} after 3 tries", flush=True)
    q = load(QUEUE, [])
    q = [r for r in q if not (r["key"] == req["key"] and r["text"] == req["text"])]
    save(QUEUE, q)
    tail = out.strip().splitlines()[-1][:200] if out.strip() else running_note or "(no output)"
    print(f"DONE {req['key']}: {tail} | {len(q)} left", flush=True)


def run():
    print(f"QUEUE runner started, {len(load(QUEUE, []))} request(s) waiting", flush=True)
    running = {}          # key -> (proc or pid, req, log)
    while True:
        workers = int(load(CONFIG, {}).get("workers", 3))
        q = load(QUEUE, [])
        procs = agy_procs()
        # runs started outside this runner (an earlier runner): adopt them by their request text
        for r in q:
            if r["key"] not in running:
                for pid, cmd in procs.items():
                    if r["text"][:300] in cmd:
                        running[r["key"]] = (pid, r, None)
                        print(f"ADOPTED {r['key']} (agy pid {pid}, started before this runner)", flush=True)
        # finished runs
        for key, (p, req, log) in list(running.items()):
            alive = p.poll() is None if hasattr(p, "poll") else p in agy_procs()
            if not alive:
                del running[key]
                finish(req, log, "(adopted run finished; see its log)")
        st = load(STATE, {})
        if time.time() < st.get("not_before", 0) or max(len(running), len(agy_procs())) >= workers:
            time.sleep(10)
            continue
        # next request: the first one of its species in the queue, species not busy (battle waits for its movement)
        busy = {species_of(k) for k in running}
        seen, pick = set(), None
        for r in load(QUEUE, []):
            sp = species_of(r["key"])
            if sp not in busy and sp not in seen and r["key"] not in running:
                pick = r
                break
            seen.add(sp)
        if not pick:
            time.sleep(10)
            continue
        log = os.path.join(DIR, f"{pick['key']}-{time.strftime('%H%M%S')}.log")
        open(log, "w", encoding="utf-8").write(pick["text"] + "\n\n---- agy ----\n")
        rules = open(RULES_FILE, encoding="utf-8").read().strip() + "\n\n" if os.path.isfile(RULES_FILE) else ""
        p = subprocess.Popen(["agy", "-p", rules + pick["text"], "--settings", json.dumps(ALLOW), "--print-timeout", "0"], cwd=REPO,
                             stdout=open(log, "a"), stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
        running[pick["key"]] = (p, pick, log)
        print(f"SENT {pick['key']} -> {os.path.relpath(log, REPO)} ({len(running)}/{workers} running)", flush=True)
        time.sleep(15)    # agy start-up: do not start two sessions in the same second


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("add", "list", "run"):
        sys.exit(__doc__)
    if a[0] == "add":
        text = a[2]
        if text.startswith("@"):
            text = open(text[1:], encoding="utf-8").read()
        add(a[1], text)
    elif a[0] == "list":
        st = load(STATE, {})
        if st.get("not_before", 0) > time.time():
            print("paused until", time.strftime("%H:%M", time.localtime(st["not_before"])))
        for i, r in enumerate(load(QUEUE, []), 1):
            print(f"{i}. {r['key']} (added {r['added']}): {r['text'][:120]}…")
    else:
        run()


if __name__ == "__main__":
    main()
