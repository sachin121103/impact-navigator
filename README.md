# Meridian

Map the architecture of any codebase. Index public or private GitHub repos, then explore the symbol graph and impact radar.

## Demo Account

Try Meridian without signing up:

- **Email:** `demo@meridian.dev`
- **Password:** `MeridianDemo2026!`

⚠️ The demo account is **shared across all visitors**. Anything indexed under it is visible to anyone else who logs in with the same credentials. Use your own account for private/proprietary repositories.

## Security model

Three layers protect your data:

1. **Authentication** — every request carries a signed JWT identifying the caller.
2. **Row-Level Security** — Postgres enforces `auth.uid() = owner_id` on every read/write at the database level. Even a forged client cannot bypass it.
3. **Edge function checks** — server-side functions re-verify ownership of the target repo before doing any work. GitHub PATs are used in-memory only and never persisted or logged.

What we store: symbol names, file paths, line numbers, fan-in/out counts, truncated docstrings.
What we never store: source code, GitHub tokens, secrets.
