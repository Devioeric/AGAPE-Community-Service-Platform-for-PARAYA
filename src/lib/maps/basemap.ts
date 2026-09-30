/**
 * Public raster-tile credential only; never use a privileged provider API key.
 * Hosted builds require an explicit key. The loopback local preview may use
 * CARTO's keyless public tiles so demos show a map background.
 */
export function cartoBasemap(key: string | undefined, allowKeyless = false) {
  const value = key?.trim();
  if (!value && !allowKeyless) return null;
  return {
    url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${value ? `?key=${encodeURIComponent(value)}` : ""}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  } as const;
}
