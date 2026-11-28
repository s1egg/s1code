/**
 * Desktop pages render in a separately hosted webview, so neither their clicks nor their focus
 * reach the pane that shows them. The webview reports both here, by runtime tab id.
 */
type GuestFocusListener = (runtimeTabId: string) => void;

const listeners = new Set<GuestFocusListener>();

export function reportBrowserGuestFocus(runtimeTabId: string): void {
  for (const listener of listeners) listener(runtimeTabId);
}

export function subscribeBrowserGuestFocus(listener: GuestFocusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
