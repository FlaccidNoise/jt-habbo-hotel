# jt-habbo-hotel

Design docs live in `docs/` — the project is pre-code.

## Bug tracking (jtbug)

Work is tracked in jtbug, group `habbo`. The MCP server `jtbug` is registered via `.mcp.json` (actor `claude-habbo`). Check `briefing` at session start. File discovered problems with `bug_create` into group `habbo` instead of fixing out-of-scope things inline. Reference bugs as `#N` in commits.

CLI fallback: `BUG_URL=https://${BUG_HOST} BUG_ACTOR=claude-habbo node <repos>/jtBugTracking/packages/cli/bin/bug.js <cmd>`
