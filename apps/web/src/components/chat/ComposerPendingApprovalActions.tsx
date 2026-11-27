import {
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
  type RuntimeRequestId,
} from "@s1tools/contracts";
import { standardApprovalLabel } from "@s1tools/client-runtime/state/thread-requests";
import { msg, useGT, useMessages } from "gt-react";
import { memo } from "react";
import { EllipsisIcon, TriangleAlertIcon } from "lucide-react";
import { Button, InlineButton } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";

interface ComposerPendingApprovalActionsProps {
  presentation?: "composer" | "inline";
  requestId: RuntimeRequestId;
  isResponding: boolean;
  canRespond: boolean;
  disabled?: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

// Mobile's PendingApprovalCard offers the same three, minus cancel.
const DEFAULT_APPROVAL_OPTIONS = [
  { decision: "accept", label: msg("Allow once") },
  { decision: "acceptForSession", label: msg("Allow session") },
  {
    decision: "decline",
    label: msg("Decline", { $context: "verb, response to an approval request" }),
  },
  {
    decision: "cancel",
    label: msg("Cancel", { $context: "verb, response to an approval request" }),
  },
] satisfies ReadonlyArray<ProviderApprovalOption>;

// Buttons, in this order. Cancel, acceptAlways, and any future decision go in the menu.
const VISIBLE_DECISIONS: ReadonlyArray<ProviderApprovalDecision> = [
  "accept",
  "acceptForSession",
  "decline",
];

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  presentation = "composer",
  requestId,
  isResponding,
  canRespond,
  disabled = false,
  options = DEFAULT_APPROVAL_OPTIONS,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const gt = useGT();
  const m = useMessages();
  const optionLabel = (option: ProviderApprovalOption) => {
    const standard =
      options === DEFAULT_APPROVAL_OPTIONS
        ? option.label
        : standardApprovalLabel(option, DEFAULT_APPROVAL_OPTIONS);
    return standard === undefined ? option.label : m(standard);
  };
  const primaryOptions = VISIBLE_DECISIONS.flatMap((decision) =>
    options.filter((option) => option.decision === decision),
  );
  const moreOptions = options.filter((option) => !VISIBLE_DECISIONS.includes(option.decision));

  return (
    <>
      {primaryOptions.map((option) => {
        const buttonProps = {
          disabled: disabled || isResponding || !canRespond,
          "aria-description": option.warning,
          onClick: () => {
            if (!disabled && !isResponding && canRespond) {
              void onRespondToApproval(requestId, option.decision);
            }
          },
        };
        const content = (
          <>
            {option.warning ? <TriangleAlertIcon className="size-3 shrink-0" /> : null}
            <span className={presentation === "inline" ? "whitespace-normal" : "max-w-40 truncate"}>
              {optionLabel(option)}
            </span>
          </>
        );
        const button =
          presentation === "inline" ? (
            <InlineButton
              key={option.decision}
              {...buttonProps}
              tone={option.decision === "decline" ? "muted" : "default"}
            >
              {content}
            </InlineButton>
          ) : (
            <Button
              key={option.decision}
              {...buttonProps}
              size="xs"
              variant={
                option.decision === "accept"
                  ? "default"
                  : option.decision === "decline"
                    ? "ghost"
                    : "outline"
              }
            >
              {content}
            </Button>
          );
        return option.warning ? (
          <Tooltip key={option.decision}>
            <TooltipTrigger render={button} />
            <TooltipPopup side="top">{option.warning}</TooltipPopup>
          </Tooltip>
        ) : (
          button
        );
      })}
      {moreOptions.length > 0 ? (
        <Menu>
          <MenuTrigger
            disabled={disabled || isResponding || !canRespond}
            render={
              presentation === "inline" ? (
                <InlineButton tone="muted" aria-label={gt("More approval options")} />
              ) : (
                <Button size="icon-xs" variant="outline" aria-label={gt("More approval options")} />
              )
            }
          >
            {presentation === "inline" ? (
              gt("More", { $context: "button that opens more approval options" })
            ) : (
              <EllipsisIcon />
            )}
          </MenuTrigger>
          <MenuPopup {...composerFloatingLayerProps} side="top" align="end" width="content">
            {moreOptions.map((option) => {
              const item = (
                <MenuItem
                  key={option.decision}
                  disabled={disabled || isResponding || !canRespond}
                  aria-description={option.warning}
                  onClick={() => {
                    if (!disabled && !isResponding && canRespond)
                      void onRespondToApproval(requestId, option.decision);
                  }}
                >
                  {option.warning ? <TriangleAlertIcon className="size-3 text-warning" /> : null}
                  <span className="min-w-0 whitespace-normal wrap-break-word">
                    {optionLabel(option)}
                  </span>
                </MenuItem>
              );
              return option.warning ? (
                <Tooltip key={option.decision}>
                  <TooltipTrigger render={item} />
                  <TooltipPopup side="top">{option.warning}</TooltipPopup>
                </Tooltip>
              ) : (
                item
              );
            })}
          </MenuPopup>
        </Menu>
      ) : null}
    </>
  );
});
