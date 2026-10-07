# Jackdaw — desktop

Electron shell around the owner UI. The original design and phasing plan
predates the 2026-08-13 repo split and is no longer carried as a document;
this README is the current reference.

The shell ships the connect screen, per-brain session partitions, the
native-parity CORS fencing, and an **embedded copy of the built owner UI** —
the standalone `next build` of `client/web`, run as a `utilityProcess` on a
sticky loopback port (sticky because localStorage — and the bearer in it — is
origin-scoped; a changing port would log everyone out).

## Run it

```sh
pnpm -C client/desktop build:ui   # build client/web standalone → client/desktop/ui/
pnpm -C client/desktop dev        # the Electron shell
```

The connect screen asks for your brain's URL (probes `GET /api/version` before
saving), then the window loads the UI pointed at that brain — log in as usual;
the bearer lands in the profile's own persisted session partition, so each
brain keeps its own login and a relaunch goes straight back in.

For UI iteration without rebuilding, `MANTLE_DESKTOP_RENDERER_URL` points the
shell at a `client/web` dev server instead of the embedded copy
(e.g. `pnpm dev:fe -- --port 3001`, then set it to `http://localhost:3001`).

## Packaging

```sh
pnpm -C client/desktop build:ui   # always first — the package embeds ui/
pnpm -C client/desktop dist       # AppImage + deb on Linux; dmg/zip on mac; nsis on Windows
```

CI (`.github/workflows/desktop.yml`) builds all three OSes on the same `v*`
tags as the image release and uploads installers to a **draft** GitHub
release — publishing stays a human act. Auto-update (electron-updater) checks
the published releases, downloads in the background, notifies once, and
installs on quit — never a surprise restart.

### macOS signing

CI picks the mode from the repository secrets:

| Secrets present | Result on a downloaded Mac build |
| --- | --- |
| none (branch or manual build only; a tag build FAILS if any of the five is missing) | **Ad-hoc** signed. macOS says it cannot verify the developer; the user opens it once with System Settings > Privacy & Security > Open Anyway. No self-update. |
| `CSC_LINK` + `CSC_KEY_PASSWORD` + the three `APPLE_API_*` | **Developer ID** signed, hardened runtime, notarized and stapled. Opens with no warning; electron-updater self-updates. |

| Secret | What it holds |
| --- | --- |
| `CSC_LINK` | The "Developer ID Application" certificate with its private key, exported as `.p12`, then base64 (`base64 -i cert.p12 \| pbcopy`). |
| `CSC_KEY_PASSWORD` | The password set on that `.p12` export. |
| `APPLE_API_KEY` | The full text of an App Store Connect API key (`AuthKey_<id>.p8`). A Team key with the Developer role or higher. |
| `APPLE_API_KEY_ID` | That key's Key ID. |
| `APPLE_API_ISSUER` | The Issuer ID shown above the key list in App Store Connect. |

Never commit any of these or paste them into a log. The `Verify macOS
signature` step fails the job when the bundle's seal is broken, and on a
Developer ID build also runs `spctl` and `xcrun stapler validate`.

Builds up to v0.6.251 had no signing step at all. The bundle kept Electron's
linker-signed stub, and macOS reported the quarantined download as
"damaged", with no Open Anyway button. Users of those builds can clear the
flag with `xattr -dr com.apple.quarantine /Applications/Jackdaw.app`.

`pnpm dist` on a Mac signs with whatever identity the keychain offers;
`-c.mac.identity=- -c.mac.hardenedRuntime=false -c.mac.notarize=false`
reproduces the CI ad-hoc build.

## Desktop integration

- **Deep links**: `mantle://n/<id>` (or any `mantle://<path>`) opens the
  in-app route in the current/last-used brain window.
- **Notifications**: the UI's `DesktopBridge`
  (`client/web/components/desktop/desktop-bridge.tsx`) feature-detects
  `window.mantleDesktop` and forwards assistant outbound pings
  (`/api/assistant/stream`) to OS notifications while the window is hidden.
  Clicking one focuses the app.
- **Tray**: open / switch brain / quit. A badge API (`setBadge`) is exposed
  for later wiring.

## What the shell does (and doesn't)

- **Native-parity CORS fencing**, scoped to the configured brain origin only:
  outgoing `Origin` dropped (a native client sends none — same stance as the
  mobile companion), ACAO injected on responses so the embedded renderer
  accepts them. No server-side CORS setup needed on any box.
- **`window.__MANTLE_ENV__` injection** via preload (read-only), with the dev
  server's `/env.js` neutralized so the user's chosen brain always wins.
- **No secrets in the shell config.** The server URL list (`profiles.json`
  in userData) is plain config; bearers live in the **token vault**
  (`src/main/vault.ts`): OS-keychain-encrypted files (Electron `safeStorage`),
  the same at-rest posture as the mobile companion's Keychain. One file per
  login held for a brain (`vault/<profileId>/<sessionId>.tok`), so a brain
  window can hold several logins and switch between them. A window reaches
  only its own brain's files, and the session id, which comes from the page,
  is validated before it is used in a path. The one-slot file earlier builds
  wrote (`vault/<profileId>.tok`) is adopted into a login by a rename on the
  first run after the update, so updating signs nobody out. The UI's
  token-store feature-detects the vault and also moves a pre-vault
  localStorage bearer into it on first read.
- **One window per brain**, listed in the tray and the Brain menu, most
  recently used first. Logins WITHIN a brain are switched inside its window
  (the profile menu); the shell knows brains, the page knows logins.
- External links (share links, docs) open in the system browser.

## Media permissions

The shell registers no permission handler today (no
`setPermissionRequestHandler` or `setPermissionCheckHandler` on the session),
so microphone and camera prompts follow Electron's defaults: a packaged
Electron app grants renderer permission requests unless a handler denies
them, and the OS-level prompt (macOS microphone access, for example) is
whatever the platform does. The Developer ID build runs under the hardened
runtime, so `build/entitlements.mac.plist` carries the microphone and camera
entitlements; without them macOS blocks the device even after the user says
yes. This has not been verified
in the packaged app; treat voice capture on desktop as untested until it is.

## The app icon

`build/icon.png` (electron-builder's source for .icns/.ico) and
`resources/icon.png` (the Tray and Notification image) are the same committed
1024² file — the Jackdaw badge on brand brown `#2D1500`. There is no generator;
it is regenerated by hand from `brand/jackdaw-icon-logo-dark-trans.png`
when the mark changes:

```bash
magick brand/jackdaw-icon-logo-dark-trans.png -trim +repage /tmp/t.png
W=$(magick identify -format %w /tmp/t.png); H=$(magick identify -format %h /tmp/t.png)
# The badge's cream field is only ~32% opaque — it was drawn against a light
# page, so it MUST get its own opaque disc or the interior goes muddy olive on
# the brown. Inset 1.5% so the disc edge hides under the cream ring.
magick -size ${W}x${H} xc:none -fill '#FDE7BC' \
  -draw "ellipse $((W/2)),$((H/2)) $((W*985/2000)),$((H*985/2000)) 0,360" /tmp/disc.png
magick /tmp/disc.png /tmp/t.png -composite -resize 881x881 \
  -background '#2D1500' -gravity center -extent 1024x1024 -alpha remove -alpha off \
  client/desktop/build/icon.png
cp client/desktop/build/icon.png client/desktop/resources/icon.png
```

Jackdaw mobile composes the identical icon from the same source — see that
repo's `tool/generate_app_icon.dart` and `branding/README.md`.
