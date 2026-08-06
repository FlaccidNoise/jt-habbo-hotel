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

# Flat decor (#260): quantize the authored rasters in tools/decor/source to the palette, gate
# them, and freeze one tile each. No Blender — the class is raster by design. Run it after
# editing a source PNG or a DECOR_CATALOG tile size, then `make gen` to publish.
decor:
	node --experimental-strip-types tools/decor/decorpass.ts --freeze

# 3D-assisted furni parts (#202): Blender renders each part white at 4 directions, the post-pass
# quantizes to the style.ts ramps, runs the gates, and freezes the passing bundles. Renders land
# in ART_DIR so a PART= re-render can merge into the existing meta.json.
#   make art             — every part
#   make art PART=<id>   — one part (plus any colorway built on it)
ART_DIR ?= /tmp/artgen
art:
	blender --background --factory-startup --python tools/artgen/rig.py -- \
		--out $(ART_DIR) $(if $(PART),--only $(PART))
	node --experimental-strip-types tools/artgen/postpass.ts $(ART_DIR) --freeze
# Figures only on a full run: --only renders that part and no figure, so figurepass would have
# no body to gate and would fail a render that actually succeeded.
	$(if $(PART),,node --experimental-strip-types tools/artgen/figurepass.ts $(ART_DIR) --freeze)
