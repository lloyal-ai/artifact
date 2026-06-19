# Artifact

A private AI workspace for research, reasoning, and source-backed work. Local agents run on your device; reviewed AgentApps add capabilities like web research and document search; permissions stay visible while they're active. GPU-native and fully local — no API keys, no inference servers.

> **Proprietary — © 2026 Lloyal AI. All rights reserved.** Private & confidential; not for redistribution. See `LICENSE`.

## Download

**macOS (Apple Silicon)** — [Artifact-latest-arm64.dmg](https://apps.lloyal.ai/download/Artifact-latest-arm64.dmg)

Open the `.dmg` and drag **Artifact** into your **Applications** folder. The app is signed with a Developer ID and notarized by Apple, so it launches with no Gatekeeper warnings.

### Requirements

- Apple Silicon Mac (M1 or newer) — models run on the GPU via Metal
- 16 GB unified memory recommended
- ~3 GB free disk for the local models (downloaded once, on first launch)

## What it does

- **Plan, then run.** Ask a question; a small planner decomposes it into research tasks. You review the plan and approve it — nothing runs until you say so.
- **Parallel research, one context.** Several agents run concurrently in a single shared GPU context, searching, fetching, and reranking sources *during* generation.
- **Source-backed answers.** You get a synthesized answer plus each agent's full report, written to `~/Documents/Artifact` — readable, diffable, shareable.
- **Fully local.** Every token is decoded on the device that asked the question. No API keys, no inference servers, no per-token fees.

First launch downloads the local models (~3 GB) once; after that Artifact runs offline.

## Local by default, permissions in view

Artifact runs models locally. When a capability needs more, the top bar surfaces the matching permission **while it's active**, so you can always see what the AI is touching:

- **Network** — a capability is reaching the network
- **Potential data egress** — data may be leaving your device
- **Local files** — a capability can read files you've pointed it at
- **Credentials** — a capability is using a stored secret

Capabilities ship as **reviewed AgentApps** from [apps.lloyal.ai](https://apps.lloyal.ai). Each declares its permissions up front; Artifact shows them on the welcome screen and lights them live as they're used.

## Built on the HDK

Artifact is built on Lloyal's **[Harness Development Kit](https://hdk.lloyal.ai/)** — models, agents, tools, and retrieval in one local-first runtime, no model server and no API keys. The same primitives ship agentic AI directly into desktop apps. To build something similar, read the [HDK docs](https://docs.lloyal.ai/).

## Building & releasing (maintainers)

This repo builds the distributable. Signing/notarization is **env-driven** (see `electron-builder.js`): with no Apple credentials in the environment you get an unsigned local build; with them present, `dist` signs + notarizes the app and notarizes + staples the dmg.

```bash
npm run dev       # run the app locally (Vite + Electron)
npm run dist      # build → sign → notarize app → notarize + staple dmg
npm run release   # dist, then upload the dmg to R2 (apps.lloyal.ai/download)
```

Signing requires, in the environment: `CSC_NAME` (Developer ID Application identity), plus notary credentials — `APPLE_API_KEY` (`.p8`) + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` + `APPLE_TEAM_ID`. `release` additionally needs `wrangler` authed for the `apps-lloyal-ai` bucket.

## License

**Proprietary — © 2026 Lloyal AI. All rights reserved.** Artifact is private and confidential; not licensed for redistribution or derivative use. See `LICENSE`. Its dependencies keep their own licenses: the HDK runtime (`@lloyal-labs/*`) is Fair Source (FSL-1.1-Apache-2.0), the `harness.dev` CLI is Apache-2.0.
