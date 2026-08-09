# The Grand

A casino-resort social world — an isometric hotel you walk around, decorate, and
share with other people. Inspired by Habbo Hotel and the browser social sims of
that era.

![TypeScript](https://img.shields.io/badge/TypeScript-3178c6) ![pnpm](https://img.shields.io/badge/pnpm-workspaces-f69220)

## Requirements

- **Node.js** 20+
- **pnpm** — `npm install -g pnpm`

Optional, only for regenerating art: **Blender** on `PATH` (`make art`).

## Run it

```bash
git clone https://github.com/FlaccidNoise/jt-habbo-hotel.git
cd jt-habbo-hotel
make setup
make dev
```

`make dev` starts the game server on **8080** and the Vite client on **5173**.
Open <http://localhost:5173>.

Nothing external is required — accounts and rooms live in a local SQLite file
created on first run.

## Make targets

| Target | Does |
|---|---|
| `make setup` | `pnpm install` |
| `make dev` | Server (8080) + Vite client (5173), hot reload |
| `make serve` | Production mode: built client + `/api` + `/ws` all on 8080 |
| `make test` | Typecheck, tests, and a client build |
| `make db-reset` | Wipe local accounts and rooms |
| `make gen` | Regenerate the frozen furniture bundles |
| `make art [PART=<id>]` | Blender render + post-pass for 3D-assisted parts |
| `make decor` | Quantize and freeze flat decor tiles |
| `make staff USER=<username>` | Flag an account as staff |

`make gen` matters if you change furniture styles: a golden-hash test fails
until the regenerated bundles are committed.

## Layout

```
packages/client/     Vite front end, isometric renderer
packages/server/     game server, REST /api + WebSocket /ws, SQLite
packages/shared/     types and protocol shared by both
packages/generator/  furniture and decor asset pipeline
tools/               Blender and decor source assets
docs/design/         GAME.md, PIPELINES.md
docs/decisions/      architecture decision records
```

## Environment variables

All optional — the defaults work for local play.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Server port |
| `DB_PATH` | `packages/server/grand.db` | SQLite file location |
| `STATIC_DIR` | unset | Serve a built client from this directory (`make serve` sets it) |
| `NPC_LLM_URL` | `http://localhost:11434/v1` | Ollama endpoint for live NPC dialogue |
| `NPC_LLM_MODEL` | `gemma3:4b` | NPC model — blank it for canned lines only |

NPC dialogue is the only feature that reaches outside the process, and it
degrades cleanly: with no Ollama running, NPCs fall back to canned lines and the
failure is logged rather than swallowed.

## Metrics

`/metrics.html` shows economy and health graphs. It requires a staff account —
`make staff USER=<username>` sets the bit. `GET /api/metrics` wants a bearer
token and returns 403 to a non-staff session.

## License

No license file yet — all rights reserved by default. Add one before reusing.
