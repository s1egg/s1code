# Keybindings

Customize shortcuts in **Settings → Keybindings** on web and desktop. That page
also lists the command IDs and defaults available in your version.

To free a default shortcut for another command, choose **Unassign** from its row's
actions menu. **Reset to default** brings it back.

## Composer controls

`mod+shift+d` starts dictation in the focused editor, or the composer, and finishes it on the next press;
`Esc` discards the recording. Change the chord under **Composer: Start or Finish
Dictation**, and the hold or toggle behavior in **Settings → Voice**. See
[Voice input](./voice-input.md).

In **Settings → Chat → Send shortcut**, choose whether Enter sends, requires
`mod+Enter` for multiline prompts, or always requires `mod+Enter`. `Shift+Enter`
inserts a new line. This applies to the web and desktop composer at desktop widths.

**Follow-up behavior** chooses Queue or Steer while the agent runs. Use
`mod+Enter` to do the opposite for one message, even when the send shortcut
requires a modifier. `mod+Alt+Enter` sends, keeps that thread running in the
background, and opens a fresh new-thread composer. In a new thread, `mod+Enter`
does the same. Change these shortcuts in **Settings → Keybindings** under
**Composer: Opposite Queue or Steer Action**, **Composer: Start in Background**,
or **Composer: Send and Start New Thread**. These bindings take priority over the
send shortcut. Click the send button to use the configured follow-up behavior.

When a thread has queued messages, `mod+Shift+Enter` sends the first one as a steer
while a turn is running, or as a new turn when the thread is stopped. Change it under
**Queue: Send First Queued Message** in Keybindings.

Use `mod+shift+m` to choose a model and `mod+shift+h` to choose a host.
To step a new thread to the next machine instead of opening the menu, bind
**Composer: Cycle Host** in Keybindings. It has no default shortcut.
Use `mod+shift+e` for effort, `mod+shift+a` for permissions, `mod+shift+x` for the
workspace, and `mod+shift+g` for the Git branch. The workspace menu includes the
current checkout, a new worktree, and the previous worktree when available.
Use `mod+shift+l` to reuse the previous worktree directly.

To change effort one step without opening the picker, bind
**Composer: Increase Effort** and **Composer: Decrease Effort** in Keybindings.
Both are unbound by default. Increase wraps from the highest level to the
lowest, and decrease wraps from the lowest level to the highest.

In the model picker, press Left in an empty search field or Shift+Tab to reach
the provider list. Use Up/Down to move and Enter to choose. Right returns to
model search. Right at the end of the search moves to the highlighted model's effort
levels, and Left comes back. Choosing a model keeps the picker open on its effort. `mod+shift+up` and `mod+shift+down` switch providers directly and clear the
search. These provider shortcuts can also be changed in Settings.

These shortcuts run inside the focused web or desktop client. `mod` uses Command
on macOS and Ctrl on Windows and Linux, including GNOME, KDE Plasma, Niri, and
Hyprland. If a custom desktop shortcut takes the same keys, choose another binding
in Settings.

## Copy pull request references

With a PR open in its pane, use `mod+shift+c`
to copy its URL and `mod+shift+k` to copy its number with a `#` prefix.
Both shortcuts can be changed in Settings. Search for “Copy Link or Thread”
or “Copy Number”. They copy the selected PR and leave terminal input alone.
Without a PR, `mod+shift+c` copies the thread itself, which pastes into a
composer as a thread chip.

## Find in a diff

Click into a diff in the Diff panel or a pull request's Code tab, then press
`mod+f` to search every file in it, including folded files and unchanged lines
hidden between changes. Enter and `Shift+Enter` move between matches, and a
match in a folded file opens it. Escape closes the search. This shortcut is not
configurable. A very large uncommitted diff loads its files as you scroll, and
find only searches the files loaded so far.

## iPad

With a hardware keyboard, use `Cmd+1` through `Cmd+9` to open the first nine
displayed threads. The shortcuts follow the current list filters and order.
`Cmd+K` opens the command palette to search commands, projects, and threads.
Use the arrow keys and Return to choose a result, or `Cmd+1` through `Cmd+9` to
choose directly. Escape or `Cmd+K` closes the palette. Start a search with `>`
to show only actions.

In a new thread, `Cmd+Shift+H` moves the draft to the next machine.

In the composer, Return sends and `Shift+Return` inserts a new line. While a
turn is running, `Cmd+Return` sends with the other follow-up action. To make
Return insert a new line instead, change the Return key behavior in Settings →
Keyboard; `Cmd+Return` then sends.

## Android

With a hardware keyboard, the composer handles Return as on iPad, with `Ctrl` in
place of `Cmd`. The on-screen keyboard's Return always inserts a new line.

To free a default shortcut, choose **Unassign** from its row menu (**Reset to default** restores it).

> Note: `mod` means `Cmd` on macOS and `Ctrl` on Windows and Linux.

## Common composer shortcuts

| Action                      | Default           | Notes                                                              |
| --------------------------- | ----------------- | ------------------------------------------------------------------ |
| Start / finish dictation    | `mod+shift+d`     | `Esc` discards. See [Voice input](./voice-input.md).               |
| Opposite queue/steer action | `mod+Enter`       | Uses the non-default follow-up behavior while a turn runs.         |
| Start thread in background  | `mod+Alt+Enter`   | Also `mod+Enter` in a new thread; opens a fresh draft immediately. |
| Send first queued message   | `mod+Shift+Enter` | Steers if running, or starts a turn if stopped.                    |
| Pick model                  | `mod+shift+m`     | `mod+shift+up/down` switches providers inside the picker.          |
| Pick host / environment     | `mod+shift+h`     | Bind **Composer: Cycle Host** to step without a menu.              |
| Pick effort                 | `mod+shift+e`     | Bind **Increase/Decrease Effort** to step without a menu.          |
| Pick permissions            | `mod+shift+a`     |                                                                    |
| Pick workspace mode         | `mod+shift+x`     | `mod+shift+l` reuses the previous worktree directly.               |
| Pick Git branch             | `mod+shift+g`     |                                                                    |

Configure whether `Enter` sends or requires `mod+Enter` in **Settings → Chat → Send shortcut** (`Shift+Enter` always inserts a newline).

In the model picker, use `Left`/`Shift+Tab` to move to the provider list, `Right` to return to search or move into effort levels, and `Up`/`Down`/`Enter` to select.

## Copy pull request and thread references

- `mod+shift+c`: Copies the open PR's URL (or copies a thread chip link when no PR is open).
- `mod+shift+k`: Copies the open PR's `#number`.

Remap under **Copy Link or Thread** and **Copy Number** in **Settings → Keybindings**.

## Find

- **Current thread** (`chat.find`, default `mod+f` outside terminals/previews): Searches all messages and plans in the thread (requires an up-to-date server). Use `Enter` / `Shift+Enter` to step through matches and `Esc` to close.
- **Diffs** (`mod+f` inside a diff or PR Code tab): Searches all loaded files in the diff, unfolding matching files. Not configurable. Very large uncommitted diffs only search files loaded so far.
- **Browser page** (`preview.find`, default `mod+f` in a desktop browser tab): Searches the open page. If a page handles `mod+f` itself, use the browser's **⋮** menu. Not supported in web clients or streamed browser tabs.

## Hardware keyboards on iPad and Android

Available context keys are `terminalFocus`, `terminalOpen`, `previewFocus`,
`previewOpen`, `rightPanelOpen`, `modelPickerOpen`, `usagePageOpen`, `composerFocus`,
`draftThreadRoute`, `turnRunning`, `composerEmpty`, `editableFocus`, `isWeb`, and `isDesktop`.
In a thread, `rightPanelOpen` is true while any of its [panes](panes.md) is showing, and
`terminalOpen` while its terminal pane is; the default `mod+t` uses `rightPanelOpen` to open the
**…** menu of more panes. `usagePageOpen` is true while thread details
show Usage.
`draftThreadRoute` is true on a draft thread, including a restored draft, until it is first sent.
`composerEmpty` is true while the composer has no text, attachments, or context, and is not
editing a queued message or answering a question.
`editableFocus` is true while a text field, the composer, or another editor has
the keyboard. `isWeb` is true in a browser tab. `isDesktop` is true in the
desktop app. Unknown keys evaluate to `false`.

## Edit the configuration file

Keybindings are stored on the environment's machine at `~/.s1/userdata/keybindings.json` as a JSON array:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

New default bindings are added on startup without overwriting customized commands. Invalid rules are ignored; an unparseable file falls back to defaults.

### Rule shape and key syntax

Each rule requires `key` and `command`, plus an optional `when` condition. Project scripts use `script.{id}.run` (e.g. `script.test.run`).

Join modifiers and keys with `+` (`mod`, `cmd`/`meta`, `ctrl`/`control`, `alt`/`option`, `shift`).

### When conditions

Available context keys: `terminalFocus`, `terminalOpen`, `previewFocus`, `previewOpen`, `rightPanelOpen`, `modelPickerOpen`, `usagePageOpen`, `composerFocus`, `draftThreadRoute`, `turnRunning`, `composerEmpty`, `editableFocus`, `isWeb`, `isDesktop`. Unknown keys evaluate to `false`.

Combine with `!`, `&&`, `||`, and parentheses:

```json
{ "key": "mod+j", "command": "terminal.toggle", "when": "terminalOpen && !terminalFocus" }
```

> Tip: `mod+1`–`mod+9` default to `isDesktop` so they don't hijack browser tabs. Remove that condition in Settings if you want thread jumps on web.

## Precedence

The last matching rule in `keybindings.json` wins, even across different commands. Place more specific rules after general ones.

## Commands with special behavior

In the desktop app, `mod+w` closes the focused terminal or the pane you last used. When nothing remains to close, it does nothing; it never closes the window. In a browser, `mod+w`
closes the browser tab; rebind `rightPanel.close` and `terminal.close` to an available
shortcut such as `alt+w`.

`mod+shift+t` reopens the last closed pane item across the app, including files,
diffs, pull requests, browsers, and devices, in the order you closed them, back where its pane was.
A browser opens in a fresh session without its old page history. Incognito tabs
can reopen until you reload or quit the app. This shortcut does not undo deleted work.
Browsers also use it to reopen browser tabs; choose another binding in Settings
if the browser takes it first.

- `mod+w` (desktop) closes the focused terminal, the selected range of right-panel tabs, or the active tab if there is no range. On web, browsers intercept `mod+w`. Rebind `rightPanel.close` and `terminal.close` to a shortcut such as `alt+w`.
- `mod+shift+t`: Reopens the last closed panel tab (files, diffs, PRs, browsers, devices) in order. Browser tabs reopen as fresh sessions. Rebind on web if your browser intercepts it.
- Keep `!terminalFocus` when remapping shortcuts that shouldn't intercept terminal input. `sidebar.toggle` ignores `Ctrl+B` inside terminals so `tmux` keeps its prefix (`Cmd+B` still works on macOS).

## Desktop quit shortcut

`Cmd+Q` (macOS) or `Ctrl+Q` (Windows/Linux) defaults to **Hold** mode: hold for 1.2 seconds or press twice within 500 ms. Change this in **Settings → General → Confirmations → Quit shortcut** to **Direct** or **Double press**. Quitting from the application menu always exits immediately.
