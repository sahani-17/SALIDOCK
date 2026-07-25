# SaliDock Deployment & Testing Plan

Stack: Supabase (DB/storage) + Render (backend API/compute) + Vercel (frontend) + your own domain.

## Current situation (handover, not fresh build)

SaliDock is already live at `https://salidock.salixirax.com/`, originally deployed by someone else. You are taking over full ownership.

**Already secured:**
- [x] GitHub repo ownership
- [x] Supabase project ownership

**Still needed from the original deployer:**
- [ ] DNS access for `salixirax.com` (or their agreement to make one DNS change when you're ready)
- [ ] Current production environment variables (check for anything beyond Supabase keys — third-party services, analytics, etc.)
- [ ] Confirmation the GitHub repo's latest commit matches what's actually live right now

**Revised strategy:** Since you already own the code and database, deploy fresh on your own Render + Vercel accounts in parallel with the existing live site (zero risk to what's currently working). Test until it matches the live site's behavior, then do a single DNS cutover at the end. You do NOT need access to the original hosting account under this approach — Phase 2 and 3 below already build this new deployment; the only new step is the DNS cutover in Phase 3.5.

---

## Phase 0: Before you touch any cloud service

- [ ] Confirm your domain registrar (GoDaddy, Namecheap, Google Domains, etc.) and that you have access to its DNS settings.
- [ ] Decide your subdomain layout now, so you configure it once correctly:
  - `salidock.com` or `www.salidock.com` → frontend
  - `api.salidock.com` → backend API
- [ ] Make sure your GitHub repo has frontend and backend in separate deployable units (even if same repo, separate folders like `/frontend` and `/backend`), since Render and Vercel each deploy one thing.

---

## Phase 1: Supabase Setup (Database + Storage + Auth)

1. Create a Supabase project (choose a region close to your users — likely an Asia-Pacific region given your location).
2. Set up your database tables (users, jobs, results metadata).
3. Create the storage bucket: `docking-results`. Set it to private (not public) — results should only be accessible via signed URLs, not open to anyone with the link.
4. Enable Row Level Security (RLS) on every table before going live. This is the single most common Supabase security mistake — without RLS, anyone with your public API key can read/write all data.
5. Copy your `SUPABASE_URL` and `SUPABASE_KEY` (service role key) — keep the service role key secret, never expose it in frontend code.

**Test before moving on:**
- [ ] Upload a test file to the bucket manually via the dashboard, confirm it's *not* publicly downloadable without a signed URL.
- [ ] Insert a test row into your jobs table via the dashboard, confirm RLS blocks an anonymous read.

---

## Phase 2: Backend Deployment (Render)

1. Push your backend (with the Dockerfile) to GitHub if it isn't already.
2. On Render: New → Web Service → connect your GitHub repo → select the backend folder.
3. Render will detect the Dockerfile and build automatically. First build will likely take 15-30 min (Conda/micromamba is slow) — this is normal, not a failure.
4. Set environment variables in Render's dashboard (never commit these to GitHub):
   ```
   ENVIRONMENT=production
   CLOUD_ONLY_MODE=true
   SUPABASE_URL=...
   SUPABASE_KEY=...
   SUPABASE_STORAGE_BUCKET=docking-results
   CORS_ORIGINS=https://salidock.com,https://www.salidock.com
   SESSION_EXPIRY=6
   ```
5. Set the instance size based on what you measured locally in the earlier testing (start at 4 vCPU/8GB if unsure; you can resize later).
6. Set `max_workers` in your `ThreadPoolExecutor` conservatively (e.g., 2) for the instance size you picked.

**Connect your custom domain to Render:**
1. In Render dashboard → your service → Settings → Custom Domain → add `api.salidock.com`.
2. Render gives you a CNAME target (something like `yourservice.onrender.com`).
3. Go to your domain registrar's DNS settings, add:
   - Type: `CNAME`, Name: `api`, Value: (the target Render gave you)
4. Wait for DNS propagation (can take a few minutes to a few hours) and for Render to auto-issue an SSL certificate (this is automatic, no extra step needed).

**Test before moving on:**
- [ ] Hit `https://api.salidock.com/health` and confirm it returns OK.
- [ ] Confirm HTTPS padlock shows valid (no cert warning).
- [ ] Submit one real docking job through the deployed API (not just health check) and confirm it completes and writes to Supabase storage.

---

## Phase 3: Frontend Deployment (Vercel)

1. On Vercel: New Project → connect GitHub repo → select frontend folder.
2. Set the build environment variable pointing the frontend at your backend:
   ```
   VITE_API_URL=https://api.salidock.com
   ```
3. Deploy. Vercel builds and gives you a `*.vercel.app` URL first — verify it works before attaching your domain.

**Connect your custom domain to Vercel:**
1. Vercel dashboard → project → Settings → Domains → add `salidock.com` and `www.salidock.com`.
2. Vercel gives you DNS records to add (usually an `A` record for the root domain and a `CNAME` for `www`).
3. Add those records at your registrar.
4. Vercel auto-issues SSL once DNS resolves — no manual cert work needed.

**Test before moving on:**
- [ ] Visit `https://salidock.com`, confirm it loads with valid HTTPS.
- [ ] Confirm `www.salidock.com` redirects correctly too (pick one as canonical, redirect the other).
- [ ] Open browser dev tools → Network tab → submit a docking job from the actual website → confirm requests go to `api.salidock.com` and succeed (this also confirms your CORS_ORIGINS setting was correct).

---

## Phase 3.5: DNS Cutover (handover-specific step)

This replaces the generic "connect your domain" step from Phase 2/3 above — you're switching an *existing* live subdomain, not registering a new one.

1. Before touching DNS, have your new Render + Vercel deployments fully tested and working on their temporary URLs (`*.onrender.com`, `*.vercel.app`) — confirm they behave identically to the current live site at `salidock.salixirax.com`.
2. Get the exact target values for your new deployments:
   - Render will give you a CNAME target for `api.salidock.salixirax.com` (or whatever subdomain you use for the API)
   - Vercel will give you an A record / CNAME target for `salidock.salixirax.com`
3. Ask the original deployer (or whoever controls DNS) to update the existing DNS records for `salidock.salixirax.com` to point to these new targets — this is the one action you may still need them for if you don't have DNS access yourself.
4. **Lower the DNS TTL a day in advance if possible** — this makes the cutover take effect faster and makes rollback faster too if something goes wrong.
5. After the change propagates, verify `https://salidock.salixirax.com` is now serving your new deployment (check response headers or add a temporary visible marker to confirm) — don't assume, confirm.
6. Keep the old deployment running for a few days after cutover as a fallback, in case you need to revert the DNS change quickly.
7. Once you're confident the new deployment is stable, the original deployer can decommission the old hosting.

---

## Phase 4: End-to-End Testing (do this before announcing it to anyone)

**Functional tests**
- [ ] Full user flow: upload protein → run cavity detection → run docking → view/download results, all through the real domain, not localhost.
- [ ] Test with a large protein (worst case size you expect) — confirm it doesn't time out or OOM.
- [ ] Test with a malformed/corrupt file upload — confirm it fails gracefully with an error message, not a server crash.
- [ ] Test 2-3 concurrent job submissions — confirm `max_workers` throttling works and nothing crashes.

**Failure-mode tests**
- [ ] Manually stop one of the three cavity-detection sub-methods (e.g., temporarily break P2Rank) and confirm your consensus logic degrades gracefully per your Phase 4 decision from the earlier plan.
- [ ] Let a job intentionally run past your timeout — confirm it's killed and reported as failed, not left hanging forever.
- [ ] Restart the Render service mid-job — confirm the frontend shows a sensible error instead of hanging silently.

**Security tests**
- [ ] Try accessing another user's results by guessing/altering a job ID or storage path — should be blocked by RLS/signed URLs.
- [ ] Hit `/api/dock` more than your rate limit allows from one IP — confirm the 429 (too many requests) kicks in.
- [ ] Confirm `.env` files, service role keys, and any secrets are not present in the frontend bundle (check browser dev tools → Sources).

**Load/cleanup tests**
- [ ] Run several jobs back to back, then check `/tmp` on the Render instance (via shell access if available, or logs) to confirm the cleanup cron/thread is actually deleting old session directories.
- [ ] Watch Render's dashboard CPU/RAM graphs during a real job to confirm your instance size has headroom, not running near 100%.

---

## Phase 5: Monitoring & Rollback readiness

- [ ] Set up Render's built-in health check against `/health` so it auto-restarts on crash.
- [ ] Turn on Render and Vercel deploy notifications (email/Slack) so you know immediately if a deploy fails.
- [ ] Keep the previous working deploy easy to roll back to — both Render and Vercel keep deploy history with one-click rollback; know where that button is *before* you need it.
- [ ] Set up basic uptime monitoring (e.g., UptimeRobot, free tier) pinging `https://salidock.com` and `https://api.salidock.com/health` every few minutes, so you find out about downtime before your users do.

---

## Launch order (do phases strictly in this sequence)

1. Supabase already owned — confirm tables, RLS, and storage bucket match what's needed (Phase 1 tests)
2. Backend deployed to Render, tested via `*.onrender.com` URL first
3. Frontend deployed to Vercel, tested via `*.vercel.app` URL first
4. Confirm both temporary-URL deployments match current live site behavior exactly
5. DNS cutover (Phase 3.5) — switch `salidock.salixirax.com` to the new deployment
6. Full end-to-end test suite (Phase 4) run against the real, now-cutover domain
7. Monitoring turned on
8. Keep old deployment as fallback for a few days, then have it decommissioned

Testing each piece in isolation before wiring domains together means that if something breaks, you know exactly which layer caused it — DNS, backend logic, or frontend config — instead of debugging all three at once.
