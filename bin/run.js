#!/usr/bin/env node
/**
 * Artifact — engine entry point. Loads the pre-built ESM bundle
 * (`dist/bundle.mjs`). Build with `npm run build`.
 */

import("../dist/bundle.mjs").catch((err) => {
  process.stderr.write(`Error: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
