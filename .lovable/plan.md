

## Goal
Lock down Meridian for proprietary codebases: GitHub OAuth login, per-user data isolation, and the ability to attach both private and public repos that only the owner can see.

## Important constraint discovered
Lovable Cloud's managed auth supports **Email, Phone, Google, Apple, SSO** — **GitHub OAuth is not natively supported**. To get "Sign in with GitHub" we have two real paths:

**Option A — Google/Email login + per-index GitHub Personal Access Token (PAT)**
- User logs in with Google or email/password (managed by Lovable Cloud).
- When attaching a private repo, they paste a GitHub PAT (or fine-grained token) once. The token is used server-side to clone, then discarded — never stored.
- Ships today, no extra infra.

**Option B — Switch from Lovable Cloud auth to direct Supabase auth + GitHub OAuth provider**
- Real "Sign in with GitHub" button. Provides a GitHub access token we can reuse for all private-repo cloning automatically — no PAT pasting.
- Requires the user to create a GitHub OAuth App and configure it in the Supabase dashboard. More setup, more moving parts.

I'll go with **Option A** as the default since it ships immediately, isolates data correctly, and supports private repos via PAT. We can layer GitHub OAuth on later as Option B without re-architecting anything.

## Plan

### 1. Authentication (Lovable Cloud auth)
- New `/auth` page: Google sign-in + Email/Password sign-up & sign-in.
- `profiles` table (id → auth.users, display_name, avatar_url, github_username) with auto-create trigger on signup.
- `useAuth()` hook with `onAuthStateChange` listener (set up before `getSession()`).
- Header shows signed-in user + sign-out button.
- `/code-graph` and `/impact-radar` redirect to `/auth` if not signed in.

### 2. Data ownership + RLS rewrite
- Add `owner_id uuid references auth.users(id)` and `visibility text default 'private'` to `repos`.
- Migration: existing rows assigned to a "legacy public" placeholder OR wiped (will confirm before running).
- `ON DELETE CASCADE` from `repos` → `symbols` / `edges` / `impact_runs` so deleting a repo wipes everything.
- Rewrite every RLS policy:
  - `repos`: SELECT only if `owner_id = auth.uid()` OR `visibility = 'public'`. INSERT/UPDATE/DELETE only if owner.
  - `symbols`/`edges`/`impact_runs`: SELECT/INSERT only if caller owns the parent repo (via `EXISTS` subquery on `repos`).
  - Replace the wide-open "Anyone can create impact runs" policy with owner-scoped INSERT.

### 3. Edge function lockdown
- `index-repo`, `run-radar`, `graph-meta`, `impact-analyze` → require valid JWT, reject anon. Re-check repo ownership in code (defence in depth).
- `index-repo` accepts an optional `githubToken` in the request body — used once to clone private repos (passed as `Authorization: token <pat>` to the GitHub tarball URL), **never persisted, never logged**.
- Set `verify_jwt = true` for these functions in `supabase/config.toml`.
- Keep the `WEBHOOK_SECRET` HMAC path for the GitHub Actions push trigger but require the signed payload to include the owning `user_id`.

### 4. Don't index secrets
Add a denylist in `graph-meta` to skip `.env*`, `*.pem`, `*.key`, `id_rsa*`, `secrets.*`, `credentials*`, files >1MB, `node_modules/`, `vendor/`, `.git/`. Prevents the tool from accidentally surfacing secrets as nodes.

### 5. UI changes
- New `/auth` page (Google + email).
- New `/repos` page: list of the user's repos with visibility badge (private/public), "Make public" toggle, and Delete button.
- Repo input on `/code-graph` and `/impact-radar` gains:
  - A "Private repo? Paste a GitHub token" expandable field with a clear "used once, never stored" note + link to GitHub's PAT generation page (`repo` scope).
  - Auto-detect: if GitHub returns 404 on the public metadata check, prompt for a token.
- Header: sign-in/out, link to `/repos`.

### 6. Operational hygiene
- Enable HIBP leaked-password protection in auth settings.
- Update `README.md` with a short threat model: what's stored (symbol metadata only — names, file paths, line numbers, truncated docstrings), what isn't (source code, secrets, tokens), and how isolation works (RLS per `owner_id`).

## Files touched
- **migrations** — `profiles` table + trigger; `owner_id`/`visibility` on `repos`; cascade FKs; full RLS rewrite across all 4 tables.
- **edge fns** — `index-repo` (JWT + ephemeral token + denylist hookup), `run-radar` / `graph-meta` / `impact-analyze` (JWT + ownership check). `supabase/config.toml` updated to `verify_jwt = true` for these.
- **client** — new `src/pages/Auth.tsx`, `src/pages/MyRepos.tsx`, `src/hooks/useAuth.tsx`; gating in `App.tsx`; header sign-in/out; PAT field in `CodeGraph.tsx` + `ImpactRadar.tsx`; `README.md` threat-model section.

## Out of scope for this pass
- Native "Sign in with GitHub" button (Option B above) — can layer on later by configuring a GitHub OAuth app in Supabase.
- GitHub App installation flow (per-org fine-grained access).
- Encryption-at-rest beyond Supabase defaults.
- Audit log of who-queried-what.
- Team/org sharing — single-owner now, designed so a `repo_collaborators` table can be added later without breaking RLS.

## Verification
1. Sign up with two different accounts in two browsers — each sees only their own repos in `/repos`.
2. Account A indexes a private repo with a PAT — succeeds; Account B cannot see it in any table query.
3. Account A toggles repo to "public" — Account B can now read it but cannot delete or re-index it.
4. Anon (logged-out) request to `/code-graph` redirects to `/auth`; direct `supabase.from('symbols').select('*')` from anon returns 0 rows.
5. PAT never appears in any DB column or function log.

