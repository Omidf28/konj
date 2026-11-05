"use client";
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type SetStateAction,
} from "react";
import { createDraftStore } from "@/lib/admin-drafts";
export function useAdminDrafts<T extends object>(owner: string | undefined) {
  const store = useMemo(
    () =>
      createDraftStore(
        {
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
          removeItem: (key) => sessionStorage.removeItem(key),
        },
        owner,
      ),
    [owner],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => store.hydrate(), [store]);
  return {
    values: state.values as Record<string, T>,
    setValues: (update: SetStateAction<Record<string, T>>) =>
      store.update((previous) =>
        typeof update === "function"
          ? update(previous as Record<string, T>)
          : update,
      ),
    warning: state.warning,
    clear: store.clear,
  };
}
