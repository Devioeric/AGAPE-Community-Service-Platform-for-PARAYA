"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

export interface MapProgram {
  id:          string;
  title:       string;
  status:      string;
  start_date:  string | null;
  end_date:    string | null;
  barangay_id: string | null;
  barangays: {
    name:      string;
    latitude:  number | null;
    longitude: number | null;
  } | null;
}

interface ProgramMapProps {
  programs: MapProgram[];
  height?:  string;
}

const BOCAUE_CENTER: [number, number] = [14.7975, 120.9281];

// Status display config
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; priority: number }> = {
  active:    { color: "#4A7C59", bg: "#e8f4ec", label: "Active",    priority: 1 },
  upcoming:  { color: "#5B7FA5", bg: "#e8eef5", label: "Upcoming",  priority: 2 },
  draft:     { color: "#9C9488", bg: "#f5f0e8", label: "Draft",     priority: 4 },
  completed: { color: "#6B5B3E", bg: "#f0ece4", label: "Completed", priority: 3 },
  cancelled: { color: "#9B3B3B", bg: "#f5e8e8", label: "Cancelled", priority: 5 },
};

function dominantStatus(statuses: string[]): string {
  return statuses.slice().sort(
    (a, b) => (STATUS_CONFIG[a]?.priority ?? 9) - (STATUS_CONFIG[b]?.priority ?? 9)
  )[0] ?? "draft";
}

function makeIcon(status: string) {
  const cfg   = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const fill  = cfg.color;
  return L.divIcon({
    html: `
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24S32 27 32 16C32 7.163 24.837 0 16 0z" fill="${fill}"/>
        <rect x="9" y="9" width="14" height="14" rx="2" fill="white"/>
        <path d="M12 13h8M12 16h5M12 19h7" stroke="${fill}" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    iconSize:    [32, 40],
    iconAnchor:  [16, 40],
    popupAnchor: [0, -42],
    className:   "",
  });
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProgramMap({ programs, height = "420px" }: ProgramMapProps) {
  // Group programs by barangay (only those with coordinates)
  const groups = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; name: string; programs: MapProgram[] }>();
    for (const p of programs) {
      const b = p.barangays;
      if (!b || b.latitude === null || b.longitude === null) continue;
      const key = p.barangay_id!;
      if (!map.has(key)) {
        map.set(key, { lat: b.latitude, lng: b.longitude, name: b.name, programs: [] });
      }
      map.get(key)!.programs.push(p);
    }
    return Array.from(map.values());
  }, [programs]);

  const unmapped = programs.filter(
    (p) => !p.barangays || p.barangays.latitude === null || p.barangays.longitude === null
  ).length;

  return (
    <div className="relative rounded-xl overflow-hidden border border-border" style={{ height }}>
      <MapContainer
        center={BOCAUE_CENTER}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {groups.map((g) => {
          const dom = dominantStatus(g.programs.map((p) => p.status));
          return (
            <Marker key={g.name} position={[g.lat, g.lng]} icon={makeIcon(dom)}>
              <Popup>
                <div className="min-w-[200px] py-1">
                  <p className="font-semibold text-sm text-gray-900 mb-2">{g.name}</p>
                  <div className="space-y-2">
                    {g.programs.map((p) => {
                      const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.draft;
                      return (
                        <div key={p.id} className="border-t border-gray-100 pt-2 first:border-0 first:pt-0">
                          <div className="flex items-start gap-1.5">
                            <span
                              style={{ background: cfg.bg, color: cfg.color }}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 capitalize"
                            >
                              {p.status}
                            </span>
                            <p className="text-xs font-medium text-gray-800 leading-snug">{p.title}</p>
                          </div>
                          {(p.start_date || p.end_date) && (
                            <p className="text-[11px] text-gray-500 mt-0.5 ml-0.5">
                              {fmtDate(p.start_date)}{p.end_date ? ` – ${fmtDate(p.end_date)}` : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-border text-xs flex flex-col gap-1.5">
        {Object.entries(STATUS_CONFIG)
          .filter(([k]) => k !== "cancelled")
          .map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
              <span className="text-gray-700">{cfg.label}</span>
            </div>
          ))}
      </div>

      {/* Unmapped count */}
      {unmapped > 0 && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md border border-border text-xs text-gray-500">
          {unmapped} program{unmapped > 1 ? "s" : ""} without barangay coordinates
        </div>
      )}
    </div>
  );
}
