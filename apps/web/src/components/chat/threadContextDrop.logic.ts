import type { ScopedThreadRef } from "@s1tools/contracts";
import { threadContextRecord } from "@s1tools/shared/composerContextReferences";

export type ThreadContextDropRef = ScopedThreadRef & { readonly title?: string };

export function droppedThreadContextRecord(
  ref: ThreadContextDropRef,
  shell: { readonly title: string } | null,
) {
  const title = ref.title ?? shell?.title;
  return title === undefined ? null : threadContextRecord(ref, title);
}
