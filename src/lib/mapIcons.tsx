import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { UtensilsCrossed } from "lucide-react";

// Map pins render as raw Leaflet divIcon HTML, so they can't mount a React
// component directly — pre-render the vector icon to an SVG string once and
// reuse it. A real icon reads far more professional on a pin than an emoji
// glyph, and it keeps the pin visually identical to the icon used elsewhere
// in the UI.
let utensilsSvg: string | null = null;
function restaurantSvg(): string {
  utensilsSvg ??= renderToStaticMarkup(
    <UtensilsCrossed color="white" size={16} strokeWidth={2.25} />,
  );
  return utensilsSvg;
}

const OPEN_COLOR = "#c1440e";
const CLOSED_COLOR = "#94a3b8";

/** Circular pin for a restaurant. Muted when the kitchen is closed. */
export function restaurantPin(isOpen: boolean, size = 34) {
  const color = isOpen ? OPEN_COLOR : CLOSED_COLOR;
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;border:2px solid white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25)">${restaurantSvg()}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * The restaurant the customer is actually heading to — larger and ringed, so
 * it stays findable among a dozen other pins on the order tracking map.
 */
export function destinationPin(size = 42) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${OPEN_COLOR};color:white;border:3px solid white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(193,68,14,.25),0 4px 12px rgba(0,0,0,.3)">${restaurantSvg()}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Pulsing blue dot for "you are here" — matches the universal map convention. */
export function userLocationIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative"><div style="position:absolute;inset:-12px;background:#3b82f6;opacity:.25;border-radius:50%;animation:pulse 2s infinite"></div><div style="background:#2563eb;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,.3);position:relative"></div></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
