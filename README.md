# LegisDex Desktop

LegisDex Desktop is an Electron shell for the hosted LegisDex web application. The desktop app wraps the authenticated product experience, keeps allowed in-app routes inside Electron, and opens public or untrusted links in the user's default browser.

## What this app does

- Loads `http://localhost:3000/chat` in development.
- Loads `https://www.legisdex.com/chat` in packaged production builds by default.
- Supports deep-link auth handoff with the `legisdex://auth/callback` protocol.
- Keeps product routes inside the desktop shell and pushes non-app pages to the system browser.
- Ships as Windows installers, macOS archives and disk images, and Linux packages.

## Requirements

- Node.js 20+
- npm 10+
- A running LegisDex web deployment

## Development

Start the Next.js app first:

```powershell
cd D:\Programming\Nextjs\legisdex
npm run dev
```

Then start the desktop shell:

```powershell
cd D:\Programming\Electron.js\legisdex-app
npm install
npm run start
```

## Environment

Packaged builds load `https://www.legisdex.com/chat` by default.

To point the shell at another hosted LegisDex deployment, set `LEGISDEX_WEB_URL` before starting, packaging, or building installers:

```powershell
$env:LEGISDEX_WEB_URL = "https://your-domain.example"
npm run start
```

Example for CI or POSIX shells:

```bash
export LEGISDEX_WEB_URL="https://your-domain.example"
npm run make:linux:x64
```

## Production build commands

Run quality checks first:

```powershell
npm run lint
npm run typecheck
```

Create unpacked app bundles:

```powershell
npm run package:win:x64
npm run package:mac:arm64
npm run package:linux:x64
```

Create installable artifacts:

```powershell
npm run make:win:x64
npm run make:win:arm64
npm run make:mac:x64
npm run make:mac:arm64
npm run make:linux:x64
npm run make:linux:arm64
```

Build output is written to `out/`.

## Artifact formats by platform

- Windows: Squirrel installer and supporting release files.
- macOS: `.zip` and `.dmg`.
- Linux: `.deb` and `.rpm`.

## Platform and architecture notes

### Windows

- `npm run make:win:x64` is the standard Intel/AMD build.
- `npm run make:win:arm64` targets Windows on ARM.
- If you plan to distribute publicly, add Authenticode code signing in CI before release.

### macOS

- `npm run make:mac:x64` builds for Intel Macs.
- `npm run make:mac:arm64` builds for Apple Silicon.
- GitHub-hosted runners can build each architecture natively by using separate macOS runners.
- For public distribution outside of internal testing, you should add Apple code signing and notarization.

### Linux

- `npm run make:linux:x64` is the most reliable hosted-runner target.
- `npm run make:linux:arm64` is available locally, but arm64 Linux packaging is usually best built on a native arm64 runner or self-hosted machine.
- `.deb` and `.rpm` packages may require extra distro-specific validation before public release.

## GitHub Actions

The workflow at [`.github/workflows/release.yml`](.github/workflows/release.yml) does the following:

- Runs `npm ci`
- Runs `npm run lint`
- Runs `npm run typecheck`
- Builds release artifacts on Windows, macOS Intel, macOS Apple Silicon, and Linux x64
- Uploads build artifacts on every push and pull request
- Publishes tagged releases to GitHub Releases

### Recommended repository secrets

Set these before enabling signed public releases:

- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

This repository is not blocked on those secrets for internal or unsigned builds, but macOS notarization and Windows SmartScreen reputation are much better once signing is configured.

## Release process

1. Update the version in `package.json`.
2. Commit changes and push to `main`.
3. Create a tag such as `v1.0.1`.
4. Push the tag.
5. GitHub Actions will build the platform artifacts and attach them to a GitHub Release.

## Architecture

The desktop app does not bundle the Next.js backend. Auth, database access, Payload, Stripe, AI calls, and webhooks stay in the hosted Next.js app.

The desktop shell keeps these routes in-app:

- `/chat`
- `/account`
- `/checkout`
- `/compliance`
- `/return`
- `/tracker`
- `/sign-in`
- `/sign-up`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/sign-out`
- `/api/auth`

Everything else is redirected to the user's default browser unless explicitly allowed by the Electron navigation rules in [src/main.ts](/D:/Programming/Electron.js/legisdex-app/src/main.ts).
