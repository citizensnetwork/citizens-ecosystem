'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ADMIN_MODERATION_SCOPE, getSession, isAdmin } from './session';
import { getConnectClient } from './connect';
import { getWearStore } from './store';

/**
 * Server actions for the follow graph. Exposed as `'use server'` so they can
 * be bound directly to `<form action={...}>` on profile pages without a
 * client bundle.
 *
 * Each action re-authenticates via `getSession()` and validates the target
 * against Citizens Connect before touching the store — the store itself only
 * trusts Connect ids it is given.
 */

export async function followUser(formData: FormData): Promise<void> {
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;

  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const client = getConnectClient();
  const target = await client.users.getByHandle(handle);
  if (!target) return;
  if (target.id === session.user.id) return;

  await getWearStore().follows.follow(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath(`/u/${session.user.handle}`);
}

export async function unfollowUser(formData: FormData): Promise<void> {
  const handle = String(formData.get('handle') ?? '').trim();
  if (!handle) return;

  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const client = getConnectClient();
  const target = await client.users.getByHandle(handle);
  if (!target) return;

  await getWearStore().follows.unfollow(session.user.id, target.id);
  revalidatePath(`/u/${target.handle}`);
  revalidatePath(`/u/${session.user.handle}`);
}

// ────────────────────────────────────────────────────────────────────────
// Phase 4 — Posts, engagement, comments, cart, brand follows, moderation.
//
// Every mutation:
//   1. Re-authenticates via `getSession()` — cookie content is never trusted.
//   2. Resolves Connect ids server-side (handles, slugs, productIds) so a
//      compromised client cannot inject fabricated ids.
//   3. Enforces ownership/role at the action layer **and** the store layer
//      (defence in depth — the store re-checks every invariant).
//   4. Revalidates only the paths it actually changed.
// ────────────────────────────────────────────────────────────────────────

const CAPTION_MAX = 2000;
const COMMENT_MAX = 1000;
const REPORT_REASON_MAX = 500;
const MEDIA_MAX = 6;
const TAG_MAX = 8;
const ALT_MAX = 280;

function readString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw : '';
}

function readTrimmed(formData: FormData, key: string): string {
  return readString(formData, key).trim();
}

function readAll(formData: FormData, key: string): readonly string[] {
  return formData
    .getAll(key)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0);
}

/**
 * Whitelisted media URL — only http(s), no embedded credentials, hard length
 * cap. The composer surface is server-rendered and the URL is later served
 * inside `<img src>`, so we explicitly reject `javascript:` and similar.
 */
function isSafeMediaUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return true;
}

/**
 * Create a post. Citizens may post under their own handle. Brand owners may
 * additionally post on behalf of brands they own (verified server-side via
 * `BrandDirectory.listForOwner`).
 */
export async function createPost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const caption = readTrimmed(formData, 'caption').slice(0, CAPTION_MAX);
  if (caption.length === 0) return;

  const requestedBrandSlug = readTrimmed(formData, 'brandSlug');
  const visibility = readTrimmed(formData, 'visibility') === 'followers' ? 'followers' : 'public';

  const client = getConnectClient();
  const store = getWearStore();

  let brandId: string | null = null;
  if (requestedBrandSlug.length > 0) {
    const brand = await client.brands.getBySlug(requestedBrandSlug);
    if (!brand) return;
    // Strict ownership check — a citizen cannot post under a brand they do
    // not own. This is the primary authz invariant for brand posts.
    const owned = await client.brands.listForOwner(session.user.id);
    if (!owned.some((b) => b.id === brand.id)) return;
    brandId = brand.id;
  }

  // Media: validate, cap count, drop unsafe entries entirely (do not
  // silently rewrite — surface intent through count mismatch).
  const mediaUrls = readAll(formData, 'mediaUrl').slice(0, MEDIA_MAX);
  const altTexts = readAll(formData, 'mediaAlt');
  const media = mediaUrls
    .filter(isSafeMediaUrl)
    .map((url, index) => ({
      url,
      altText: (altTexts[index] ?? '').slice(0, ALT_MAX),
      sortOrder: index,
    }));

  // Product tags: validate every product id exists. For brand posts the tag
  // must belong to the same brand. For citizen posts (no brand on the post)
  // we still require that the citizen owns the brand the product belongs to
  // — otherwise any signed-in user could attach an "Add to cart" CTA to any
  // brand's product without that brand opting in.
  const ownedBrandIds = new Set((await client.brands.listForOwner(session.user.id)).map((b) => b.id));
  const requestedTags = readAll(formData, 'productId').slice(0, TAG_MAX);
  const productTags: { readonly productId: string; readonly sortOrder: number }[] = [];
  for (const productId of requestedTags) {
    const product = await client.products.getById(productId);
    if (!product) continue;
    if (brandId !== null) {
      if (product.brandId !== brandId) continue;
    } else {
      if (!ownedBrandIds.has(product.brandId)) continue;
    }
    productTags.push({ productId, sortOrder: productTags.length });
  }

  await store.posts.create({
    authorUserId: session.user.id,
    brandId,
    caption,
    visibility,
    media,
    productTags,
  });

  revalidatePath('/feed');
  revalidatePath(`/u/${session.user.handle}`);
  if (requestedBrandSlug.length > 0) {
    revalidatePath(`/b/${requestedBrandSlug}`);
  }
  redirect('/feed');
}

export async function togglePostLike(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const postId = readTrimmed(formData, 'postId');
  if (postId.length === 0) return;

  const store = getWearStore();
  const liked = await store.postEngagement.isLiked(session.user.id, postId);
  if (liked) {
    await store.postEngagement.unlike(session.user.id, postId);
  } else {
    // The store will reject if the post isn't engageable for this viewer.
    await store.postEngagement.like(session.user.id, postId);
  }
  revalidatePath('/feed');
  revalidatePath(`/p/${postId}`);
}

export async function togglePostSave(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const postId = readTrimmed(formData, 'postId');
  if (postId.length === 0) return;

  const store = getWearStore();
  const saved = await store.saves.isSaved(session.user.id, postId);
  if (saved) {
    await store.saves.unsave(session.user.id, postId);
  } else {
    await store.saves.save(session.user.id, postId);
  }
  revalidatePath('/feed');
  revalidatePath(`/p/${postId}`);
}

export async function addComment(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const postId = readTrimmed(formData, 'postId');
  const body = readTrimmed(formData, 'body').slice(0, COMMENT_MAX);
  if (postId.length === 0 || body.length === 0) return;

  await getWearStore().comments.create({
    postId,
    authorUserId: session.user.id,
    body,
  });
  revalidatePath(`/p/${postId}`);
}

export async function addToCart(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const productId = readTrimmed(formData, 'productId');
  if (productId.length === 0) return;

  // Resolve productId server-side; an unknown product is silently ignored.
  const product = await getConnectClient().products.getById(productId);
  if (!product) return;

  // Ignore non-purchasable stock states for cart intent.
  if (product.stockState === 'sold_out') return;

  const quantityRaw = Number.parseInt(readString(formData, 'quantity'), 10);
  const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(quantityRaw, 99) : 1;

  await getWearStore().cart.addItem(session.user.id, product.id, quantity);

  // Cart count surfaces in the shell — revalidate the originating page only,
  // not the whole feed (the cart isn't rendered there). The path is
  // attacker-controllable so we accept only a small allowlist of literal
  // routes; arbitrary paths could be used to repeatedly bust caches.
  const ALLOWED_RETURN_PATHS = new Set(['/feed']);
  const fromPath = readTrimmed(formData, 'returnPath');
  if (ALLOWED_RETURN_PATHS.has(fromPath)) {
    revalidatePath(fromPath);
  } else if (/^\/p\/[A-Za-z0-9_-]{1,64}$/.test(fromPath)) {
    revalidatePath(fromPath);
  } else if (/^\/b\/[A-Za-z0-9_-]{1,64}$/.test(fromPath)) {
    revalidatePath(fromPath);
  } else if (/^\/u\/[A-Za-z0-9_-]{1,64}$/.test(fromPath)) {
    revalidatePath(fromPath);
  }
}

export async function followBrand(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const slug = readTrimmed(formData, 'brandSlug');
  if (slug.length === 0) return;

  const brand = await getConnectClient().brands.getBySlug(slug);
  if (!brand) return;

  await getWearStore().brandFollows.follow(session.user.id, brand.id);
  revalidatePath(`/b/${slug}`);
}

export async function unfollowBrand(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const slug = readTrimmed(formData, 'brandSlug');
  if (slug.length === 0) return;

  const brand = await getConnectClient().brands.getBySlug(slug);
  if (!brand) return;

  await getWearStore().brandFollows.unfollow(session.user.id, brand.id);
  revalidatePath(`/b/${slug}`);
}

export async function reportPost(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const postId = readTrimmed(formData, 'postId');
  const reason = readTrimmed(formData, 'reason').slice(0, REPORT_REASON_MAX);
  if (postId.length === 0 || reason.length === 0) return;

  await getWearStore().moderation.open({
    targetType: 'post',
    targetId: postId,
    reporterUserId: session.user.id,
    reason,
  });
  revalidatePath(`/p/${postId}`);
}

/**
 * Resolve a moderation item. Requires the verified `admin.moderation` scope —
 * cookies and form fields are not consulted, only the upstream session.
 */
export async function resolveModeration(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!isAdmin(session)) {
    // Never `redirect('/sign-in')` here — that would conflate "no session"
    // with "wrong scope" and push admins through a confusing loop. The
    // admin route renders a 403 surface on its own.
    throw new Error(`Forbidden: missing scope ${ADMIN_MODERATION_SCOPE}.`);
  }

  const itemId = readTrimmed(formData, 'itemId');
  const decision = readTrimmed(formData, 'decision');
  const note = readTrimmed(formData, 'note').slice(0, REPORT_REASON_MAX) || null;
  if (itemId.length === 0) return;

  const allowed = new Set(['approved', 'rejected', 'hidden']);
  if (!allowed.has(decision)) return;

  await getWearStore().moderation.resolve(
    itemId,
    session.user.id,
    decision as 'approved' | 'rejected' | 'hidden',
    note,
  );
  revalidatePath('/admin/moderation');
}
