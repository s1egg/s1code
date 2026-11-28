# Appearance and themes

On web and desktop, open **Settings → Appearance** to choose a theme and follow the system
appearance or stay in light or dark mode. To use different themes for light and dark mode, select
the corresponding preview within each theme. Appearance preferences are saved separately on each
device or browser.

On web and desktop, use **Change theme** in the command palette to select a theme without leaving chat.
Press **Cmd+Option+A** on macOS or **Ctrl+Alt+A** on Windows/Linux to open the theme picker directly.
Use **Change appearance** in the command palette to choose System, Light, or Dark independently of
the theme. **Cmd+Option+Shift+A** on macOS or **Ctrl+Alt+Shift+A** on Windows/Linux cycles through
those modes. Customize these shortcuts under **Settings → Keybindings**.

The default **S1 Code** theme is a flat, neutral look in light and dark. Four built-in themes,
Mist / Midnight, Paper / Graphite, Sand / Charcoal, and Shallows / Deep Sea, each pair a light theme
with a dark one. When you follow the system appearance, switching between light and dark keeps you
in the same pair. These themes also fill your own messages with the accent color.

On web and desktop, raise **Background glow** in **Settings → Appearance** to add a soft glow in
the theme's accent color behind the window, fainter in light mode. It is off by default. Touch
devices always show a flat background.

On mobile, choose any of the same four pairs in **Settings → Appearance**. The phone stores its
own theme selection and text, code, and terminal preferences. Environment theme defaults apply to
web and desktop.

On Android 12 or newer, choose the **Material You** theme in Appearance to use colors from
your wallpaper. Selecting another theme replaces those colors. Like other themes, Material You
can be selected separately for light and dark appearances.
Android uses **Material You Layout** by default unless you have turned it off in Appearance.
It changes shapes, spacing, and controls independently
of the selected theme.

## Switch themes and appearance

- **Web and desktop**: Open **Settings → Appearance** to choose a theme and light, dark, or system mode. Select the light or dark preview on a theme card to pair different themes with each mode.
  - Open theme picker from anywhere: `Cmd+Option+A` (macOS) or `Ctrl+Alt+A` (Windows/Linux), or **Change theme** in the command palette.
  - Cycle System / Light / Dark: `Cmd+Option+Shift+A` (macOS) or `Ctrl+Alt+Shift+A` (Windows/Linux), or **Change appearance** in the command palette.
- **Mobile**: Open **Settings → Appearance**. Mobile uses its own themes and text/code/terminal preferences and does not follow environment themes.
  - On Android 12+, **Material You** pulls colors from your wallpaper (configurable separately for light and dark), and **Material You Layout** controls Material You shapes and spacing independently of the theme.

Git-backed projects show branch and worktree controls beside the model controls under the composer
while you create a thread.
The controls retreat as the composer docks after you send the first message.

Git-backed projects show branch and worktree controls below the composer before the first message. Turn on **Settings → Appearance → Composer context** (web and desktop) to keep those controls visible after the thread starts.

## Math

Turn on **Settings → Appearance → Render math** (per device) to render LaTeX in messages and Markdown previews on web, desktop, and mobile.

- Supports `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, and fenced `math` blocks outside of code.
- Currency like `$5 and $10` stays plain text; use `\$` to escape other literal dollar signs.
- Copying a formula or exporting a table preserves the raw TeX. The composer keeps TeX source editable.

## Motion

The main sidebar and the narrow-window pane sheet open and close immediately by default. Move the
**Panel animations** slider above 0 ms to add motion, up to 400 ms, unless reduced motion is enabled
in your operating system. Moving between threads always snaps to the selected thread's panel state
without replaying its transitions.

## Custom themes

On web and desktop, choose **Create theme** in **Settings → Appearance** to edit a palette, import a S1 Code or VS Code theme, or export your theme as JSON.

### Custom CSS

Open **Custom CSS** in the theme editor for styling beyond palette colors. Custom CSS is saved with the theme and included in exports.

Class names in the app change between releases. For rules that keep working, target `data-slot`
and other `data-` attributes, such as `[data-chat-header]` or `[data-slot="button"]`.

If a rule hides something you need, run `s1 theme set s1-graphite` on the server to switch to a
built-in theme, or press **Cmd+Option+A** on macOS or **Ctrl+Alt+A** on Windows/Linux to pick
another theme.

### Ask an agent

An agent running on the same machine as the server in **Full access** mode can restyle S1 Code for you (for example, "give S1 Code a solarized theme"). It publishes an [environment theme](#environment-themes) and switches connected web and desktop clients to it. Ask the agent to switch back to a built-in theme to undo.

## Environment themes

Environment themes come from the server serving your web app or the desktop app's local environment (or local [background service](./background-service.md) when the built-in local environment is off). Hosted `app.s1.codes` and remote connections do not apply them.

Select a published theme in **Settings → Appearance** to track server updates, or **Duplicate** it for an independent editable copy.

Manage the server default from the CLI:

```bash
s1 theme set nightfall   # Set default and switch connected/reconnecting clients once
s1 theme clear           # Remove the default without changing current client themes
s1 theme show            # List the default and all published themes
```

### Publish a theme

Save an exported theme JSON into `~/.s1/userdata/themes/` on the server (or `themes/` under your custom state directory). The filename sets the theme ID (e.g. `nightfall.json` → `s1 theme set nightfall`). Avoid reserved IDs (`system`, `light`, `dark`, or built-in theme IDs).

You can also use a minimal palette format—S1 Code generates the remaining tokens:

```json
{
  "name": "Nightfall",
  "appearance": "dark",
  "canvas": "#1a1b26",
  "accent": "#7aa2f7",
  "colors": {
    "terminalSelection": "#292e42",
    "error": "#f7768e"
  }
}
```

Include an optional `css` string for [custom CSS](#custom-css). Write updates atomically (temp file + rename) so clients never read a partial file.

### Background image

Place a JPEG, PNG, or WebP file (up to 16 MB) next to a published theme file with the same base name (e.g. `nightfall.jpg` beside `nightfall.json`), or ask an agent to set one. Reference it in the theme's CSS:

```css
[data-workspace-area="conversation"] {
  background: var(--theme-background-image) center / cover no-repeat;
}
```

Delete the image file to remove it.
