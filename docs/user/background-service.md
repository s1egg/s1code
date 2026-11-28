# Running S1 Code in the background

Run S1 Code as a background user service on Linux, macOS, or Windows so your host stays reachable without keeping a terminal open.

## Manage the service

Install the `s1` CLI first ([Command line](./install.md#command-line)), then run these commands on the host machine:

| Task                                    | Command                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| Set up access from other devices        | `s1 up`                                                   |
| Check how other devices reach it        | `s1 status`                                               |
| Install and start (or repair)           | `s1 service install`                                      |
| Check status and log path               | `s1 service status`                                       |
| Update to a newer release               | `s1 update`                                               |
| Restart                                 | `s1 service restart`                                      |
| Stop and remove from startup            | `s1 service uninstall`                                    |
| Remove service, launcher, and downloads | `s1 uninstall` (keeps `~/.s1/userdata` and `service.env`) |

- Pairing codes are never written to logs; run `s1 pair` or `s1 up` on the host to connect a device.
- `s1 update` asks before restarting (pass `--yes` in scripts). Pin a version with `s1 update 0.0.42`, switch tracks with `--channel nightly`, or downgrade with `--allow-downgrade`.

## Local network access

New services bind to localhost only. Run `s1 up --lan` (sets `S1CODE_LAN=true` in `service.env`) to listen on LAN and Tailscale addresses for direct desktop/mobile connections, or `s1 up --no-lan` to disable it. Anyone on that network can reach the port (gated by pairing). `S1CODE_HOST` overrides `S1CODE_LAN`. Hosted `app.s1.codes` always uses S1 Connect.

## Configure the service environment

Add `KEY=VALUE` entries to `service.env` in your S1 home directory (`~/.s1/service.env` by default). Values are literal (quote spaces or `#`; no shell expansion) and survive installs and updates.

```dotenv
S1CODE_PORT=4773
S1CODE_HOST=127.0.0.1
```

- `PATH`, `S1CODE_HOME`, `S1_BOOT_SERVICE_UNIT`, and `S1_SERVICE_LAUNCHER_CONTEXT` cannot be overridden here.
- Run `s1 service restart` after editing (and `chmod 600 ~/.s1/service.env` if it holds secrets).

## Platform support

- **Linux**: Requires systemd user services with lingering enabled so S1 Code starts at boot and survives logout.
- **macOS**: Starts at login, stops at logout. Keep the Mac logged in and awake for unattended access. If agents can't read Desktop/Documents/Downloads, grant Full Disk Access to the `s1` path in `~/Library/LaunchAgents/com.s1tools.s1code.service.plist`.
- **Windows**: Runs windowless via Task Scheduler (`s1code-<domain>-<user>`) while signed in and auto-restarts on exit. Lock the screen instead of signing out for unattended access.

> Note: Signing out of S1 Connect does not stop or uninstall the background service.

## Keep the server responsive under memory pressure (Linux)

On Linux, agents run at lower priority than the server, but heavy memory use can still trigger the OOM killer. Run as your normal user:

```sh
s1 service protect
```

It previews system changes, asks for confirmation and `sudo`, and optionally protects Tailscale and SSH too. Run `s1 service restart` for OOM-killer protection to take effect, or `s1 service protect --undo` to remove it.

When the host is in trouble, the sidebar (or the top of the thread list on
mobile) says so: **Memory is slowing agents down** (this can happen before
memory runs out), **Almost out of disk space** (where S1 Code keeps its data and
worktrees), or **Machine overloaded** (work waiting for a CPU or for the disk).
A machine that is merely busy shows nothing. With several machines in trouble,
one notice covers them all. On Linux the warning names the agents using the most
memory or CPU, and you can force stop one there to free the machine for the
rest. Their threads also show a warning icon in the thread list.

## Troubleshooting

Run `s1 service status` on the host to see the log path and health checks:

| Status                                 | Fix                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `linger-disabled`                      | Run `sudo loginctl enable-linger "$(id -un)"` (or `ssh -t your-server '...'`), then retry setup as your normal user. Never run S1 Code as root. |
| `linger-unavailable`                   | Check `loginctl show-user "$(id -un)" --property=Linger` and verify `systemd-logind`.                                                           |
| `user-manager-unavailable`             | Run `systemctl --user status` in a login session to verify systemd user support.                                                                |
| `service-disabled` / `service-stopped` | Check the log and `systemctl --user status s1code.service`, then run `s1 service install`.                                                      |
| `restart-pending`                      | Run `s1 service restart` to switch to the newly installed version.                                                                              |

For S1 Connect issues, see [S1 Connect troubleshooting](./s1-connect-troubleshooting.md).

## Reclaim database space

S1 Code automatically prunes old internal history while keeping conversations. Older databases that still hold freed space show a **Reclaim** button in **Settings → Maintenance** when at least 1 GiB is reclaimable (pauses the server/agents during repair).

For manually started servers (or CLI use), stop any hand-started server or desktop app and run:

```sh
s1 doctor          # Interactive repair (auto-stops/restarts a background service)
s1 doctor --dry-run
s1 doctor --fix    # Non-interactive recommended repairs
```

- Needs free disk space of ~2× active data size (in `TMPDIR`/`/var/tmp` and beside the database). Large databases can take over an hour.
- `s1 doctor` optionally offers to remove the legacy pre-0.1.0 `state.sqlite` backup only when all active projects and threads exist in the current database (`--fix` never deletes it automatically).
