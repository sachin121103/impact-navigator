
Add a sign-out control to the sub-page header (used by Code Graph, Sentinel Graph, Impact Radar). The landing page header already has one.

## Change
In `src/components/SubPageShell.tsx`, add a "Sign out" button next to the existing "Back" button in the floating top bar. Only render when `user` is present (via `useAuth`).

- Import `useAuth` and `LogOut` icon.
- Group the right-side buttons in a flex container.
- Button: `variant="ghost"`, `size="sm"`, rounded pill matching the Back button style, calls `signOut()` then no redirect needed (RequireAuth will bounce to `/auth`).

## Files touched
- `src/components/SubPageShell.tsx` — add Sign out button

No other files need changes; `Index.tsx` already has sign-out wired.
