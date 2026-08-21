import { supabase } from "@/integrations/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "menu-photos";

export type PhotoKind = "dish" | "logo" | "cover" | "avatar";

export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (file.size > MAX_BYTES) return "That image is larger than 5 MB.";
  return null;
}

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Uploads into `{userId}/…`, which is exactly what the storage RLS policy
 * checks — the bucket is public to read but each user can only write inside
 * their own folder.
 *
 * Logos, covers and avatars use a fixed filename per kind so re-uploading
 * replaces the old file instead of accumulating orphans; dish photos are
 * timestamped because a restaurant has many of them.
 */
export async function uploadPhoto(userId: string, file: File, kind: PhotoKind): Promise<string> {
  const ext = extensionFor(file.type);
  const path =
    kind === "dish"
      ? `${userId}/dishes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      : `${userId}/${kind}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: kind !== "dish",
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Fixed filenames are cached by the CDN, so a replacement would keep
  // showing the old image until the cache header expires.
  return kind === "dish" ? data.publicUrl : `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Best-effort cleanup after replacing or deleting a dish photo. Failures are
 * swallowed: an orphaned file in a bucket is a housekeeping issue, not
 * something worth failing the user's save over.
 */
export async function deletePhoto(publicUrl: string | null | undefined) {
  if (!publicUrl) return;
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = publicUrl.slice(idx + marker.length).split("?")[0];
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  } catch {
    // Ignored on purpose — see above.
  }
}
