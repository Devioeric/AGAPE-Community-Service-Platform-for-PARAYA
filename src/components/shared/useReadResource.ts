"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonData, ReadFailure, type ReadStatus } from "@/lib/read-resource";

/** Each resource owns its request, cancellation and recovery; failures never become empty data. */
export function useReadResource<T>(url: string | null, parse: (data: unknown) => T) {
  const [state, setState] = useState<{ key: string | null; status: ReadStatus; data: T | null }>({ key: url, status: url ? "loading" : "denied", data: null });
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    if (!url) { setState({ key: url, status: "denied", data: null }); return; }
    const controller = new AbortController();
    active.current = controller;
    setState({ key: url, status: "loading", data: null });
    try {
      const data = await readJsonData(await fetch(url, { cache: "no-store", signal: controller.signal }), parse);
      if (controller.signal.aborted) return;
      setState({ key: url, status: "success", data });
      return data;
    } catch (error) {
      if (controller.signal.aborted) return;
      const denied = error instanceof ReadFailure && [401, 403].includes(error.status);
      setState({ key: url, status: denied ? "denied" : "error", data: null });
      if (error instanceof ReadFailure && error.status === 401) window.location.assign("/login");
    }
  }, [url, parse]);
  useEffect(() => { void reload(); return () => active.current?.abort(); }, [reload]);
  const current = state.key === url ? state : { status: url ? "loading" as const : "denied" as const, data: null };
  return { ...current, reload };
}
