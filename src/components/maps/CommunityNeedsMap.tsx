"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import BOCAUE_BOUNDARIES from "@/lib/bocaue-boundaries";

// ─── Public API ─────────────────────────────────────────────────────────────

export interface MapBarangay {
  id:        string;
  name:      string;
  latitude:  number | null;
  longitude: number | null;
}

export interface NeedRow {
  id:          string;
  barangay_id: string | null;
  category:    string;        // health | economic | environmental | social | …
  title:       string;
  sitio:       string | null;
  priority?:   string | null; // high | medium | low
}

interface Props {
  /** All partner barangays — used for polygon lookup and color scale. */
  barangays: MapBarangay[];
  /** All community needs in scope (already filtered server-side by approval). */
  needs:     NeedRow[];
  /** When set, focus the map on this barangay only. */
  selectedBarangayId?: string;
  /** Height of the map container. Defaults to 480px. */
  height?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BOCAUE_CENTER: [number, number] = [14.7975, 120.9281];
const DEFAULT_ZOOM = 13;

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  health:        { label: "Health",        color: "#9B3B3B" },
  economic:      { label: "Economic",      color: "#C4A96A" },
  environmental: { label: "Environmental", color: "#4A7C59" },
  social:        { label: "Social",        color: "#5B7FA5" },
};

// Color ramp for need density. Higher count → deeper amber.
const DENSITY_RAMP = [
  { upTo: 0,   color: "#F5F0E8", label: "No needs" },
  { upTo: 2,   color: "#E8D5A8", label: "1–2" },
  { upTo: 5,   color: "#C4A96A", label: "3–5" },
  { upTo: 10,  color: "#8B7A5E", label: "6–10" },
  { upTo: 999, color: "#4A3F2B", label: "10+" },
] as const;

function densityColor(n: number): string {
  for (const tier of DENSITY_RAMP) if (n <= tier.upTo) return tier.color;
  return DENSITY_RAMP[DENSITY_RAMP.length - 1].color;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise barangay name for matching against PSGC boundary names:
 *  lowercase, strip diacritics (ñ→n), drop non-alphanumerics. */
function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function featureName(f: Feature): string {
  const p = f.properties as Record<string, string> | null;
  return p?.adm4_en ?? p?.ADM4_EN ?? p?.name ?? "";
}

// ─── Inner: auto-fit to selected barangay ───────────────────────────────────

function FitToFeature({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) {
      map.setView(BOCAUE_CENTER, DEFAULT_ZOOM);
      return;
    }
    try {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    } catch {
      map.setView(BOCAUE_CENTER, DEFAULT_ZOOM);
    }
  }, [map, feature]);
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommunityNeedsMap({
  barangays, needs, selectedBarangayId, height = "480px",
}: Props) {
  useEffect(() => {
    // Avoid "missing default icon" Leaflet quirk in Next bundles.
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  }, []);

  // Build a map of barangay name → id + need count for color scaling.
  const needsByBarangayId = useMemo(() => {
    const m = new Map<string, NeedRow[]>();
    for (const n of needs) {
      if (!n.barangay_id) continue;
      const arr = m.get(n.barangay_id) ?? [];
      arr.push(n);
      m.set(n.barangay_id, arr);
    }
    return m;
  }, [needs]);

  const barangayByNormName = useMemo(() => {
    const m = new Map<string, MapBarangay>();
    for (const b of barangays) m.set(normalizeName(b.name), b);
    return m;
  }, [barangays]);

  // Polygons we'll render: when a barangay is selected, just that one; otherwise
  // every partner barangay we can match in BOCAUE_BOUNDARIES.
  const polygonFeatures: FeatureCollection = useMemo(() => {
    const features = BOCAUE_BOUNDARIES.features.filter((f) => {
      const b = barangayByNormName.get(normalizeName(featureName(f)));
      if (!b) return false;
      if (selectedBarangayId && b.id !== selectedBarangayId) return false;
      return true;
    });
    return { type: "FeatureCollection", features };
  }, [selectedBarangayId, barangayByNormName]);

  // The single feature when one barangay is focused (for fit-to-bounds).
  const focusedFeature: Feature | null = useMemo(() => {
    if (!selectedBarangayId) return null;
    return polygonFeatures.features[0] ?? null;
  }, [selectedBarangayId, polygonFeatures]);

  // Per-barangay summary, used by both the legend and the side panel.
  const selectedBarangay = useMemo(() =>
    selectedBarangayId ? barangays.find((b) => b.id === selectedBarangayId) : null,
  [selectedBarangayId, barangays]);

  const selectedNeeds = useMemo(() =>
    selectedBarangayId ? (needsByBarangayId.get(selectedBarangayId) ?? []) : needs,
  [selectedBarangayId, needsByBarangayId, needs]);

  const categoryBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of selectedNeeds) m.set(n.category, (m.get(n.category) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedNeeds]);

  const sitioBreakdown = useMemo(() => {
    if (!selectedBarangayId) return [];
    const m = new Map<string, NeedRow[]>();
    for (const n of selectedNeeds) {
      const key = n.sitio?.trim() || "(unspecified sitio)";
      const arr = m.get(key) ?? [];
      arr.push(n);
      m.set(key, arr);
    }
    return Array.from(m.entries())
      .map(([sitio, items]) => ({ sitio, count: items.length, items }))
      .sort((a, b) => b.count - a.count);
  }, [selectedBarangayId, selectedNeeds]);

  // Style function for the GeoJSON polygons (color by density).
  function styleForFeature(feature?: Feature): PathOptions {
    const b = feature ? barangayByNormName.get(normalizeName(featureName(feature))) : null;
    const n = b ? (needsByBarangayId.get(b.id)?.length ?? 0) : 0;
    return {
      color:       "#6B5B3E",
      weight:      selectedBarangayId ? 2.5 : 1.5,
      opacity:     0.9,
      fillColor:   densityColor(n),
      fillOpacity: selectedBarangayId ? 0.55 : 0.5,
    };
  }

  function onEachFeature(feature: Feature, layer: Layer) {
    const name = featureName(feature);
    const b = barangayByNormName.get(normalizeName(name));
    const n = b ? (needsByBarangayId.get(b.id)?.length ?? 0) : 0;

    (layer as L.Path).bindTooltip(
      `<div style="font-family:'DM Sans',sans-serif;">
         <div style="font-weight:600;color:#2C2416;">${name.toUpperCase()}</div>
         <div style="color:#6B6356;font-size:11px;">${n} community need${n === 1 ? "" : "s"}</div>
       </div>`,
      { permanent: !!selectedBarangayId, direction: "center", className: "barangay-label" }
    );

    layer.on({
      mouseover: (e) => {
        const target = e.target as L.Path;
        target.setStyle({ weight: 3, fillOpacity: 0.7 });
        target.bringToFront();
      },
      mouseout: (e) => (e.target as L.Path).setStyle(styleForFeature(feature)),
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Force GeoJSON re-render when the focused barangay changes (so the style
  // function picks up the new "selected" weight).
  const geoKey = useRef(0);
  geoKey.current += 1;

  return (
    <div
      className="grid gap-3 lg:grid-cols-3"
      style={{ minHeight: height }}
    >
      {/* Map */}
      <div className="lg:col-span-2 rounded-xl overflow-hidden border border-border shadow-card" style={{ height }}>
        <MapContainer
          center={BOCAUE_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            subdomains="abcd"
            maxZoom={19}
          />
          <GeoJSON
            key={geoKey.current}
            data={polygonFeatures}
            style={styleForFeature}
            onEachFeature={onEachFeature}
          />
          <FitToFeature feature={focusedFeature} />
        </MapContainer>
      </div>

      {/* Side panel — legend + breakdown */}
      <aside
        className="rounded-xl border border-border bg-surface p-4 overflow-y-auto"
        style={{ height, maxHeight: height }}
      >
        <h3 className="font-heading text-sm font-semibold text-foreground mb-1">
          {selectedBarangay
            ? `${selectedBarangay.name} — Needs`
            : "Bocaue Partner Barangays"}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {selectedBarangay
            ? `${selectedNeeds.length} community need${selectedNeeds.length === 1 ? "" : "s"} recorded.`
            : `Polygons shaded by need density across ${barangays.length} partner barangay${barangays.length === 1 ? "" : "s"}.`}
        </p>

        {/* Category breakdown */}
        {categoryBreakdown.length > 0 ? (
          <div className="space-y-2 mb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              By Category
            </p>
            {categoryBreakdown.map(([cat, count]) => {
              const meta = CATEGORY_META[cat] ?? { label: cat, color: "#6B5B3E" };
              const pct = Math.round((count / selectedNeeds.length) * 100);
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic py-2">
            No needs recorded for this scope yet.
          </div>
        )}

        {/* Sitio breakdown — only when one barangay is focused */}
        {sitioBreakdown.length > 0 && (
          <div className="space-y-1.5 mt-4 pt-4 border-t border-border">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
              By Sitio
            </p>
            {sitioBreakdown.map((s) => (
              <div key={s.sitio} className="flex items-start justify-between text-xs gap-3 py-1.5 border-b border-border/40 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{s.sitio}</p>
                  <p className="text-muted-foreground text-[11px] truncate">
                    {s.items.slice(0, 2).map((i) => i.title).join(", ")}
                    {s.items.length > 2 && ` +${s.items.length - 2} more`}
                  </p>
                </div>
                <span className="text-foreground/70 tabular-nums shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Density legend — only when showing all barangays */}
        {!selectedBarangayId && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Density Scale
            </p>
            <div className="space-y-1">
              {DENSITY_RAMP.map((tier) => (
                <div key={tier.label} className="flex items-center gap-2 text-xs">
                  <div
                    className="w-4 h-4 rounded border border-border/60 shrink-0"
                    style={{ background: tier.color }}
                  />
                  <span className="text-muted-foreground">{tier.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
