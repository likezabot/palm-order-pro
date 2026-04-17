
The user says "continues the same" — Palm still hangs after publish. Let me think harder.

Real root cause analysis:
- `__APP_VERSION__ = new Date().toISOString()` evaluated at config load time. On every Vite build, this is a new string. So in **production**, every published bundle has a different `__APP_VERSION__` baked in. Good.
- But: index.html references the bundle. If user opens the published URL, browser may have cached `index.html` from a previous version (via SW navigation handler — actually it's network-first, so should be fresh). Bundle hash in script src changes per build → fresh JS loaded.
- After fresh JS loads, `__APP_VERSION__` is the new build's stamp. `stored` in localStorage is the previous build's stamp. They differ → version-check clears caches, unregisters SW, sets RELOAD_FLAG, reloads.
- After reload, RELOAD_FLAG is in sessionStorage → version-check returns false. App should render.

So version-check itself is one-shot. The REAL loop must be in the SW + UpdateBanner flow:
- On reload, no SW (we just unregistered). But main.tsx re-registers it. New SW installs → activate → claims clients → fires `controllerchange` → UpdateBanner reloads page → loop.

THAT's the loop! `controllerchange` fires when a new SW takes control, including the very first registration after we just unregistered it. The 30s anti-loop guard I added should prevent this... unless the localStorage `app_last_reload_ts` wasn't set before the FIRST controllerchange. Let me check: in version-check, on the reload path, I set `app_last_reload_ts`. So after the version-check reload, ts is recent → controllerchange shouldn't reload.

But... what if user lands fresh (no stored version)? version-check sets stored=current and returns false. SW registers for the first time → controllerchange fires (no prior controller? Actually controllerchange only fires when controller CHANGES, not on first install when there was no controller). Hmm, actually with `clients.claim()` on a fresh page that had no controller, `navigator.serviceWorker.controller` was null, then becomes the new SW → that IS a controllerchange event → UpdateBanner reloads → loop because lastReload is 0!

That's the bug. Fix: only treat controllerchange as "update" if there was a previous controller.

Also possible: MenuView showing infinite loading because `useQuery` runs but something prevents it. But user says "rodando infinitamente" which I'll interpret as loading spinner now (since I added one). Could be Supabase request hanging.

Let me also check: maybe SW is intercepting the supabase fetch and breaking it. The fetch handler does network-first with cache fallback. For supabase API calls, if network works, fine. If they fall through... should be fine.

But wait — the SW fetch handler intercepts ALL requests including cross-origin Supabase. `fetch(event.request)` — if supabase request has special headers/credentials, SW respondWith might break it. Let me bypass SW for non-same-origin requests.

## Plan

1. **UpdateBanner**: skip controllerchange when there was no previous controller (initial registration is not an update).
2. **sw.js**: skip non-GET and cross-origin requests entirely (let browser handle directly).
3. **MenuView**: also let `staleTime` not matter here — but add a hard timeout/error if products query takes >10s show retry button.

These three changes should definitively kill the loop and surface any real error.
