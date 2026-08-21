/**
 * Alerts for the two moments that matter:
 *   - the kitchen learns a pre-order arrived, or that the customer is close
 *   - the customer learns their food is ready
 *
 * Implemented with what a browser can do on its own — a short synthesised
 * chime plus the Notification API — because that works today with no vendor
 * account, no phone numbers and no per-message cost. SMS and web push are
 * where this grows next; see `dispatchExternal` at the bottom for the seam.
 */

let audioContext: AudioContext | null = null;

/**
 * A two-tone chime, synthesised rather than loaded from a file: it's a few
 * lines, ships no asset, and can't fail to download on a slow connection at
 * exactly the moment the kitchen needs to hear it.
 *
 * Browsers block audio until the user has interacted with the page, so this
 * stays silent on a freshly loaded tab and starts working after the vendor's
 * first click. That's the correct trade — no autoplay hacks.
 */
export function playAlertChime(volume = 0.25) {
  if (typeof window === "undefined") return;
  try {
    audioContext ??= new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    if (audioContext.state === "suspended") void audioContext.resume();

    const now = audioContext.currentTime;
    for (const [index, freq] of [880, 1174.7].entries()) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + index * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
  } catch {
    // No audio available (locked-down browser, no output device) — the
    // on-screen ticket is still there, so this is never fatal.
  }
}

export type NotifyPermission = "granted" | "denied" | "unsupported";

export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * Desktop/mobile notification. Silently does nothing without permission —
 * callers always pair this with an in-app toast, so a declined permission
 * degrades rather than loses the message.
 */
export function showNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/favicon-192.png",
      // Replacing a same-tag notification keeps a busy kitchen from
      // accumulating a stack of them for the same order.
      renotify: Boolean(tag),
    } as NotificationOptions);
  } catch {
    // Some browsers throw when constructing notifications outside a service
    // worker on mobile. The in-app toast is the fallback.
  }
}

/**
 * SMS / web push hook — NOT IMPLEMENTED.
 *
 * Both of the brief's optional notifications ("tell the kitchen when the
 * customer is 5 minutes away", "tell the customer when the order is ready")
 * already have their trigger points wired up: the vendor board watches
 * order_pings, and the customer's tracker watches the status change. What is
 * missing is only the transport.
 *
 * To add one:
 *   - SMS: call this from a Supabase Edge Function (so the API key never
 *     reaches the browser) triggered by a database webhook on `orders` and
 *     `order_pings`. Beem Africa, Africa's Talking and Twilio all deliver to
 *     Tanzanian networks.
 *   - Web push: store subscriptions per user, then push from the same Edge
 *     Function using VAPID keys.
 *
 * Kept as a no-op rather than removed so the call sites read the same before
 * and after the transport exists.
 */
export async function dispatchExternal(
  _event: "order_placed" | "order_ready" | "customer_nearby",
  _payload: { orderId: string; phone?: string | null },
): Promise<void> {
  // Intentionally empty. See the comment above.
}
