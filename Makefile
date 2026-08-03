setup:
	pnpm install

dev:
	trap 'kill 0' EXIT INT; pnpm --filter @grand/server dev & pnpm --filter @grand/client dev & wait

test:
	pnpm typecheck && pnpm test && pnpm --filter @grand/client build

db-reset:
	rm -f packages/server/grand.db*
