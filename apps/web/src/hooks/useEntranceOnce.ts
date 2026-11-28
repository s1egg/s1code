import { useState } from "react";

/**
 * Whether a one-shot entrance should play: true once `active` turns on after mount, until
 * `onAnimationEnd` reports it ran. A value already on at mount never plays, so remounts
 * (virtualized rows, switching projects) stay still.
 */
export function useEntranceOnce(active: boolean) {
  const [previous, setPrevious] = useState(active);
  const [playing, setPlaying] = useState(false);
  if (active !== previous) {
    setPrevious(active);
    setPlaying(active);
  }
  return { playing, onAnimationEnd: () => setPlaying(false) };
}
