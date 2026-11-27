/// <reference lib="dom" />
import { expect } from "e2e";

import { test, WEB } from "./s1.ts";

test(
  "The rail tile for threads without a project follows the app language",
  WEB,
  async ({ s1, app, browser, screen }) => {
    const project = await s1.project("scenario-scratch");
    const thread = await s1.thread({ project, title: "Scratch work", messages: ["Start"] });

    // The scenario home is inside a Git checkout, where the server disables native scratch.
    // Advertise the seeded workspace as scratch while leaving the real project and thread in place.
    await browser.addInitScript((scratchWorkspaceRoot) => {
      const configRequests = new WeakMap<WebSocket, string>();
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === "string") {
          for (const request of [JSON.parse(data)].flat()) {
            if (request?._tag === "Request" && request.tag === "subscribeServerConfig") {
              configRequests.set(this, String(request.id));
            }
          }
        }
        return send.call(this, data);
      };
      const addEventListener = WebSocket.prototype.addEventListener;
      WebSocket.prototype.addEventListener = function (
        this: WebSocket,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (type !== "message" || typeof listener !== "function") {
          return addEventListener.call(this, type, listener, options);
        }
        return addEventListener.call(
          this,
          type,
          (event: Event) => {
            const data = (event as MessageEvent).data;
            if (typeof data !== "string") return listener.call(this, event);
            const parsed = JSON.parse(data);
            let changed = false;
            for (const message of [parsed].flat()) {
              if (
                message?._tag !== "Chunk" ||
                String(message.requestId) !== configRequests.get(this)
              )
                continue;
              for (const value of message.values) {
                if (value.type === "snapshot") {
                  value.config.scratchWorkspaceRoot = scratchWorkspaceRoot;
                  changed = true;
                }
              }
            }
            return listener.call(
              this,
              changed ? new MessageEvent("message", { data: JSON.stringify(parsed) }) : event,
            );
          },
          options,
        );
      } as typeof WebSocket.prototype.addEventListener;
    }, project);

    // The rail tile's name gains a status after it while the thread works.
    await s1.open(thread);
    await screen.getByRole("button", /^Threads without a project/).waitFor({ timeout: 60_000 });
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await screen.getByLabel("Language", { exact: true }).tap();
    await screen.getByText("日本語", { exact: true }).tap();
    await screen.getByLabel("言語", { exact: true }).waitFor();
    await browser.keyboard.press("Escape");
    await expect(screen.getByRole("button", /^プロジェクトなしのスレッド/)).toBeVisible();
    await app.screenshot("scratch-tile-in-japanese");
  },
);
