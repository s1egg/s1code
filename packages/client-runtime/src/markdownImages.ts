import {
  normalizeMarkdownLinkDestination,
  splitMarkdownLinkSearchAndHash,
} from "@s1tools/shared/markdownLinks";

export {
  classifyMarkdownImageSource,
  type MarkdownImageSource,
} from "@s1tools/shared/markdownLinks";

export function markdownImageSourceFragment(source: string): string {
  return splitMarkdownLinkSearchAndHash(normalizeMarkdownLinkDestination(source)).hash;
}
