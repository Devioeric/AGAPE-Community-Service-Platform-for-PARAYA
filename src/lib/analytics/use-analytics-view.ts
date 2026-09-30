"use client";

import { useEffect, useState } from "react";
import { parseAnalyticsView, type AnalyticsView, type AnalyticsViewData } from "./view-contract";

/** Each effect owns its controller; stale filter responses never become current. */
export function useAnalyticsView<T extends AnalyticsView>(view: T, query = "") {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: AnalyticsViewData<T> | null; loading: boolean; denied: boolean }>({ key: "", data: null, loading: true, denied: false });
  const key = `${view}:${query}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    if (view !== "overview") params.set("type", view);
    setState({ key, data: null, loading: true, denied: false });
    void (async () => {
      try {
        const response = await fetch(`/api/analytics?${params}`, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setState({ key, data: null, loading: false, denied: true });
          window.location.assign("/login");
          return;
        }
        if (response.status === 403) { setState({ key, data: null, loading: false, denied: true }); return; }
        if (!response.ok) throw new Error("Unavailable");
        const json = await response.json();
        const data = parseAnalyticsView(view, json.data);
        if (!controller.signal.aborted) setState({ key, data, loading: false, denied: false });
      } catch {
        if (!controller.signal.aborted) setState({ key, data: null, loading: false, denied: false });
      }
    })();
    return () => controller.abort();
  }, [key, query, view]);
  const current = state.key === key ? state : { data: null, loading: true, denied: false };
  return { ...current, error: !current.loading && !current.data, retry: () => setAttempt(value => value + 1) };
}
