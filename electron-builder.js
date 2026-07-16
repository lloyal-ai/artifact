// electron-builder packaging config (JS so signing can be ENV-DRIVEN).
//
// Native deps are node-addon-api (N-API) prebuilts — no node-gyp — so
// npmRebuild:false. macOS auto-selects the Metal binary (default darwin-arm64).
// asar:true with asarUnpack for the native package tree — the .node AND its
// sibling dylibs must live co-located on disk in app.asar.unpacked (natives
// can't be dlopen'd from inside asar; @loader_path resolves dylibs from the same
// bin/ dir). The engine is reasoning.run's prebuilt bin (node_modules/reasoning.run/
// bin/run.js) — pure JS, so it stays in asar; the utilityProcess forks it from the
// packaged production node_modules tree. Only the native lloyal.node is unpacked.
//
// ── SIGNING IS ENV-DRIVEN ───────────────────────────────────────────────────
// No Apple env present  → UNSIGNED build (local de-risk / preview the dmg).
// Apple env present      → Developer-ID signed + notarized, NO config change.
// Required Gatekeeper for ANY browser-downloaded dmg (independent of hosting on
// apps.lloyal.ai). A personal/individual Developer account is fine — Developer
// ID is the non-App-Store distribution path (the signature just shows your
// personal name until/unless you enrol as an Organization).
//
//   Cert (sign):      CSC_LINK = base64 of the Developer ID Application .p12
//                     CSC_KEY_PASSWORD = its password   (or have it in the keychain)
//   Notarize (key):   APPLE_API_KEY = path to AuthKey_XXXX.p8
//                     APPLE_API_KEY_ID, APPLE_API_ISSUER, APPLE_TEAM_ID
//                     (or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID)

const { execFileSync } = require('node:child_process')

const haveCert = !!process.env.CSC_LINK || !!process.env.CSC_NAME
const haveNotaryCreds =
  !!process.env.APPLE_API_KEY ||
  (!!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD)
const willSign = haveCert
const willNotarize = willSign && haveNotaryCreds

module.exports = {
  appId: 'ai.lloyal.artifact',
  productName: 'Artifact',
  directories: { output: 'release' },
  asar: true,
  asarUnpack: ['**/node_modules/@lloyal-labs/lloyal.node*/**'],
  npmRebuild: false,
  // App files; electron-builder adds the production node_modules tree — which is
  // where the forked engine lives (node_modules/reasoning.run/bin/run.js).
  files: ['out/**', 'package.json'],
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    target: ['dmg'],
    // identity:null forces an UNSIGNED build (preview). undefined lets
    // electron-builder auto-discover the Developer ID cert (CSC_LINK / keychain).
    identity: willSign ? undefined : null,
    hardenedRuntime: willSign,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    gatekeeperAssess: false,
    // Notarize only when signing AND notary creds are in env; reads APPLE_* / CSC_*.
    notarize: willNotarize,
  },
  // electron-builder notarizes + staples the .app BEFORE wrapping it (good for
  // launch), but leaves the .dmg wrapper unsigned. For a browser-downloaded dmg
  // to mount cleanly under Gatekeeper, notarize + staple the dmg itself too.
  afterAllArtifactBuild: (buildResult) => {
    if (!willNotarize) return []
    const dmgs = buildResult.artifactPaths.filter((p) => p.endsWith('.dmg'))
    const keyArgs = process.env.APPLE_API_KEY
      ? ['--key', process.env.APPLE_API_KEY, '--key-id', process.env.APPLE_API_KEY_ID, '--issuer', process.env.APPLE_API_ISSUER]
      : ['--apple-id', process.env.APPLE_ID, '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', process.env.APPLE_TEAM_ID]
    for (const dmg of dmgs) {
      console.log(`  • notarizing dmg  ${dmg}`)
      execFileSync('xcrun', ['notarytool', 'submit', dmg, ...keyArgs, '--wait'], { stdio: 'inherit' })
      execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' })
    }
    return []
  },
  // Branded install window: drag the Artifact app onto the Applications symlink.
  // `background` is the backdrop only; electron-builder overlays the REAL app +
  // Applications icons at `contents`. `window` must match the background image.
  dmg: {
    background: 'build/background.png',
    window: { width: 660, height: 420 },
    iconSize: 120,
    contents: [
      { x: 165, y: 205 },
      { x: 495, y: 205, type: 'link', path: '/Applications' },
    ],
  },
}
