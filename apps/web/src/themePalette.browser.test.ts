import { converter } from "culori/fn";
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
import { getStandardThemeColors } from "./themePalette";

const toRgb = converter("rgb");

function paintedChannels(variable: string, canvas: readonly number[] = [0, 0, 0]): number[] {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  try {
    const color = toRgb(getComputedStyle(probe).backgroundColor)!;
    const alpha = color.alpha ?? 1;
    return [color.r, color.g, color.b].map(
      (channel, index) => (channel * alpha + (canvas[index]! / 255) * (1 - alpha)) * 255,
    );
  } finally {
    probe.remove();
  }
}

describe("standard painted theme colors", () => {
  it("match the chip surfaces index.css paints", () => {
    const root = document.documentElement;
    try {
      for (const appearance of ["light", "dark"] as const) {
        root.classList.toggle("dark", appearance === "dark");
        const colors = getStandardThemeColors(appearance);
        const canvas = paintedChannels("--background");
        for (const [variable, role] of [
          ["--background", "canvas"],
          ["--card", "surface"],
          ["--surface-raised", "surfaceRaised"],
          ["--message-surface", "messageSurface"],
        ] as const) {
          const expected = toRgb(colors[role])!;
          const painted = paintedChannels(variable, canvas);
          [expected.r, expected.g, expected.b].forEach((channel, index) => {
            expect(Math.abs(channel * 255 - painted[index]!), `${appearance} ${role}`).toBeLessThan(
              1.5,
            );
          });
        }
      }
    } finally {
      root.classList.remove("dark");
    }
  });
});

describe("background glow", () => {
  it("tints the stock glow with the clay accent, not the near-white primary", () => {
    const glowAccent = getComputedStyle(document.documentElement).getPropertyValue("--glow-accent");
    expect(glowAccent.trim()).toBe("#d97757");
  });

  it("paints inline panel panes but skips content inside their scrollers", () => {
    const root = document.documentElement;
    root.style.setProperty("--background-glow", "30%");
    const panel = document.createElement("div");
    panel.dataset.previewPanelMode = "inline";
    panel.innerHTML = `
      <div class="bg-background" data-probe="pane">
        <div class="overflow-auto"><div class="sticky bg-background" data-probe="cell"></div></div>
      </div>`;
    document.body.append(panel);
    try {
      const imageOf = (probe: string) =>
        getComputedStyle(panel.querySelector(`[data-probe="${probe}"]`)!).backgroundImage;
      expect(imageOf("pane")).toContain("radial-gradient");
      expect(imageOf("cell")).toBe("none");
    } finally {
      panel.remove();
      root.style.removeProperty("--background-glow");
    }
  });
});
