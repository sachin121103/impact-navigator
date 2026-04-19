

## Finish the Auth cleanup + demo account

### 1. Remove Google from Auth.tsx
- Delete the `handleGoogle` function (lines 74-90).
- Delete the "Continue with Google" button and the "or with email" divider (lines 116-132).
- Keep email + password form only.

### 2. Add demo helper
Below the form card, add a small "Try demo" card that:
- Shows `demo@meridian.dev` / `MeridianDemo2026!`
- Has a button "Fill demo credentials" that pre-fills both inputs (no auto-submit)
- Includes a warning: "⚠️ Demo account is shared — don't index proprietary code"

### 3. Seed the demo user
New migration `supabase/migrations/<timestamp>_seed_demo_user.sql`:
```sql
-- Idempotent demo user seed
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, aud, role
)
VALUES (
  '00000000-0000-0000-0000-000000000001',  -- fixed UUID for demo
  'demo@meridian.dev',
  crypt('MeridianDemo2026!', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated'
)
ON CONFLICT (email) DO NOTHING;
-- Trigger auto-creates the profile row
```

### 4. Quick README section
Add to README.md:
```
## Demo Account
Email: `demo@meridian.dev`  
Password: `MeridianDemo2026!`  
⚠️ The demo account is shared — use your own account for private repositories.
```

## Files touched
- `src/pages/Auth.tsx` — remove Google, add demo helper
- `supabase/migrations/<new>_seed_demo_user.sql` — seed demo user
- `README.md` — demo credentials section

