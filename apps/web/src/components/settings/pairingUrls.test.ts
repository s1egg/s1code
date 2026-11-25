import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveDesktopPairingUrl, resolveHostedPairingUrl } from "./pairingUrls";

describe("settings pairing URL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses direct backend pairing URLs for HTTP endpoints", () => {
    expect(resolveHostedPairingUrl("http://192.168.1.44:4773", "PAIRCODE")).toBeNull();
    expect(resolveDesktopPairingUrl("http://192.168.1.44:4773", "PAIRCODE")).toBe(
      "http://192.168.1.44:4773/pair#token=PAIRCODE",
    );
  });

  it("uses hosted pairing URLs for HTTPS endpoints", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.s1.codes");

    expect(resolveHostedPairingUrl("https://host.tailnet.example.ts.net:4773", "PAIRCODE")).toBe(
      "https://preview.s1.codes/pair?host=https%3A%2F%2Fhost.tailnet.example.ts.net%3A4773#token=PAIRCODE",
    );
  });
});
