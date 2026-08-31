"use client";

import { useEffect, useRef } from "react";
import { useLooks } from "@/lib/looks";
import { loadLooks, scheduleSaveLooks } from "@/lib/persist";

/**
 * Restores saved looks on mount, then persists every change.
 *
 * The `restored` gate is not belt-and-braces. Without it the save effect runs
 * on mount with an empty array, and because the write is debounced that empty
 * write lands AFTER the IndexedDB read resolves — so the first render of the
 * page erases every look the customer saved in their last session. Saving is
 * only allowed once the restore has actually had its turn.
 *
 * A hook rather than a copy in each route, because there are two routes and
 * this failure is invisible: nothing errors, the strip is simply empty forever.
 */
export function useSavedLooks(): void {
  const looks = useLooks((s) => s.looks);
  const restored = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadLooks().then((saved) => {
      if (cancelled) return; // a superseded mount must not claim the restore
      // Only over an untouched strip: a slow disk must not undo a look the
      // human saved while waiting for it.
      if (saved?.length && useLooks.getState().looks.length === 0) {
        useLooks.getState().replaceAll(saved);
      }
      restored.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restored.current) scheduleSaveLooks(looks);
  }, [looks]);
}
