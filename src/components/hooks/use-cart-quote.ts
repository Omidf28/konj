"use client";
import { useEffect, useState } from "react";
import { requestCartQuote } from "@/lib/quote-request";
import { useCart } from "../cart-provider";
import type { Quote } from "@/lib/commerce-types";
export function useCartQuote() {
  const { state } = useCart();
  const signature = JSON.stringify(state.items);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    signature: string;
    attempt: number;
    quote?: Quote;
    error?: string;
    itemKey?: string;
  } | null>(null);
  useEffect(() => {
    if (!state.ready || !state.items.length) return;
    const controller = new AbortController();
    let active = true;
    requestCartQuote(state.items, controller.signal)
      .then((quote) => {
        if (active) setResult({ signature, attempt, quote });
      })
      .catch((error) => {
        if (active && error.name !== "AbortError")
          setResult({
            signature,
            attempt,
            itemKey: error.itemKey,
            error: error.message || "ارتباط با سرور برقرار نشد.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [signature, state.items, state.ready, attempt]);
  const current =
    result?.signature === signature && result.attempt === attempt
      ? result
      : null;
  return {
    quote: current?.quote,
    error: current?.error,
    errorItemKey: current?.itemKey,
    pending: state.ready && state.items.length > 0 && !current,
    refresh: () => setAttempt((value) => value + 1),
  };
}
