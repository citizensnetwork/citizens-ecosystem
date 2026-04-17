import { vi } from "vitest";

type MockChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  returns: ReturnType<typeof vi.fn>;
  _result: { data: unknown; error: unknown; count?: number };
};

function createQueryChain(result?: Partial<MockChain["_result"]>): MockChain {
  const chain: MockChain = {
    _result: { data: null, error: null, count: 0, ...result },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    upsert: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    in: vi.fn(),
    lt: vi.fn(),
    gt: vi.fn(),
    lte: vi.fn(),
    gte: vi.fn(),
    single: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    returns: vi.fn(),
  };

  // Every chainable method returns the chain itself
  for (const key of Object.keys(chain) as (keyof MockChain)[]) {
    if (key === "_result") continue;
    (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  }

  // Terminal methods resolve to _result
  chain.single.mockResolvedValue(chain._result);

  // Make the chain itself thenable so `await supabase.from(...).select(...)` works
  (chain as unknown as Record<string, unknown>).then = (
    resolve: (value: MockChain["_result"]) => void
  ) => Promise.resolve(chain._result).then(resolve);

  return chain;
}

export function createMockSupabaseClient(overrides?: {
  user?: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;
  queryResult?: Partial<MockChain["_result"]>;
}) {
  const user = overrides?.user ?? null;
  const chain = createQueryChain(overrides?.queryResult);

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: user ? { user } : null },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/image.jpg" } }),
      }),
    },
    _chain: chain,
  };
}
