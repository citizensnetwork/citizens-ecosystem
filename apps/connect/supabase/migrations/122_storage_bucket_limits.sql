-- Storage hardening for the signed-upload-URL flow.
--
-- Media bytes now travel browser → Storage directly (signed upload URLs) instead
-- of through the /api/media/upload server route, so the server no longer sees the
-- bytes and can no longer enforce size/MIME caps per request. These bucket-level
-- limits are the backstop that keeps the signed-URL path safe:
--   * allowed_mime_types — blocks image/svg+xml (stored-XSS vector on a public
--     bucket origin) and any non-media type, regardless of what a client claims.
--   * file_size_limit    — 100 MB absolute cap (matches MAX_VIDEO_SIZE); the server
--     still enforces tighter per-kind caps (15 MB image / 100 MB video) at sign time.
--
-- Affects NEW uploads only; existing objects are untouched.

update storage.buckets
set file_size_limit = 104857600,  -- 100 MB
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id in ('event-images', 'place-images');
