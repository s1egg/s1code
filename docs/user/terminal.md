# Terminal

S1 Code includes integrated terminals running on the environment's host machine, with persistent scrollback across reconnects.

## Choose a shell

Set `S1CODE_TERMINAL_SHELL` in the S1 server's environment to an executable name or full path (no quotes or arguments) to override the platform default shell for new terminals. This does not affect agent commands or project setup/settle scripts.

Example for Git Bash on Windows (PowerShell, then fully quit and reopen S1 Code):

```powershell
[Environment]::SetEnvironmentVariable('S1CODE_TERMINAL_SHELL', 'C:\Program Files\Git\bin\bash.exe', 'User')
```

> Note: Use `bin\bash.exe`, not `git-bash.exe`. Remove with `$null` to restore the default.

## Scrollback and navigation

While a terminal is focused, use `Cmd+Shift+]` for the next terminal and `Cmd+Shift+[` for
the previous one on macOS. On Windows and Linux, use `Ctrl+Alt+]` and `Ctrl+Alt+[`. Cycling
wraps through the terminals and split panes of the terminal [pane](panes.md). Rebind these
shortcuts in Settings > Keybindings.

| Action                     | macOS                              | Windows / Linux                            |
| -------------------------- | ---------------------------------- | ------------------------------------------ |
| Scroll page up/down        | `Shift+PageUp` / `Shift+PageDown`  | `Shift+PageUp` / `Shift+PageDown`          |
| Jump to start / latest     | `Cmd+Shift+Home` / `Cmd+Shift+End` | `Ctrl+Shift+Home` / `Ctrl+Shift+End`       |
| Select all retained output | `Cmd+A`                            | `Ctrl+Shift+A` (`Ctrl+A` stays shell home) |
| Next / previous terminal   | `Cmd+Shift+]` / `Cmd+Shift+[`      | `Ctrl+Alt+]` / `Ctrl+Alt+[`                |

On iOS/iPadOS, long-press the terminal to paste or choose **Select Text**.

## fish shell

S1 Code launches `fish` with `no-query-term` to avoid startup delays, which overrides universal `fish_features`. To keep custom flags or re-enable `query-term`, export `fish_features` in the environment that launches S1 Code.
