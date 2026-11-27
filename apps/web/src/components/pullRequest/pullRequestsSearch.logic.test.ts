import {
  EnvironmentId,
  ProjectId,
  SourceControlProviderKind,
  type RepositoryIdentity,
} from "@s1tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { pullRequestsSearchFromUrl, resolveLinkedPullRequest } from "./pullRequestsSearch.logic";

// The router's search parser reads `q=4089` as the number 4089 and `q="4089"` as the text.
describe("pullRequestsSearchFromUrl", () => {
  it("drops a q the URL parser turned into a number", () => {
    expect(pullRequestsSearchFromUrl({ q: 4089 }).q).toBeUndefined();
    expect(pullRequestsSearchFromUrl({ q: true }).q).toBeUndefined();
  });

  it("keeps a q that is text, including quoted digits", () => {
    expect(pullRequestsSearchFromUrl({ q: "fix" }).q).toBe("fix");
    expect(pullRequestsSearchFromUrl({ q: "4089" }).q).toBe("4089");
  });

  it("drops an author or labels the URL parser turned into a number", () => {
    expect(pullRequestsSearchFromUrl({ author: 4089 }).author).toBeUndefined();
    expect(pullRequestsSearchFromUrl({ labels: 4089 }).labels).toBeUndefined();
  });

  it("cuts a long author and label before an emoji the limit would split", () => {
    const author = "a".repeat(199);
    const label = "b".repeat(199);
    expect(
      pullRequestsSearchFromUrl({ author: `${author}😀`, labels: `${label}🐛` }),
    ).toMatchObject({ author, labels: [label] });
  });
});

describe("resolveLinkedPullRequest", () => {
  const LOCAL = EnvironmentId.make("local");
  const REMOTE = EnvironmentId.make("remote");
  const project = (id: string, environmentId: EnvironmentId, repository: string) => ({
    id: ProjectId.make(id),
    environmentId,
    repositoryIdentity: {
      canonicalKey: `github.com/${repository}`,
      locator: { source: "git-remote", remoteName: "origin", remoteUrl: "" },
      provider: SourceControlProviderKind.make("github"),
      displayName: repository,
    } satisfies RepositoryIdentity,
  });
  const web = project("web", LOCAL, "acme/web");
  const localApi = project("api", LOCAL, "acme/api");
  const remoteApi = project("api", REMOTE, "acme/api");
  const projects = [web, localApi, remoteApi];
  const known = new Set([LOCAL, REMOTE]);
  const linked = (raw: Record<string, unknown>) =>
    resolveLinkedPullRequest(pullRequestsSearchFromUrl(raw), projects, known);

  it("finds the project from the repository when the address names none", () => {
    expect(linked({ repository: "acme/web", number: 12 })).toEqual({
      environmentId: LOCAL,
      projectId: web.id,
      repository: "acme/web",
      number: 12,
    });
  });

  it("prefers the list's server, then a named server, for a repository on both", () => {
    expect(linked({ repository: "acme/api", number: 3, environmentId: REMOTE })).toMatchObject({
      environmentId: REMOTE,
    });
    expect(
      linked({
        repository: "acme/api",
        number: 3,
        environmentId: REMOTE,
        selectedEnvironmentId: LOCAL,
      }),
    ).toMatchObject({ environmentId: LOCAL });
  });

  it("keeps the URL only when it names the same pull request", () => {
    const url = "https://github.com/acme/web/pull/12";
    expect(linked({ repository: "acme/web", number: 12, selectedUrl: url })).toMatchObject({
      url,
      revealUrl: url,
    });
    const other = linked({
      repository: "acme/web",
      number: 12,
      selectedUrl: "https://github.com/acme/web/pull/99",
    });
    expect(other).not.toHaveProperty("url");
    expect(other).not.toHaveProperty("revealUrl");
    for (const selectedUrl of [
      "https://gitlab.com/acme/web/-/merge_requests/12",
      "https://git.cafe/acme/web/pull/12",
    ]) {
      const otherForge = linked({ repository: "acme/web", number: 12, selectedUrl });
      expect(otherForge, selectedUrl).toMatchObject({ projectId: web.id });
      expect(otherForge, selectedUrl).not.toHaveProperty("url");
    }
  });

  it("opens nothing for a repository no project holds", () => {
    expect(linked({ repository: "acme/gone", number: 1 })).toBeNull();
  });
});
