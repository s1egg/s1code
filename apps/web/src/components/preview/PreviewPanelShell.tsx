import type { ReactNode } from "react";

/** The frame a browser or device surface fills inside its pane. */
export function PreviewPanelShell(props: { children: ReactNode }) {
  return (
    <div
      className="relative flex h-full min-h-0 w-full min-w-0 max-w-full flex-col self-stretch"
      data-preview-panel-mode="embedded"
    >
      {props.children}
    </div>
  );
}
