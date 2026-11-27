import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ProjectId, ThreadId } from "@s1tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import * as commandPalette from "../commandPaletteBus";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import * as previewActions from "../components/preview/previewActionBus";
import * as settings from "../hooks/useSettings";
import * as storage from "../hooks/useLocalStorage";
import * as newThread from "../hooks/useHandleNewThread";
import * as entities from "../state/entities";
import * as projectsState from "../state/projects";
import * as session from "../state/session";
import { Atom } from "effect/reactivity";
import { makeThreadFixture } from "../test-fixtures";
import type { Project } from "../types";
import { installChatRouteCommands } from "./chatRouteCommands";
import * as dispatcher from "./dispatcher";

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("new thread commands", () => {
  const two = [project("active"), project("idle")];
  const archivedOld = { ...project("old"), archivedAt: "2026-03-01T00:00:00.000Z" };
  it.each([
    { name: "2 projects, chat.new", command: "chat.new", projects: two, target: null },
    { name: "1 project, chat.new", command: "chat.new", projects: [two[0]!], target: "active" },
    { name: "2 projects, chat.newLocal", command: "chat.newLocal", projects: two, target: "idle" },
    {
      name: "1 project before its environment config arrives",
      command: "chat.new",
      projects: [two[0]!],
      configPending: true,
      target: null,
    },
    {
      name: "viewing the only copy of an archived project, chat.new",
      command: "chat.new",
      projects: [archivedOld, two[0]!],
      viewing: "old",
      target: null,
    },
    {
      name: "viewing the only copy of an archived project, chat.newLocal",
      command: "chat.newLocal",
      projects: [archivedOld, two[0]!],
      viewing: "old",
      target: null,
    },
  ] as const)("$name: starts in $target", (scenario) => {
    using _settings = vi
      .spyOn(settings, "getClientSettings")
      .mockReturnValue(DEFAULT_CLIENT_SETTINGS);
    using _projects = vi.spyOn(entities, "readProjects").mockReturnValue(scenario.projects);
    using _config = vi
      .spyOn(entities, "readEnvironmentServerConfigLoaded")
      .mockReturnValue(!("configPending" in scenario));
    const viewedThreadId = ThreadId.make("viewed");
    using _shell = vi.spyOn(entities, "readThreadShell").mockReturnValue(
      "viewing" in scenario
        ? makeThreadFixture({
            environmentId: EnvironmentId.make("local"),
            id: viewedThreadId,
            projectId: ProjectId.make(scenario.viewing),
          })
        : null,
    );
    using _ready = vi
      .spyOn(projectsState, "defaultProjectFallbackReadyAtom")
      .mockReturnValue(Atom.make(true));
    using storedProject = vi.spyOn(storage, "getLocalStorageItem").mockReturnValue("local:active");
    using openPicker = vi.spyOn(commandPalette, "openCommandPalette").mockImplementation(() => {});
    const startThread = vi.fn().mockResolvedValue(null);
    using _handler = vi.spyOn(newThread, "createNewThreadHandler").mockReturnValue(startThread);
    using register = vi.spyOn(dispatcher, "registerCommands").mockReturnValue(() => {});
    const matches =
      "viewing" in scenario
        ? [{ params: { environmentId: "local", threadId: viewedThreadId } }]
        : [];
    const router = { state: { matches } } as unknown as AnyRouter;
    using stack = new DisposableStack();
    stack.defer(installChatRouteCommands(router));
    const commands = register.mock.calls[0]![0];
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    storedProject.mockReturnValue("local:idle");
    commands[scenario.command]!(event);

    if (scenario.target === null) {
      expect(openPicker).toHaveBeenCalledWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openPicker).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith({
        environmentId: "local",
        projectId: scenario.target,
      });
    }
  });
});

describe("preview commands", () => {
  it.each([
    { command: "preview.find", action: "find" },
    { command: "preview.refresh", action: "refresh" },
    { command: "preview.focusUrl", action: "focus-url" },
  ] as const)("$command reaches the right panel on a draft thread", ({ command, action }) => {
    const draftId = DraftId.make("draft-1");
    useComposerDraftStore
      .getState()
      .setProjectDraftThreadId(
        { environmentId: EnvironmentId.make("local"), projectId: ProjectId.make("active") },
        draftId,
      );
    using stack = new DisposableStack();
    stack.defer(() => useComposerDraftStore.getState().clearDraftThread(draftId));
    using _scope = vi.spyOn(session, "readEnvironmentScope").mockReturnValue(true);
    using dispatch = vi.spyOn(previewActions, "dispatchPreviewAction").mockImplementation(() => {});
    using register = vi.spyOn(dispatcher, "registerCommands").mockReturnValue(() => {});
    const router = {
      state: { matches: [{ routeId: "/_chat/draft/$draftId", params: { draftId } }] },
    } as unknown as AnyRouter;
    stack.defer(installChatRouteCommands(router));
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;

    register.mock.calls[0]![0][command]!(event);

    expect(dispatch).toHaveBeenCalledWith(action);
  });

  it("preview.find leaves the key unclaimed on non-thread chat routes", () => {
    using dispatch = vi.spyOn(previewActions, "dispatchPreviewAction").mockImplementation(() => {});
    using register = vi.spyOn(dispatcher, "registerCommands").mockReturnValue(() => {});
    const router = {
      state: { matches: [{ routeId: "/_chat/pull-requests", params: {} }] },
    } as unknown as AnyRouter;
    using stack = new DisposableStack();
    stack.defer(installChatRouteCommands(router));
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent;

    const result = register.mock.calls[0]![0]["preview.find"]!(event);

    expect(result).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
