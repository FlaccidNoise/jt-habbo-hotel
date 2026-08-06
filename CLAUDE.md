# jt-habbo-hotel

The Grand — casino-resort social world. Spec: `docs/design/GAME.md` + `PIPELINES.md`. Decisions: `docs/decisions/INDEX.md`. Run: `make dev` (server 8080 + Vite 5173), `make serve` (production: built client + /api + /ws on 8080), `make test`, `make gen` (regenerate frozen furni bundles after style/part changes), `make art [PART=<id>]` (Blender render + post-pass + freeze for 3D-assisted parts; needs Blender on PATH — `PART=` skips the figure pass and still re-freezes every part, since the post-pass reads the whole accumulated meta.json), `make decor` (quantize + gate + freeze the flat-decor tiles from `tools/decor/source/*.png`; no Blender), `make db-reset` (wipe local accounts/rooms).

Economy and health graphs: `/metrics.html` (log in with any account; `GET /api/metrics` wants the token in an `Authorization: Bearer` header).

## Bug tracking (jtbug)

Work is tracked in jtbug, group `habbo`. The MCP server `jtbug` is registered via `.mcp.json` (actor `claude-habbo`). Check `briefing` at session start. File discovered problems with `bug_create` into group `habbo` instead of fixing out-of-scope things inline. Reference bugs as `#N` in commits.

Branch policy: one branch, `main`. Runner workers merge to it (tests-gated), interactive sessions commit to it directly. The old `dev` buffer was dropped (#273) — it went 58 commits stale in three days because nothing merged it forward, and every runner worker started from that stale tree.

CLI fallback: `BUG_URL=https://${BUG_HOST} BUG_ACTOR=claude-habbo node <repos>/jtBugTracking/packages/cli/bin/bug.js <cmd>`
