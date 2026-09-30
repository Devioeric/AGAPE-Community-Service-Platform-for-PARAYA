"use client";

import { useMemo, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import { cartoBasemap } from "@/lib/maps/basemap";

/** Only the background retries. Markers, polygons and application records remain mounted. */
export function CartoBasemap() {
  const config = cartoBasemap(process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY, process.env.NEXT_PUBLIC_AGAPE_LOCAL_PREVIEW === "true");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failedBatch = useRef(false);
  const handlers = useMemo(() => ({
    loading() { failedBatch.current = false; },
    tileerror() { failedBatch.current = true; setFailed(true); },
    load() { if (!failedBatch.current) setFailed(false); },
  }), []);

  return <>
    {config && <TileLayer key={attempt} {...config} eventHandlers={handlers} />}
    {(!config || failed) && <div
      role="status" data-testid="basemap-status"
      className="absolute top-14 left-3 right-3 z-[1000] w-fit max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-background/95 p-3 text-xs text-foreground shadow-card"
      onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
    >
      <p>{config ? "Map background could not be loaded." : "Map background is not configured."}</p>
      <p className="text-muted-foreground">Records and available overlays remain accessible.</p>
      {config && <button type="button" className="mt-2 rounded px-2 py-1 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={event => { event.stopPropagation(); failedBatch.current = false; setFailed(false); setAttempt(value => value + 1); }}
      >Retry map background</button>}
    </div>}
  </>;
}
