# Devices

Stream and interact with live iOS Simulators, Android Emulators, and physical Android devices right beside a thread, and let agents inspect and drive them via `device_*` tools and the `agent-device` CLI.

## Open a device

In a project thread, choose **Device** from the **…** menu at the top right. On first use,
the panel walks through three steps: starting the device hub, checking iOS and
Android support, and choosing whether agents may control devices. Opening the
panel alone does not download or start anything. If the hub is already
installed, the setup screen says so and reuses it.

Choose a running device to watch it, or choose **Start** next to a stopped
device to boot it. The panel shows when you or an agent starts a device.
The device pane shows one device at a time; open another from the device picker and switch with the
arrow next to the pane's name. Double-click the name or choose **Rename** from the pane's **…**
menu to rename it. Only the device on screen streams video; switching keeps both devices running.
Choose **Float device over chat** in the toolbar to keep watching and tapping the
device in a small window while its pane is hidden; drag the window by its handle, resize it from
any edge, and use **Open in a pane** to bring it back. Closing the small window closes the device's
pane item too.
Turn off **Use devices** in **Settings → Devices** to stop the
helper processes; simulators and emulators keep running until you power them
off.

Simulators run on the machine that hosts the environment server. iOS needs
macOS with Xcode. Android needs the SDK Platform-Tools, Android Emulator,
and Command-line Tools (latest), plus a virtual device created in Android
Studio's Device Manager. S1 Code detects standard SDK locations; set
`ANDROID_HOME` for a custom location. The panel explains missing dependencies.
After installing SDK tools, restart the environment server and refresh devices.

Android emulator video also needs `ffmpeg` with the libx264 encoder on the device
host's PATH, or an executable selected by `SERVE_EMU_FFMPEG` on that host. If
opening an emulator reports an ffmpeg problem, install or fix the executable
and retry opening it. After changing PATH or `SERVE_EMU_FFMPEG`, restart the
environment server for local devices, or turn device support off and on for SSH
devices, so the running tools inherit the new environment. Physical Android
devices and iOS do not need ffmpeg.

The screen is interactive: click and drag to touch, type while the screen is
focused, and use the toolbar for Home, Back, and Recents on Android, rotate on
iOS, and power off. Close it in the pane to stop watching; the device keeps running
unless you power it off. A closed device stays closed after a reload. To watch the
device again, choose **Device** from the **…** menu.

Choose **3D view** to inspect supported devices while the live screen stays
interactive. On iPhone Duo, use the fold and stance controls to change its
physical pose, or pinch over the device to adjust the hinge. Turning the model
to the other screen switches the live display and touch input to that screen.
**Restore 3D view** returns the device to a screen-facing position.
On supported Android foldables, use **Fold device** and **Unfold device** beside
the screen to change its posture in either view.

## Tools

The toolbar's **Tools** button opens a drawer for the open device. It shows the
foreground app, and lets you switch light and dark mode, change text size,
flip accessibility settings, overlay the accessibility element frames on the
screen, set a fake location, and grant or revoke app permissions. iOS also
exposes Liquid Glass, color filters, VoiceOver, and sending a test push
notification; Android adds orientation and toggling the network. The drawer
only shows what the platform can do, and every control reflects the value read
back from the device after a change.

## Agents and devices

When an agent opens a device, it floats over the chat in web and desktop clients
connected to the thread, the same way an agent-driven browser does. Turn off
**Auto-show floating preview** in **Settings → Browser** to open it in the
device pane instead. In the mobile app, open the agent's thread and tap the
device button above the composer to watch the live screen and control it.
On iOS layouts with an inspector, the device opens beside the thread. Maximize
it to fill the screen; closing the full-screen view returns to the inspector.
If the thread has several devices open, choose one in the viewer. Closing the
viewer stops streaming and leaves the device available to the agent. Device
activity also appears in the thread timeline.

Agents drive the device through the `agent-device` command line. S1
Code installs and starts it only after **Agents can use devices** is on. iOS
taps build a small test runner on first use, which takes a couple of minutes
once per server. Restart an existing agent session after granting access so it
receives the device CLI environment.

To keep agents away from simulators, turn off **Agents can use devices** in
**Settings → Devices**. This hides the device tools from agents
started from then on; your own Device panel is unaffected.

## Remote connections

Device video streams through the environment server (works over LAN, Tailscale, and S1 Connect). Live video requires HTTPS or `localhost`—plain HTTP remote origins fall back to still images on iOS and disable video on Android (except Expo Simulators).

## SSH device hosts

Use simulators/emulators on another macOS or Linux machine (e.g., a Mac build host from Linux/Windows):

1. Open **Settings → Devices → Add source → Machine over SSH** and enter an SSH alias or `user@host` (uses the environment server's SSH config/keys; no password prompts).
2. Run **Test connection** to verify SSH, Node.js 22.12+, npm, and SDK tools (Android on SSH hosts requires full SDK tools + `ffmpeg` for emulators).
3. First listing installs pinned device helpers on the SSH host.

> Note: Remote simulators cannot reach `localhost` dev servers (like Metro) on your main host without port forwarding or a reachable network address.

## Simlock hosts (alpha)

Connect to a [Simlock](https://incubator.callstack.com/simlock/) device pool (requires Simlock 0.9.0 or later with `capabilities.stream.enabled` and `capabilities.input.enabled`):

1. Enable **Settings → Labs → Simlock device hosts (alpha)** and **Settings → Devices → Use devices**.
2. Choose **Add source → Simlock pool** with an agent token (`simlock --gateway token create --role agent`) over HTTPS or Tailscale (give each S1 server its own token; treat it like worker shell access).
3. Closing a device with **Return device to the pool** releases the lease; simulators and emulators are wiped. Toolbar tools/rotation/screenshots are unavailable in the UI (agents can still invoke them via `device_open`).

### Enrolled phones and tablets

The enrolled phones and tablets that are ready on a connected, undrained worker appear in the list next to its simulators and emulators, marked **Physical**, one entry per model and OS version. Worker setup is covered in Simlock's [Use a real phone](https://incubator.callstack.com/simlock/docs/using-devices/agent-device#use-a-real-phone).

- A phone is not wiped when its lease ends. Simlock removes apps that weren't on the phone when it was enrolled, except App Store and TestFlight apps on an iPhone; settings, files, accounts, keychain items, and the data of every other app stay for whoever leases it next.
- A leased phone has no stop button in the device list. Open it and choose **Return device to the pool**.
- An iPhone's screen needs iOS 27 or later and a worker on Xcode 27 or later, and it takes no clicks or typing from the panel. Agents can still drive it.

## Device tool updates

The S1 server manages device hub and `agent-device` versions automatically on itself and SSH hosts. Check versions in **Settings → Devices → Check versions**; update the remote S1 server to receive newer device tools.
