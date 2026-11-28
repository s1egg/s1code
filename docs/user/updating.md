# Updating S1 Code

The app you use and the server running your agents can be on different machines.
When a server is behind your web or desktop app, the update button at the bottom
of thread details and **Settings → Environments** offer to update it.

## Update everything at once

The update button at the bottom of thread details updates every connected machine
in one step. It updates outdated providers, then servers that are behind, then
the desktop app you are using. Servers move to the
version your desktop app is installing, or to your web app's version. A
background service stays on its current release channel. A remote desktop app
installs the latest release from its own channel. Hover the button to see what
it will update.

While it runs, the button widens to show progress. It names a machine that is
taking longer than usual, and offers **Retry** for a server that failed. Click
it to see every machine. The desktop app restarts once each server has started
its own restart, after a short countdown. Choose **Later** to keep working and
restart from the update button when you are ready. A server still restarting
finishes on its own, and the button keeps showing it after the desktop app
restarts.

Each server checks that it can install the release before it restarts. If the
release is not available to a server yet, its update fails, the server keeps
running, and you can retry. The confirmation lists each machine it skips and
why, such as a machine that is offline or needs a manual update. Use
**Settings → Environments** for those.

If a desktop app restarts on its old version, S1 Code tells you the update did
not apply. It does not install that version again on its own, even when another
device asks. Use the update button on that machine to retry.

The confirmation counts the running threads that the restarts will interrupt,
and how many can resume afterwards. See **Continue threads after restarts**
below.

- Hover to preview what will update; click while running to view per-machine progress or retry failures.
- Confirmation dialogs show which machines are skipped (offline or manual-only) and how many active threads will pause/resume.
- Choose **Later** on the desktop restart countdown to restart when ready.

## Switch between Stable and Nightly

In the desktop app, change **Settings → About → Update track** to switch connected machines together.

- Moving a background service to an older Stable release requires running `s1 update --channel stable --allow-downgrade` on that host.
- A switch is blocked if the machine's database has schema changes the target track doesn't support yet. macOS desktop apps must switch on that Mac.

## Continue threads after restarts

**Settings → Maintenance → Continue threads after restarts** is enabled by default. After an update, crash, or reboot (once S1 Code starts again), supported active threads automatically resume—and threads waiting on subagents or monitors are woken and notified that background work stopped.

- Threads waiting for your approval/answer/secret—or archived, snoozed, or settled—are not auto-resumed.
- After 3 consecutive crash recoveries of an unfinished turn, the thread waits for your next message.
- Updating from V1? Read [Threads from older S1 Code versions](./thread-migration.md).

## Update a connected server manually

| Situation                           | Action                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Background service / desktop server | Click **Update server** in **Settings → Environments** (desktop hosts relaunch automatically).        |
| Installed `s1` CLI                  | Run `s1 update <version>` on the host (then `s1 service restart` if you declined the restart prompt). |
| `npx` server                        | Stop the server and relaunch with `npx s1@<version>` and your usual flags.                            |
| Package manager (Nix, AUR)          | Update via your package manager.                                                                      |

Each server checks npm/Homebrew/pnpm using its own local registry and proxy settings.

## Update providers

Open **Settings → Providers** and click **Update now** on individual providers or **Update all** across connected environments. Running chats keep using their current CLI until they end; new sessions and model catalogs refresh automatically. (Provider update checks in **Settings → Maintenance** must be enabled to fetch model catalog updates.)

## Mobile updates

- Update connected environments and providers from **Settings → Environments** on mobile.
- Update the mobile app via the App Store or Google Play (background over-the-air updates apply on next app switch and preserve drafts/queued messages).

## Troubleshooting

- **Version mismatch**: Update whichever side (app or server) the connection notice names.
- **Failed update**: Retry once; confirm you updated the host machine (not just the client) and that only one server owns the S1 home directory.
- **macOS Alpha → Beta**: Open `/Applications/S1 Code (Beta).app` manually and re-pin it to the Dock.
- **Desktop won't start**: Use the recovery window's **Update** button, install the linked last-working version, or **Copy details** for a bug report.
