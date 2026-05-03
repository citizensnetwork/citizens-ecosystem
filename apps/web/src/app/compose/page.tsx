import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createPost } from '@/lib/actions';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { PageShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compose — Citizens Wear',
  description: 'Share a post on Citizens Wear.',
};

const MEDIA_SLOTS = 3;
const TAG_SLOTS = 4;

export default async function ComposePage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const client = getConnectClient();

  // Surface the brands this citizen owns + their products. Brand selection is
  // strictly the brands Connect lists for them; nothing on the client side
  // can substitute another brand id.
  const ownedBrands = await client.brands.listForOwner(session.user.id);
  const ownedProductPages = await Promise.all(
    ownedBrands.map((brand) => client.products.listForBrand(brand.id, { limit: 24 })),
  );

  return (
    <PageShell session={session} tone="dark" width="narrow">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-paper-soft/70">
          Compose
        </p>
        <h1 className="mt-2 font-display text-3xl text-paper md:text-4xl">
          What does the Kingdom look like today?
        </h1>
      </header>

      <form
        action={createPost}
        className="flex flex-col gap-5 rounded-2xl border border-ink-soft/40 bg-ink/60 p-5"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="caption" className="text-xs uppercase tracking-wide text-paper-soft/80">
            Caption
          </label>
          <textarea
            id="caption"
            name="caption"
            required
            maxLength={2000}
            rows={4}
            placeholder="A line of plain speech is worth a thousand filters."
            className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
          />
        </div>

        {ownedBrands.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="brandSlug" className="text-xs uppercase tracking-wide text-paper-soft/80">
              Post as
            </label>
            <select
              id="brandSlug"
              name="brandSlug"
              defaultValue=""
              className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
            >
              <option value="">@{session.user.handle} (citizen)</option>
              {ownedBrands.map((brand) => (
                <option key={brand.id} value={brand.slug}>
                  {brand.name} (brand)
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2 rounded-md border border-ink-soft/40 p-3">
          <legend className="px-1 text-[11px] uppercase tracking-wide text-paper-soft/80">
            Media (https URLs)
          </legend>
          {Array.from({ length: MEDIA_SLOTS }).map((_, index) => (
            <div key={`media-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr]">
              <input
                type="url"
                name="mediaUrl"
                placeholder="https://example.test/image.jpg"
                inputMode="url"
                pattern="https?://.*"
                className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
              />
              <input
                type="text"
                name="mediaAlt"
                placeholder="Alt text (for screen readers)"
                maxLength={280}
                className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
              />
            </div>
          ))}
        </fieldset>

        {ownedBrands.length > 0 ? (
          <fieldset className="flex flex-col gap-2 rounded-md border border-ink-soft/40 p-3">
            <legend className="px-1 text-[11px] uppercase tracking-wide text-paper-soft/80">
              Tag products (brand posts only — must belong to selected brand)
            </legend>
            {Array.from({ length: TAG_SLOTS }).map((_, index) => (
              <select
                key={`tag-${index}`}
                name="productId"
                defaultValue=""
                className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
              >
                <option value="">No product</option>
                {ownedBrands.map((brand, brandIndex) => {
                  const products = ownedProductPages[brandIndex]?.items ?? [];
                  return (
                    <optgroup key={brand.id} label={brand.name}>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.title}
                          {product.stockState === 'sold_out' ? ' — sold out' : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            ))}
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="visibility" className="text-xs uppercase tracking-wide text-paper-soft/80">
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue="public"
            className="rounded-md border border-ink-soft/50 bg-ink px-3 py-2 text-sm text-paper focus:border-gold focus:outline-none"
          >
            <option value="public">Public</option>
            <option value="followers">Followers / brand followers only</option>
          </select>
        </div>

        <button
          type="submit"
          className="self-start rounded-full border border-gold/60 bg-ink-soft/40 px-5 py-2 text-sm hover:border-gold"
        >
          Publish post
        </button>
      </form>
    </PageShell>
  );
}
