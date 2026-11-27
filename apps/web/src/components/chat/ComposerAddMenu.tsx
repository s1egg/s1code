import { T, useGT } from "gt-react";
import {
  BlocksIcon,
  FolderIcon,
  PaperclipIcon,
  PlugIcon,
  PlusIcon,
  SquareSlashIcon,
} from "lucide-react";

import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { ComposerControl } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";

export function ComposerAddMenu({
  hidden,
  onAttach,
  onFolder,
  onSlash,
  onConnectors,
  onPlugins,
}: {
  hidden: boolean;
  onAttach: (() => void) | null;
  onFolder: (() => void) | null;
  onSlash: (() => void) | null;
  onConnectors: () => void;
  onPlugins: (() => void) | null;
}) {
  const gt = useGT();
  const [open, setOpen] = useComposerMenuState(hidden);
  const floatingProps = useComposerMenuProps();
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <ComposerControl
            aria-label={gt("Add to message")}
            className="size-7 px-0 data-popup-open:bg-accent"
          />
        }
      >
        <PlusIcon aria-hidden="true" className="size-5 text-current" />
      </MenuTrigger>
      <MenuPopup side="top" align="start" width="content" {...floatingProps}>
        <MenuItem disabled={!onAttach} onClick={onAttach ?? undefined}>
          <PaperclipIcon aria-hidden="true" />
          <T>Add files or photos</T>
        </MenuItem>
        <MenuItem disabled={!onFolder} onClick={onFolder ?? undefined}>
          <FolderIcon aria-hidden="true" />
          <T>Add folder</T>
        </MenuItem>
        <MenuItem disabled={!onSlash} onClick={onSlash ?? undefined}>
          <SquareSlashIcon aria-hidden="true" />
          <T>Slash commands</T>
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger>
            <BlocksIcon aria-hidden="true" />
            <T>Connectors</T>
          </MenuSubTrigger>
          <MenuSubPopup {...floatingProps}>
            <MenuItem onClick={onConnectors}>
              <T>Use in another app (MCP)</T>
            </MenuItem>
          </MenuSubPopup>
        </MenuSub>
        <MenuItem disabled={!onPlugins} onClick={onPlugins ?? undefined}>
          <PlugIcon aria-hidden="true" />
          <T>Add plugins</T>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
