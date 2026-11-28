# FAQ

## Is S1 Code a harness?

No. A harness turns an LLM into an agent (tools, execution loop, and results)—like Claude Code's Agent SDK or Codex App Server. S1 Code drives those harnesses through one fast interface; it does not work without at least one installed agent.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, fx, or any [ACP agent](./providers-acp.md). See [Provider setup](./install.md#providers). (Longer read: [What is a harness?](https://t3.gg/blog/post/what-is-a-harness))

## Why use S1 Code instead of Claude Code or the Codex app?

- **Bring your own subscription**: Use Claude, Codex, and every other agent you already have installed in one place.
- **Remote-first**: Run `s1 up` on any box and drive it from anywhere.
- **Native mobile app**: Approve steps, review PRs, and steer threads from iOS and Android.
- **Open source (MIT)**: Fork the source code under your own branding if you ever want something different.

## Can I use S1 Code with my Claude Code subscription?

Yes.

## How much does S1 Code cost?

Nothing. You pay your own model/agent providers. S1 Connect is free for up to 3 connected host machines per account (phones and browsers don't count). You can also self-host or use LAN/Tailscale.

## Can I fork or redistribute S1 Code?

Yes, for the source code. The [MIT License](../../LICENSE) applies only to the source code, not to the T3 Code name, wordmark, logos, or branding. If you publish a fork or custom build, you must replace T3 Code's branding with your own and make it unmistakably clear that your project is unofficial and not affiliated with T3 Tools, Inc. Using the T3 Code name, wordmark, logo, or branding without being explicitly clear that your project is unofficial, or indicating that an unofficial project is an official version of T3 Code, is unlawful and will be pursued to the full extent of the law. See [TRADEMARK.md](../../TRADEMARK.md).

## Can I connect more than 3 machines with S1 Connect?

Yes. Link a paid S1 Chat account from your account menu → **S1 Chat → Link S1 Chat**: S1 Chat Pro raises the limit to 10 machines, and Premier raises it to 100. See [More machines with S1 Chat](./remote-access.md#more-machines-with-s1-chat).

## Why is my Claude 5-hour limit draining so fast?

Since v0.1.7, Claude in S1 Code drains your 5-hour limit at the same rate as Claude Code directly (an earlier Anthropic Agent SDK discrepancy has been resolved). If you still see it, [update S1 Code](./updating.md) on the machine running your agents.

## How do I use S1 Code remotely?

Your agents run wherever the S1 Code server runs (desktop, server, or VPS). Run `s1 up` on that machine and connect via S1 Connect, LAN, Tailscale, or [app.s1.codes](https://app.s1.codes). See [Remote access](./remote-access.md).

## How do I use S1 Code on my phone?

Get the [iOS](https://github.com/s1egg/s1code/releases) or [Android](https://github.com/s1egg/s1code/releases) app, then connect it to your computer with S1 Connect or a pairing link. The phone is a remote. Your computer does the work and needs to stay on. [Mobile setup](./install.md#mobile-app) · [Remote access](./remote-access.md)

## Why does S1 Connect keep disconnecting?

Open **Settings → Environments**, select the machine, and choose **Details**—the first failed check identifies the cause. See [S1 Connect troubleshooting](./s1-connect-troubleshooting.md). Tailscale also works great as a direct fallback.

## Will I get banned for using my subscription?

No. S1 Code stays within the TOS of Claude Code, Codex, Google Antigravity, Grok Build, Cursor, and official ACP bindings.

## Can I add a bunch of accounts for one provider?

S1 Code intentionally does not include an automatic multi-account switcher to avoid risking provider TOS bans. Adding a separate work/personal account is supported ([Codex](./providers-codex.md#use-multiple-accounts), [Claude](./providers-claude.md#multiple-accounts-and-presets)). For larger pools managed externally (e.g. via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)), S1 Code can display pooled limits under Usage ([Connect a hub](./usage.md#connect-a-cliproxyapi-hub)).

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in **Settings → Providers** with its own environment variables and endpoint (your subscription setup stays untouched). See [OpenRouter for Claude](./providers-claude.md#openrouter-and-local-routers) and [Providers](./install.md#providers).

## Does S1 Code support local models?

No. S1 Code focuses on frontier coding agents.

## Does my code go to S1 servers?

No. Code and prompts go directly from your machine to your chosen provider. With S1 Connect, traffic travels over a Cloudflare tunnel (`cloudflared` on your machine); S1's relay coordinates the link without proxying your HTTP/WebSocket sessions.

S1 Code sends basic product usage events (provider, model, token totals—no prompts or file contents). Disable with `S1CODE_TELEMETRY_ENABLED=false` or `DO_NOT_TRACK=1`. See [Product usage data](./telemetry.md).

## Worktrees are eating my disk. How do I clean them up?

Enable automatic cleanup or run **Delete now** in **Settings → Worktrees → Cleanup**. See [Storage cleanup](./project-settings.md#storage-cleanup).

## Is there voice input?

Yes—on-device speech on iOS, Android, and macOS 26+ desktop, or via a paired environment on web/desktop/mobile. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

Yes, all three (desktop app and CLI). Note: there is no standalone `s1` binary for Intel Macs (use the desktop app there), and Windows users can also run agents inside WSL. See [Install](./install.md).

## Why is my provider not showing up?

Usually the provider CLI is not installed, not signed in, or not on the `PATH` of the **server machine** (especially with version managers). Authenticate on the server machine first (e.g. `codex login` or `claude auth login`) and set **Binary path** in **Settings → Providers** if needed.
