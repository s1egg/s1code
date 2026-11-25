# S1 Connect troubleshooting

A S1 Connect connection goes through four parts, in this order:

1. **This device** reaches S1 Connect over the internet.
2. **S1 Connect** checks your sign-in and the host's link.
3. **The host's tunnel** (cloudflared on the host) carries the request to the host.
4. **S1 Code on the host** answers.

When a connection fails, open **Settings > Environments**, find the environment,
and select **Details**. The first part marked as failed is the cause. Find its
section below.

To see the host's side, run `s1 connect status` on the host, or open
**Settings > Sharing & access** on the host. Both check the host's S1 Connect
address from the host, and say why it fails. `s1 connect` runs the same check
when it finishes setup. This check cannot test another device's network. For a
problem on one device, use **Details** on that device.

## The host's tunnel is offline

S1 Connect could not reach the host's tunnel. This means one of these:

- The host is asleep, turned off, or offline.
- S1 Code is not running on the host.
- The host's network blocks the tunnel. See
  [Port 7844 is blocked on the host](#port-7844-is-blocked-on-the-host).

Fix:

1. Make sure the host is awake and S1 Code runs on it.
2. On the host, run `s1 connect status`. It names the problem on the host's side.
3. If the host was offline for a long time, S1 Connect removes its tunnel. Start
   S1 Code on the host and update it to the latest version. It gets a new tunnel.

## Port 7844 is blocked on the host

The tunnel on the host connects out to Cloudflare on port 7844, with TCP and
UDP. Both tunnel protocols (QUIC and HTTP/2) use this port. When the host's
network blocks it, the tunnel cannot start, but normal web traffic still works.
The host looks online, so this problem is easy to miss.

Common causes:

- **A Tailscale exit node on the host.** All of the host's internet traffic goes
  through the exit node, and that network blocks port 7844. Turn off the exit
  node on the host with `tailscale set --exit-node=`, or allow outbound port
  7844 on the exit node's network.
- **A VPN on the host.** Work VPNs often block unknown ports. Ask for port 7844
  to be allowed, or use a direct route instead (see below).
- **A firewall or strict network.** Allow outbound TCP and UDP port 7844.

If you cannot unblock the port, you can connect without S1 Connect. When the
host and this device are on the same Tailscale network, add the host's
Tailscale address as a direct route. See
[Reach one machine several ways](./remote-access.md#reach-one-machine-several-ways).

## The tunnel works, but S1 Code does not answer

The host's tunnel is up, but it cannot reach S1 Code on the host. Common causes:

- S1 Code on the host stopped, crashed, or is still starting.
- S1 Code restarted on a different port, for example after an update, and the
  tunnel still points at the old port.
- The server binds only one network address with `S1CODE_HOST`. The tunnel
  sends requests to `127.0.0.1`, so the server must also listen there.

Fix: restart S1 Code on the host. For the background service, run
`s1 service restart`. Then run `s1 connect status` on the host.

## The S1 Connect address does not resolve or answer

The host's S1 Connect address did not resolve, refused the connection, failed a
secure (TLS) connection, or did not answer in time.

Fix:

1. Make sure the host is awake and online.
2. On the host, run `s1 connect status`.
3. If the check fails only on the host, check the host's DNS, VPN, or proxy.
   If it says the host's network has an old cached answer, wait: it usually
   clears within about 30 minutes.
4. If it says the address no longer points to this machine's tunnel, the
   environment was likely removed from S1 Connect. Link it again: on a desktop
   host, turn **S1 Connect** off and on in **Settings > Sharing & access**. On a
   command-line host, run `s1 connect link`, then restart S1 Code.

## This device can't reach S1 Connect

The problem is on this device's network, not on the host. This device could
not reach S1 Connect, or it reached S1 Connect but not the host's tunnel
address.

Fix:

1. Check this device's internet connection. On a captive or dead Wi-Fi network,
   the device can look online but cannot reach anything.
2. A VPN, firewall, ad blocker, or DNS filter on this device can block S1
   Connect. Turn it off for a moment to test.
3. On iPhone, Connectivity Assist in the Wi-Fi settings can break S1 Connect.
   Turn it off to test.
4. Try another network, or add a direct route to the host, such as its
   Tailscale address. See
   [Reach one machine several ways](./remote-access.md#reach-one-machine-several-ways).

## Sign-in, account, or link problems

This device's S1 Connect sign-in is not ready yet, or S1 Connect does not have
an active link between your account and the host.

- **The host is linked to a different account.** Sign in to the same S1 Connect
  account on this device and on the host. On the host, run `s1 connect logout`,
  then `s1 connect`.
- **S1 Connect is off on the host, or the host only publishes agent activity.**
  On the host, open **Settings > Sharing & access** and turn **S1 Connect** on, or
  run `s1 connect`.
- **The host was linked, but the server did not apply the link yet.** Restart
  the server on the host: quit and reopen the S1 Code desktop app, run
  `s1 service restart`, or stop `s1 serve` and run it again.
- **This device's sign-in expired, or the host no longer accepts this
  device.** Sign out of S1 Connect and sign in again.
- **This device is still loading its S1 Connect sign-in.** Wait a moment;
  S1 Code retries on its own. If it keeps waiting, reload or restart S1 Code on
  this device.
- **The host is waiting for you to approve this device.** The host requires
  approval for new devices. Approve the code this device shows from a device
  that is already connected, or run `s1 auth connect-device approve <code>` on
  the host. See [Approve new devices](./remote-access.md#approve-new-devices).
- **Your account reached its tunnel limit.** Remove an environment you do not
  use from your S1 account's S1 Connect page, or
  [link a paid S1 Chat account](./remote-access.md#more-machines-with-s1-chat)
  for a higher limit. Then restart S1 Code on the host.

## The clock is off

S1 Connect signs requests with short-lived proofs. When the clock on this
device or the host is a few minutes wrong, S1 Connect rejects them. Turn on
automatic date and time on both devices, then retry.

## The host runs an older S1 Code

This app needs a newer S1 Code on the host. Update S1 Code on the host. See
[Updating S1 Code](./updating.md).

## S1 Connect returned an error

| Error                                                     | Fix                                                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment_link_limit_exceeded` or managed tunnel limit | Remove an unused environment or link a paid S1 Chat account, then restart S1 Code on the host.                                                                                                       |
| `auth_invalid` or `invalid_bearer`                        | Run `s1 connect login`. If credentials were revoked, run `s1 connect logout`, then `s1 connect` again. Restart the server after signing in.                                                          |
| Expired or invalid link proof                             | Check the host's date and time, update S1 Code, then restart it.                                                                                                                                     |
| HTTP 403 without a recognized error                       | If the host requires approval for new devices, update S1 Code on this device and approve it. Otherwise check relay access, proxies, and firewall rules. Keep any Cloudflare Ray ID for a bug report. |
| HTTP 408, 429, or 5xx                                     | Wait a few minutes. S1 Code retries temporary failures on its own.                                                                                                                                   |

After you fix a permanent rejection, restart the host's server with
`s1 service restart`. For a foreground server, stop it and run `s1 serve` again.

If S1 Code on the host disappears when SSH closes, see
[background-service troubleshooting](./background-service.md#troubleshooting).

## Report a problem

If none of this helps, open an issue on
[GitHub](https://github.com/s1egg/s1code/issues). Include:

- The text from **Copy diagnostics** in the environment's **Details**.
- The output of `s1 connect status` on the host.
- The trace ID, if one is shown.
- If the tunnel dropped earlier, the host's tunnel log, `relay-client.ndjson`
  in the logs folder (`~/.s1/userdata/logs` by default). It records when the
  tunnel connected, warned, exited, and restarted, with the tunnel token
  removed.
