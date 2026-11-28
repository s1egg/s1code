# CLI reference (`s1`)

The `s1` command runs and manages S1 Code servers, background services, remote access, threads, workflows, and diagnostics. Run `s1 --help` or `s1 <command> --help` for full flags.

See [Install S1 Code](./install.md#command-line) for installation (`curl -fsSL https://s1.codes/install.sh | sh`, `irm https://s1.codes/install.ps1 | iex`, or `npx s1@latest`).

## Running and connecting

| Command                  | Description                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `s1 [path]` / `s1 start` | Start a foreground server and open the web app (optionally in a project directory).                                              |
| `s1 serve`               | Start the server without opening a browser (`--lan`, `--tailscale-serve`, `--host`, `--port`, `--base-dir`).                     |
| `s1 app [path]`          | Open a directory as a project/thread in the running desktop app.                                                                 |
| `s1 up`                  | Interactive setup for remote access (S1 Connect and/or LAN) plus background service (`--connect`, `--lan`, `--no-lan`, `--yes`). |
| `s1 connect`             | Manage S1 Connect (`s1 connect`, `status`, `login`, `logout`, `link`, `unlink`).                                                 |
| `s1 status`              | Show how other devices can reach this host (`--json`).                                                                           |
| `s1 pair`                | Generate a one-time pairing URL / QR code (`--tailscale`, `--scope <scope>`).                                                    |

## Background service and updates

| Command                       | Description                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s1 service`                  | Manage the background service (`install`, `status`, `restart`, `uninstall`, `protect [--undo]`). See [Background service](./background-service.md). |
| `s1 update [version]`         | Update `s1` and the service (`--channel nightly`, `--allow-downgrade`, `--yes`).                                                                    |
| `s1 install` / `s1 uninstall` | Install or remove the `s1` launcher and background service (keeps `~/.s1/userdata`).                                                                |

## Threads, projects, and workflows

| Command       | Description                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `s1 thread`   | Script threads on the host (`start`, `send`, `show`, `list`; supports `--wait`, `--json`, `--worktree`, `--provider`, `--model`, `--option`). See [Host scripts](./outside-agents.md#host-scripts-s1-thread). |
| `s1 project`  | Manage projects on the host (e.g. `s1 project add <path> --track <folder>`).                                                                                                                                  |
| `s1 workflow` | Start and steer durable workflows (`start`, `list`, `show`, `resume`, `cancel`, `questions`, `signal`, `withdraw`, `hooks`, `store`). See [Workflows](./workflows.md).                                        |

## Environments, auth, themes, and policy

| Command          | Description                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `s1 environment` | Link or manage peer environments (`s1 environment link <addr> --pairing-code <code> --access <mode>`, `--from <file>`).                                |
| `s1 auth`        | Manage pairing codes, sessions, and S1 Connect device approvals (`pairing create`, `session list/revoke/issue`, `connect-device list/approve/revoke`). |
| `s1 theme`       | Manage server-published themes (`set <id>`, `clear`, `show`). See [Appearance](./appearance.md#environment-themes).                                    |
| `s1 policy`      | Validate, inspect, and generate MDM/GPO templates for [managed policies](./managed-policy.md) (`check`, `show`, `settings`, `templates`).              |

## Diagnostics and maintenance

| Command            | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `s1 doctor`        | Inspect database size and reclaim disk space (`--dry-run`, `--fix`).                                       |
| `s1 browser setup` | One-time Linux host setup (AppArmor sandbox profile, libraries, fonts) for the headless preview browser.   |
| `s1 trace summary` | Summarize local server trace latency and errors (`--since 30m`, `--limit 50`).                             |
| `s1 triage`        | Launch Claude Code, Codex, or Antigravity in your terminal with the S1 triage playbook.                    |
| `s1 feedback`      | Send or inspect agent feedback reports (`list [--json]`, `--kind`, `--subject`, `--expected`, `--actual`). |
