# Post-deploy improvement backlog — wompo + seawomp

## Context

The production flicker on every SPA navigation has been **root-caused and fixed**: seawomp's
HTML minifier (`minifyHtmlShell`) was stripping wompo's `<!--wc-->` / `<!--/wc-->` children-region
hydration markers, breaking hydration of `<seawomp-link>` (used in the header/submenu on every
page) and forcing a destructive client re-render. The regex fix landed in **seawomp 1.2.2** with a
regression test. **That is the only change that affects production today.**

A follow-up general review of wompo + seawomp then surfaced a handful of **minor** robustness /
memory items. None of them affect wompo-docs in practice, and none are worth touching the framework
_core_ right before a production deploy. Per the decision, they are deferred to **after** 1.2.2 is
published and wompo.dev is redeployed, then implemented and tested on wompo-docs.

---

## Backlog item 1 — Cap the seawomp prefetch cache (recommended; highest value)

**File:** `seawomp/src/runtime/router.ts`

**Problem:** `prefetchCache` (a `Map<string, PrefetchEntry>`, line ~75) only evicts _failed_
entries (`.catch(() => prefetchCache.delete(key))` at lines ~305 and ~319). Every successfully
fetched page's full HTML string stays resident for the life of the SPA session. Bounded by visited
pages, so on a large docs site this can hold several MB indefinitely — not a correctness bug, but
unbounded growth.

**Change:** introduce a small cap and evict the oldest entry on insert. `Map` preserves insertion
order, so `cache.keys().next().value` is the oldest. Centralize the two existing `prefetchCache.set`
call sites (in `prefetchRoute` and `getOrFetchHtml`) through one helper:

```ts
const PREFETCH_CACHE_MAX = 32;

function setPrefetch(key: string, entry: PrefetchEntry): void {
	prefetchCache.set(key, entry); // newest goes to the end
	while (prefetchCache.size > PREFETCH_CACHE_MAX) {
		const oldest = prefetchCache.keys().next().value as string | undefined;
		if (oldest === undefined || oldest === key) break; // never evict the entry we just set
		prefetchCache.delete(oldest);
	}
}
```

Replace both `prefetchCache.set(...)` calls with `setPrefetch(...)`. Optionally make it LRU-ish by
`delete`+`set` on a cache hit in `getOrFetchHtml`/`prefetchRoute` to bump recently-used entries to
the end — keep this optional; FIFO with a cap is the low-risk default.

**Risk:** very low. Cache is a transient network optimization; evicting an old entry just costs one
re-fetch on a later visit. TTL behavior (`prefetchTtlMs`, default 60s) is unchanged.

**Test:** add a unit test in seawomp's router test suite — prefetch `PREFETCH_CACHE_MAX + N` distinct
URLs (stub `fetch`), then assert the earliest URLs re-fetch (cache miss) while the most-recent stay
warm. May need to export a tiny `prefetchCacheSize()` getter for assertion, mirroring the existing
`clearPrefetchCache()` test hook.

## Backlog item 2 — Dep-array length guard in wompo hooks (low value, core change)

**File:** `wompo/ts/wompo/hooks.ts`

**Problem:** the dependency-comparison loops in `useEffect` (line ~76), `useLayoutEffect` (~109),
`useCallback` (~150), `useMemo` (~184) and `useAsync` (~266) all iterate
`for (i = 0; i < dependencies.length; i++)` and compare against the stored array. If a component
ever passes a **variable-length** deps array between renders (a misuse — React warns on it), a
_shrinking_ array can skip a changed dependency and miss a re-run. Stable-length deps (the only
correct usage) are unaffected, which is why wompo-docs never hit this.

**Change:** treat a length difference as "changed". Pattern (apply consistently to all five hooks):

```ts
const old = hook.dependencies;
let changed = !old || old.length !== dependencies.length;
if (!changed) {
	for (let i = 0; i < dependencies.length; i++) {
		if (old[i] !== dependencies[i]) {
			changed = true;
			break;
		}
	}
}
if (changed) {
	/* existing re-run / re-store branch */
}
```

**Risk:** low but it is a _core_ behavior change — verify the full wompo unit suite stays green and
nothing in wompo-docs relied on the old (lenient) comparison. This is why it's deferred to
post-deploy and gated behind a green test run.

**Test:** add wompo unit tests rendering a component with deps that change length across renders;
assert the effect/memo re-runs. Re-run the entire wompo test suite.

## Backlog item 3 — `preloadedModules` Set (no action; documented)

**File:** `seawomp/src/runtime/router.ts` (line ~76)

`preloadedModules` is only cleared in tests (`clearPrefetchCache`). It grows by _unique route
modules_, which is bounded by the app's total route count (small, finite) — not by navigations.
**Recommendation: leave as-is.** Clearing it would only cause harmless re-emission of
`<link rel="modulepreload">` tags. Documented here so it isn't re-flagged in a future audit.

---

## Build & verification (after implementing items 1–2)

1. **seawomp:** `cd seawomp && bun run build` (tsc → `dist/`), then `bun test` — all unit tests
   (currently 73, plus the new prefetch-cap test) must pass.
2. **wompo:** rebuild per its build script, then run its unit suite — must stay fully green
   (critical for item 2).
3. **wompo-docs integration:** make the patched packages available to wompo-docs
   (`bun link` the local builds, or copy `dist/` into `node_modules/{seawomp,wompo}` as done during
   the 1.2.2 verification — recall `node_modules/seawomp` is a plain copy, not a symlink). Run
   `bun run build` for wompo-docs and serve the static output (`seawomp start` / `serve:static`,
   port 5173).
4. **Browser check (Claude_Preview MCP on the static build):**
   - Navigate across several pages + a locale switch; console shows **0 hydration warnings**.
   - `global.css` requested **once**, not per navigation.
   - View Transitions still smooth; no flicker.
   - (Item 1) After visiting many pages, confirm no memory blowup; behavior identical to before.
5. Bump seawomp version (1.2.2 → 1.2.3) only if item 1 ships; wompo version bump only if item 2
   ships. Publishing + redeploy remain the user's actions.
