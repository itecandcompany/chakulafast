import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Link } from "@tanstack/react-router";
import { restaurantPin, destinationPin, userLocationIcon } from "@/lib/mapIcons";
import { formatKm, formatTsh } from "@/lib/geo";

export type MapRestaurant = {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  is_open: boolean;
  distance_km?: number | null;
  min_price?: number | null;
};

export type RestaurantMapProps = {
  center: [number, number];
  restaurants: MapRestaurant[];
  /** The customer's own position, if they shared it. */
  me?: [number, number] | null;
  /** Highlighted restaurant (the one an active order belongs to). */
  destinationId?: string | null;
  /** Road geometry from the customer to the destination. */
  route?: [number, number][] | null;
  height?: number;
};

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const lastKey = useRef("");
  useEffect(() => {
    if (!points.length) return;
    const key = points.map((p) => p.join(",")).join("|");
    // Refitting on every render would fight the user every time they panned.
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    }
  }, [points, map]);
  return null;
}

export default function RestaurantMap({
  center,
  restaurants,
  me = null,
  destinationId = null,
  route = null,
  height = 320,
}: RestaurantMapProps) {
  const points = useMemo(() => {
    const pts: [number, number][] = restaurants.map((r) => [r.lat, r.lng]);
    if (me) pts.push(me);
    return pts;
  }, [restaurants, me]);

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={points} />

        {route && route.length > 1 && (
          <Polyline positions={route} pathOptions={{ color: "#c1440e", weight: 4, opacity: 0.8 }} />
        )}

        {restaurants.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lng]}
            icon={r.id === destinationId ? destinationPin() : restaurantPin(r.is_open)}
          >
            <Popup>
              <div className="min-w-40 space-y-1">
                <p className="font-semibold leading-tight">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.is_open ? "Open now" : "Closed"}
                  {formatKm(r.distance_km) ? ` · ${formatKm(r.distance_km)}` : ""}
                </p>
                {r.min_price != null && (
                  <p className="text-xs text-muted-foreground">
                    From {formatTsh(Number(r.min_price))}
                  </p>
                )}
                <Link
                  to="/r/$slug"
                  params={{ slug: r.slug }}
                  className="inline-block pt-1 text-xs font-semibold text-primary underline"
                >
                  View menu
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}

        {me && <Marker position={me} icon={userLocationIcon()} />}
      </MapContainer>
    </div>
  );
}
