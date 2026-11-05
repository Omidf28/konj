"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CART_KEY,
  createCartStore,
  type CartAction,
  type CartState,
} from "@/lib/cart-store";
import type { CartItem } from "@/lib/commerce-types";
const Context = createContext<{
  state: CartState;
  dispatch: (action: CartAction) => Promise<boolean>;
} | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createCartStore({
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      exclusive: async (operation) =>
        navigator.locks
          ? navigator.locks.request(CART_KEY, operation)
          : operation(),
    }),
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    store.sync();
    const storage = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === CART_KEY || event.key === null)
      )
        store.sync();
    };
    const visible = () => {
      if (document.visibilityState === "visible") store.sync();
    };
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [store]);
  return (
    <Context.Provider value={{ state, dispatch: store.dispatch }}>
      {children}
    </Context.Provider>
  );
}
export function useCart() {
  const context = useContext(Context);
  if (!context) throw Error("Cart provider missing");
  return context;
}
export function makeCartItem(
  productId: string,
  sku: string,
  quantity = 1,
): CartItem {
  return { key: productId + ":" + sku, productId, sku, quantity };
}
