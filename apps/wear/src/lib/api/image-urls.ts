import { ApiError } from '@/lib/api/route-context';
import { bodyString, bodyStringArray } from '@/lib/api/params';
import { getSupabaseUrl } from '@/lib/supabase/env';
import { isDisplayableImageUrl, safeUrl } from '@/lib/validators';

/**
 * Picture URLs that routes store and the frontend later draws in an `<img>`.
 *
 * Wear's Content-Security-Policy only lets the browser load pictures from our
 * own Storage and Google profile pictures, so a link to any other website would
 * be saved and then silently blocked. These helpers turn that into a friendly
 * 400 at the door.
 *
 * Without a Supabase project URL (dev, tests, a preview with no credentials)
 * there is no Storage to upload to and the frontend falls back to pasting a
 * link, so every `http(s)` URL keeps working there, as `safeUrl` always allowed.
 *
 * A value that is empty or not an `http(s)` URL at all is dropped (`null`), as
 * before: that is how a client clears a field. Only a real link to somewhere
 * the CSP would block is an error.
 */

const NOT_ALLOWED_MESSAGE =
  "That picture is on another website, so Citizens Wear can't show it. Please upload the image instead.";

/** One picture URL: the canonical URL, `null` if blank or not `http(s)`, or a 400. */
export function imageUrl(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url) return null;
  const supabaseUrl = getSupabaseUrl();
  if (supabaseUrl && !isDisplayableImageUrl(url, supabaseUrl)) {
    throw new ApiError(400, 'invalid_image_url', NOT_ALLOWED_MESSAGE);
  }
  return url;
}

/** A single picture URL field from a JSON body. See {@link imageUrl}. */
export function bodyImageUrl(body: unknown, key: string): string | null {
  return imageUrl(bodyString(body, key));
}

/** A list of picture URLs from a JSON body: blanks and junk dropped, at most `max` kept. */
export function bodyImageUrls(body: unknown, key: string, max: number): string[] {
  return bodyStringArray(body, key)
    .map((u) => imageUrl(u))
    .filter((u): u is string => !!u)
    .slice(0, max);
}
