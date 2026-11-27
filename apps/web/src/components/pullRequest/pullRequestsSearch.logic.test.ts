import { describe, expect, it } from "vite-plus/test";

import { pullRequestsSearchFromUrl } from "./pullRequestsSearch.logic";

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
