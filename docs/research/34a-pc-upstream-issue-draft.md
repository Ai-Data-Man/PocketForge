# 上游 issue 草稿：process-compose v1.122.0 project update 首次调用必全表重启（Vars 类型漂移）

> 用途：用户审核后提交至 github.com/F1bonacc1/process-compose。本文件是草稿，未发布。
> 依据：docs/research/34-s97-f12-hotreg-mechanism-verdict.md（源码行号+微型实例活体双证，2026-09-18）。

---

**Title:** `project update` restarts ALL processes on the first call after daemon start (Vars int→float64 JSON round-trip drift)

**Version:** v1.122.0 (Windows, also by code reading platform-independent)

**Summary**

`process-compose project update` marks every process as "updated" (and restarts them all) on the **first** `project update` call in a daemon's lifetime, even when the config is byte-identical. Subsequent identical updates report `No processes were updated`. This breaks hot-reload workflows where an update is expected to touch only the changed process — in our case a chat gateway process gets restarted by the first unrelated app registration, killing in-flight sessions.

**Root cause (source reading + repro)**

- The update client renders the project and POSTs it as JSON to the daemon (`src/client/project.go:51`).
- The templater injects `PC_REPLICA_NUM` as an **int** into every process's `Vars` (`src/templater/templater.go:32`); `Vars` is `map[string]any` (`src/types/project.go:10`).
- After the JSON round-trip the daemon side holds it as **float64**; the config comparison uses `reflect.DeepEqual` (`src/types/process.go:158`), which distinguishes `int(0)` from `float64(0)` → every process compares unequal.
- The daemon's stored project state converges to the JSON (float64) form after that first update, so the second and later updates are no-ops.

Decisive fork experiment: on a fresh daemon, POST `/project/configuration` (server-side reload, no client JSON round-trip) applies the same files with zero drift every time, while the client `project update` always drifts on first call. PRE/POST/POSTed-body JSON snapshots are byte-identical (the drift is masked by `omitempty`).

**Repro**

1. Start a project with ≥2 daemon processes: `process-compose up -f a.yaml -p 8099`.
2. Wait for healthy, note PIDs.
3. Run `process-compose project update -f a.yaml -p 8099` (identical file).
4. Observe: `Project updated successfully`, all processes restart (PIDs change).
5. Run the same update again: `No processes were updated`, nothing restarts.

**Impact**

Any first hot-update after daemon start restarts the entire stack, including processes the operator intended to leave untouched. On Windows this also kills any work happening inside processes' child trees.

**Suggested fixes (any one)**

- Normalize `Vars` numerics before comparison (compare `fmt.Sprint`-canonicalized values or convert int→float64 on load), or
- Have the client send `Vars` with JSON-native types matching what the daemon stores.

We currently work around it by issuing one no-op `project update` right after daemon start, before any interactive workload attaches.

---

（PocketForge 侧定案细节、源码行号、分叉实验设计：docs/research/34。）
