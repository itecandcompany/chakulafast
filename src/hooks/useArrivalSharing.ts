import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { estimateTravelMinutes, haversineKm } from "@/lib/geo";

const MIN_PING_INTERVAL_MS = 30_000;

/**
 * "I'm on my way" — live arrival updates from the customer to the kitchen.
 *
 * Each ping writes a row to `order_pings`, and the apply_order_ping() trigger
 * moves the order's expected arrival time. That's what lets a kitchen re-time
 * a dish when the customer hits traffic, instead of cooking to a promise made
 * ten minutes ago.
 *
 * Throttled to one write every 30 seconds regardless of how chatty the
 * device's GPS is: watchPosition can fire several times a second while
 * walking, and every one of those would otherwise be a database round trip
 * and a realtime broadcast to the vendor board.
 */
export function useArrivalSharing(
  orderId: string,
  destination: { lat: number; lng: number },
  enabled: boolean,
) {
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPingAt = useRef(0);
  // Held in a ref rather than state so the watch callback never needs to be
  // re-registered, which would restart the GPS subscription.
  //
  // Written in an effect, not during render: React can render a component
  // without committing it (StrictMode, a discarded concurrent render), and a
  // ref mutated during that render keeps a value the committed tree never
  // agreed to. Here that would mean pinging the wrong restaurant.
  const destinationRef = useRef(destination);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination.lat, destination.lng]);

  useEffect(() => {
    if (!enabled) {
      setEtaMinutes(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }

    let cancelled = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastPingAt.current < MIN_PING_INTERVAL_MS) return;
        lastPingAt.current = now;

        const me = { lat: position.coords.latitude, lng: position.coords.longitude };
        const to = destinationRef.current;

        void (async () => {
          const { minutes } = await estimateTravelMinutes(me, to);
          if (cancelled) return;
          setEtaMinutes(minutes);

          const { error: pingError } = await supabase.from("order_pings").insert({
            order_id: orderId,
            lat: me.lat,
            lng: me.lng,
            distance_km: haversineKm(me, to),
            eta_minutes: minutes,
          });
          // A dropped ping is not worth interrupting someone walking to a
          // restaurant over; the next one is 30 seconds away.
          if (pingError) console.error(pingError);
        })();
      },
      () => {
        if (!cancelled) setError("Couldn't read your location — check permissions.");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
    // `destination` is deliberately absent: it is read through a ref so the
    // GPS watch is never torn down and re-registered mid-journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, orderId]);

  return { etaMinutes, error };
}
