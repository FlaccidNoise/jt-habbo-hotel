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

db-reset:
	rm -f packages/server/grand.db*
