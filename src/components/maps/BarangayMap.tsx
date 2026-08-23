"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import L from "leaflet";
import BOCAUE_BOUNDARIES from "@/lib/bocaue-boundaries";

export interface MapBarangay {
  id:               string;
  name:             string;
  municipality:     string;
  province:         string;
  contact_person:   string | null;
  contact_phone:    string | null;
  partnership_start: string | null;
  is_active:        boolean;
  latitude:         number | null;
  longitude:        number | null;
}

interface BarangayMapProps {
  barangays: MapBarangay[];
  height?:   string;
}

const BOCAUE_CENTER: [number, number] = [14.7975, 120.9281];
const DEFAULT_ZOOM = 13;

function makeIcon(isActive: boolean) {
  const fill = isActive ? "#C4A96A" : "#9C9488";
  const ring = isActive ? "rgba(196,169,106,0.3)" : "rgba(156,148,136,0.3)";
  return L.divIcon({
    html: `<svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.8 14 20 14 20S28 23.8 28 14C28 6.268 21.732 0 14 0z" fill="${fill}" opacity="0.9"/>
      <circle cx="14" cy="14" r="7" fill="${ring}"/>
      <circle cx="14" cy="14" r="3.5" fill="white"/>
    </svg>`,
    iconSize:    [28, 34],
    iconAnchor:  [14, 34],
    popupAnchor: [0, -36],
    className:   "",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BOUNDARY_STYLE: PathOptions = {
  color:       "#6B5B3E",
  weight:      2,
  opacity:     0.9,
  fillColor:   "#C4A96A",
  fillOpacity: 0.18,
};

const BOUNDARY_HOVER: PathOptions = {
  color:       "#4A3F2B",
  weight:      2.5,
  opacity:     1,
  fillColor:   "#C4A96A",
  fillOpacity: 0.35,
};

export default function BarangayMap({ barangays, height = "420px" }: BarangayMapProps) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl; // eslint-disable-line
  }, []);

  const mapped   = barangays.filter((b) => b.latitude !== null && b.longitude !== null);
  const unmapped = barangays.length - mapped.length;

  // Normalise name: lowercase, strip diacritics (ñ→n), remove non-alphanumeric
  function norm(s: string) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }
  const partnerSet = new Set(barangays.map((b) => norm(b.name)));

  const partnerBoundaries: FeatureCollection = {
    type: "FeatureCollection",
    features: BOCAUE_BOUNDARIES.features.filter((f) => {
      const p = f.properties as Record<string, string> | null;
      const name = p?.adm4_en ?? p?.ADM4_EN ?? "";
      return partnerSet.has(norm(name));
    }),
  };

  function onEachFeature(feature: Feature, layer: Layer) {
    const p = feature.properties as Record<string, string> | null;
    const name = p?.adm4_en ?? p?.ADM4_EN ?? p?.name ?? "";

    // Permanent label
    if (name) {
      (layer as L.Path).bindTooltip(name.toUpperCase(), {
        permanent:  true,
        direction:  "center",
        className:  "barangay-label",
      });
    }

    // Hover highlight
    layer.on({
      mouseover(e) {
        (e.target as L.Path).setStyle(BOUNDARY_HOVER);
        (e.target as L.Path).bringToFront();
      },
      mouseout(e) {
        (e.target as L.Path).setStyle(BOUNDARY_STYLE);
      },
    });
  }

  return (
    <>
      {/* Inline styles for the boundary labels */}
      <style>{`
        .barangay-label {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #4A3F2B;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-shadow: 0 0 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7);
          white-space: nowrap;
          pointer-events: none;
        }
        .barangay-popup .leaflet-popup-content-wrapper {
          background: #FAFAF7;
          border: 1px solid #E5DDD0;
          border-radius: 8px;
          color: #2C2416;
          box-shadow: 0 4px 16px rgba(107,91,62,0.15);
        }
        .barangay-popup .leaflet-popup-tip {
          background: #FAFAF7;
        }
      `}</style>

      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height }}>
        <MapContainer
          center={BOCAUE_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          {/* Light minimal base map */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          {/* Only partner barangay boundaries */}
          {partnerBoundaries.features.length > 0 && (
            <GeoJSON
              key={partnerBoundaries.features.map((f) => f.id).join(",")}
              data={partnerBoundaries}
              style={() => BOUNDARY_STYLE}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Partner markers */}
          {mapped.map((b) => (
            <Marker
              key={b.id}
              position={[b.latitude!, b.longitude!]}
              icon={makeIcon(b.is_active)}
            >
              <Popup className="barangay-popup">
                <div className="min-w-[180px] py-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${b.is_active ? "bg-cyan-400" : "bg-gray-400"}`} />
                    <p className="font-semibold text-sm leading-tight">{b.name}</p>
                  </div>
                  <p className="text-xs opacity-60 mb-2">{b.municipality}, {b.province}</p>
                  {b.contact_person && (
                    <p className="text-xs opacity-80">
                      <span className="font-medium">Contact:</span> {b.contact_person}
                    </p>
                  )}
                  {b.contact_phone && <p className="text-xs opacity-80">{b.contact_phone}</p>}
                  <p className="text-xs opacity-50 mt-1.5">Partner since {fmtDate(b.partnership_start)}</p>
                  <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    b.is_active ? "bg-[#4A3F2B] text-[#C4A96A]" : "bg-gray-800 text-gray-400"
                  }`}>
                    {b.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-border text-xs flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#C4A96A] flex-shrink-0" />
            <span className="text-foreground">Active partner</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" />
            <span className="text-muted-foreground">Inactive</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 pt-1.5 border-t border-border">
            <span className="w-5 h-0 border border-[#6B5B3E] flex-shrink-0" style={{ borderStyle: "solid" }} />
            <span className="text-muted-foreground">Partner boundary</span>
          </div>
        </div>

        {/* Unmapped badge */}
        {unmapped > 0 && (
          <div className="absolute top-3 right-3 z-[1000] bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 text-xs text-gray-400">
            {unmapped} barangay{unmapped > 1 ? "s" : ""} without coordinates
          </div>
        )}
      </div>
    </>
  );
}
