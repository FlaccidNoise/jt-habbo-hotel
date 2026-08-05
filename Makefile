# NPC live model (decision 2026-08-04, #204). Override or blank NPC_LLM_MODEL for canned-only.
# Ollama down → connection error per attempt, logged npc_llm_error, canned fallback.
export NPC_LLM_URL ?= http://localhost:11434/v1
export NPC_LLM_MODEL ?= gemma3:4b

setup:
	pnpm install

dev:
	trap 'kill 0' EXIT INT; pnpm --filter @grand/server dev & pnpm --filter @grand/client dev & wait

# Production: built client + /api + /ws on one port (8080).
# Public exposure is a separate, manual step: tailscale funnel --bg 8080
serve:
	pnpm --filter @grand/client build
	STATIC_DIR=$(CURDIR)/packages/client/dist pnpm --filter @grand/server start

test:
	pnpm typecheck && pnpm test && pnpm --filter @grand/client build

# Regenerate the frozen furni bundles in packages/client/public/furni. The golden-hash test
# fails until intentional style changes are regenerated and committed.
gen:
	pnpm --filter @grand/generator generate

db-reset:
	rm -f packages/server/grand.db*
