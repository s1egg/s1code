import { useGT } from "gt-react";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useNavigateToMainApp } from "./mainAppLocation";

/** Leads a full-page view such as Pull requests or Workflows back to the thread it opened over. */
export function MainAppBackButton() {
  const gt = useGT();
  const navigateToMainApp = useNavigateToMainApp();
  const label = gt("Back");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="-ms-1.5 shrink-0 [-webkit-app-region:no-drag]"
            onClick={() => void navigateToMainApp()}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <ArrowLeftIcon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}
