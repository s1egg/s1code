# Install S1 Code

S1 Code runs coding agents on your computer (or server) and lets you control them from the desktop app, web app, or mobile app. Install S1 Code on the machine where your agents will run first.

## Requirements

You need at least one installed, authenticated coding agent (provider) before starting a thread. You can launch S1 Code first and set up providers from the [Welcome page](./welcome-page.md) or **Settings → Providers**.

## Command line

Install the `s1` command to `~/.local/bin`:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/s1egg/s1code/main/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/s1egg/s1code/main/scripts/install.ps1 | iex
```

Set `S1CODE_CHANNEL=nightly` for nightly builds or `S1CODE_VERSION=<ver>` to pin a version. To try once without installing, run `npx s1@latest` (requires Node.js; always runs the latest stable release).

| Task                          | Command                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| Start server and open web app | `s1` (or `s1 ./my-project`)                                             |
| Start server without browser  | `s1 serve`                                                              |
| Set up remote access          | `s1 up` ([Remote access](./remote-access.md))                           |
| Run in the background         | `s1 service install` ([Background service](./background-service.md))    |
| Update                        | `s1 update`                                                             |
| Reclaim database space        | `s1 doctor` ([Details](./background-service.md#reclaim-database-space)) |
| Uninstall                     | `s1 uninstall`                                                          |

If `s1` reports a server is already running, connect with `s1 pair` or pass a separate `--base-dir`. Run `s1 --help` for all commands.

### Intel Macs

There is no standalone `s1` binary for Intel Macs—use the desktop app, or build a server from source with `vp` ([development runbook](../operations/00_development.md#first-checkout)):

```bash
git clone https://github.com/s1egg/s1code
cd s1code && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

## Desktop app

Download from [GitHub Releases](https://github.com/s1egg/s1code/releases) or install via a package manager:

| Platform                | Command                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| macOS                   | `brew install --cask s1-code`                                    |
| Windows                 | `winget install S1Tools.S1Code` or `scoop install extras/s1code` |
| Debian / Ubuntu         | `sudo apt install ./S1-Code-*.deb`                               |
| Arch Linux              | `yay -S s1code-bin` (or `yay -S s1code-nightly-bin`)             |
| Nix (flakes, Nix 2.30+) | `nix profile add github:NixOS/nixpkgs/nixos-unstable#s1code`     |

- **Linux AppImage**: `chmod +x ./S1-Code-*.AppImage && ./S1-Code-*.AppImage` (x86_64 and ARM64). `.deb` self-updates with a password prompt; update AUR packages via your AUR helper (`yay -Syu`).
- **NixOS / Home Manager**: Add `pkgs.s1code` to `environment.systemPackages` or `home.packages` (`s1code-desktop` launches the app; `s1` is included). Update via Nix rather than the in-app updater.

### The `s1` command

The desktop app bundles `s1` and sets it up on first launch (manage anytime under **Settings → About → s1 command**). Use **Add to PATH** if needed, then open a new terminal.

- **Open a folder in the running desktop app**: Run `s1 app` (or `s1 app ../my-project`) from a terminal, or drag folders from your file manager onto the desktop sidebar.

### Windows Subsystem for Linux

Select a WSL distro in **Settings → Sharing & access** to run agents and projects inside WSL (install provider CLIs inside that distro). S1 Code manages its own server runtime inside WSL automatically.

## Mobile app

Install S1 Code from the
[App Store](https://github.com/s1egg/s1code/releases) or
[Google Play](https://github.com/s1egg/s1code/releases).
The phone connects to a server on another machine. Follow
[remote access](./remote-access.md) to link it through S1 Connect or a pairing URL.

Store links and QR codes are also available in **Settings → About → Mobile app**
on web and desktop. The store apps work with both stable and Nightly servers. Test builds are optional:

- **iPhone and iPad:** TestFlight is invite-only.
- **Android:** download an APK from the
  [Android beta releases](https://github.com/s1egg/s1code/releases?q=android-beta-).

- Store builds work with both Stable and Nightly servers. Optional Android beta APKs are under [Android beta releases](https://github.com/s1egg/s1code/releases?q=android-beta-).
- If the mobile app crashes on launch, open **Settings → Diagnostics** on the next launch to copy recent startup crash reports.

## Providers

Open **Settings → Providers** (web or desktop), select the environment, and enable the providers you use. Installation and sign-in always happen on the **environment's machine**.

| Provider         | Install and authenticate                                                                                                 | Guide                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Codex**        | Connect with ChatGPT in Settings, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. | [Codex](./providers-codex.md)             |
| **Claude**       | Install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`.                               | [Claude](./providers-claude.md)           |
| **Cursor**       | Sign in in Settings or install [Cursor CLI](https://cursor.com/cli) and run `agent login`.                               | [Cursor](./cursor.md)                     |
| **Grok Build**   | Install [Grok Build CLI](https://x.ai/cli) and run `grok login`.                                                         | [Grok](./providers-grok.md)               |
| **Antigravity**  | Install managed runtime and sign in with Google in Settings.                                                             | [Antigravity](./providers-antigravity.md) |
| **OpenCode**     | Install [OpenCode](https://opencode.ai) and run `opencode auth login`.                                                   | [OpenCode](./providers-opencode.md)       |
| **Kiro**         | Install [Kiro CLI](https://kiro.dev/docs/cli/) and run `kiro-cli login`.                                                 | [Kiro](./providers-kiro.md)               |
| **Pi**           | Install [Pi](./providers-pi.md) (Node.js 22.19+) and run `pi` → `/login`.                                                | [Pi](./providers-pi.md)                   |
| **Muse Code**    | Install [Muse Code](https://dev.meta.ai/docs/muse-code) and run `muse login`.                                            | [Muse Code](./providers-muse.md)          |
| **fx**           | Install [fx](https://fx.sh) and run `fx login`.                                                                          | [fx](./providers-fx.md)                   |
| **ACP Registry** | Add GitHub Copilot and other agents in **Settings → Providers → Add provider → Show more**.                              | [ACP](./providers-acp.md)                 |

- **Binary path**: If a CLI isn't on the server's `PATH` (common with version managers), set **Binary path** in the provider's settings.
- **Updates**: Click **Update now** on outdated provider cards (supports Homebrew, mise `latest`, npm/pnpm/Yarn/Bun/Volta/Vite+, or the CLI's own updater; update Nix, Chocolatey, or pinned mise installs manually).
- **Multiple instances**: Add extra provider instances for separate accounts, API keys, or custom endpoints (mark secret env vars as sensitive).

### Provider check timeouts

If a working CLI times out during S1 Code's readiness check, increase its probe deadline (in milliseconds) in the server's environment (or systemd override / `service.env`) and restart:

```bash
S1CODE_CODEX_PROBE_TIMEOUT_MS=60000 S1CODE_CLAUDE_PROBE_TIMEOUT_MS=60000 s1 serve
```

| Provider     | Environment variable                   |
| ------------ | -------------------------------------- |
| Codex        | `S1CODE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude       | `S1CODE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor       | `S1CODE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity  | `S1CODE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok         | `S1CODE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro         | `S1CODE_KIRO_PROBE_TIMEOUT_MS`         |
| fx           | `S1CODE_FX_PROBE_TIMEOUT_MS`           |
| Pi           | `S1CODE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code    | `S1CODE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode     | `S1CODE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry | `S1CODE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

## Next steps

- [User guide index](./README.md): overview of how S1 Code works.
- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): control when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Updating S1 Code](./updating.md): keep apps, servers, and providers up to date.
