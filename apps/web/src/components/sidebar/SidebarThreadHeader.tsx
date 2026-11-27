import { useGT } from "gt-react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

import { Button } from "../ui/button";
import { SidebarInput } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  projectName: string | null;
  onNewThread: () => void;
  newThreadDisabled: boolean;
  newThreadLabel: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  projectName,
  onNewThread,
  newThreadDisabled,
  newThreadLabel,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const gt = useGT();
  const resultsVisible = isSearching && searchResultCount > 0;
  // Shrinking results can remove the active option; never leave aria-activedescendant pointing at it.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 items-center gap-2 ps-1.5">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-sidebar-foreground">
          {projectName}
        </h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm-pill"
                aria-label={newThreadLabel}
                disabled={newThreadDisabled}
                onClick={onNewThread}
              />
            }
          >
            <PlusIcon />
          </TooltipTrigger>
          <TooltipPopup side="top">{newThreadLabel}</TooltipPopup>
        </Tooltip>
      </div>
      <div className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70">
        <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
        <SidebarInput
          ref={searchInputRef}
          nativeInput
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={gt("Search", { $context: "search field placeholder" })}
          aria-label={gt("Search threads")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsVisible}
          aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
          aria-activedescendant={
            activeResultExists
              ? `sidebar-thread-search-result-${activeSearchResultIndex}`
              : undefined
          }
          className="min-w-0 flex-1"
        />
        {isSearching ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="shrink-0"
            aria-label={gt("Clear thread search")}
            onClick={() => {
              onClearSearch();
              searchInputRef.current?.focus();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
