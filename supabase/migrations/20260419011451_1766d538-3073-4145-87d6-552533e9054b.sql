-- ============================================================
-- 1. WIPE EXISTING DATA (clean slate per user request)
-- ============================================================
DELETE FROM public.impact_runs;
DELETE FROM public.edges;
DELETE FROM public.symbols;
DELETE FROM public.repos;

-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  github_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. ROLES SYSTEM (separate table — never on profiles)
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 4. ADD OWNERSHIP TO REPOS
-- ============================================================
ALTER TABLE public.repos
  ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public'));

CREATE INDEX idx_repos_owner_id ON public.repos(owner_id);
CREATE INDEX idx_repos_visibility ON public.repos(visibility);

-- ============================================================
-- 5. CASCADE DELETES from repos to children
-- ============================================================
-- Drop existing FKs (if any) and re-add with CASCADE
ALTER TABLE public.symbols
  DROP CONSTRAINT IF EXISTS symbols_repo_id_fkey,
  ADD CONSTRAINT symbols_repo_id_fkey
    FOREIGN KEY (repo_id) REFERENCES public.repos(id) ON DELETE CASCADE;

ALTER TABLE public.edges
  DROP CONSTRAINT IF EXISTS edges_repo_id_fkey,
  ADD CONSTRAINT edges_repo_id_fkey
    FOREIGN KEY (repo_id) REFERENCES public.repos(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS edges_source_id_fkey,
  ADD CONSTRAINT edges_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES public.symbols(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS edges_target_id_fkey,
  ADD CONSTRAINT edges_target_id_fkey
    FOREIGN KEY (target_id) REFERENCES public.symbols(id) ON DELETE CASCADE;

ALTER TABLE public.impact_runs
  DROP CONSTRAINT IF EXISTS impact_runs_repo_id_fkey,
  ADD CONSTRAINT impact_runs_repo_id_fkey
    FOREIGN KEY (repo_id) REFERENCES public.repos(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS impact_runs_resolved_symbol_id_fkey,
  ADD CONSTRAINT impact_runs_resolved_symbol_id_fkey
    FOREIGN KEY (resolved_symbol_id) REFERENCES public.symbols(id) ON DELETE SET NULL;

-- ============================================================
-- 6. REWRITE RLS POLICIES — REPOS
-- ============================================================
DROP POLICY IF EXISTS "Repos are publicly readable" ON public.repos;

CREATE POLICY "Owners and public can read repos"
  ON public.repos FOR SELECT
  USING (auth.uid() = owner_id OR visibility = 'public');

CREATE POLICY "Authenticated users can create repos"
  ON public.repos FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their repos"
  ON public.repos FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their repos"
  ON public.repos FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================================
-- 7. REWRITE RLS POLICIES — SYMBOLS
-- ============================================================
DROP POLICY IF EXISTS "Symbols are publicly readable" ON public.symbols;

CREATE POLICY "Read symbols of accessible repos"
  ON public.symbols FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = symbols.repo_id
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
  ));

CREATE POLICY "Owners can insert symbols"
  ON public.symbols FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = symbols.repo_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can delete symbols"
  ON public.symbols FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = symbols.repo_id AND r.owner_id = auth.uid()
  ));

-- ============================================================
-- 8. REWRITE RLS POLICIES — EDGES
-- ============================================================
DROP POLICY IF EXISTS "Edges are publicly readable" ON public.edges;

CREATE POLICY "Read edges of accessible repos"
  ON public.edges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = edges.repo_id
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
  ));

CREATE POLICY "Owners can insert edges"
  ON public.edges FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = edges.repo_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can delete edges"
  ON public.edges FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = edges.repo_id AND r.owner_id = auth.uid()
  ));

-- ============================================================
-- 9. REWRITE RLS POLICIES — IMPACT_RUNS
-- ============================================================
DROP POLICY IF EXISTS "Impact runs are publicly readable" ON public.impact_runs;
DROP POLICY IF EXISTS "Anyone can create impact runs" ON public.impact_runs;

CREATE POLICY "Read impact runs of accessible repos"
  ON public.impact_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = impact_runs.repo_id
      AND (r.owner_id = auth.uid() OR r.visibility = 'public')
  ));

CREATE POLICY "Owners can create impact runs"
  ON public.impact_runs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = impact_runs.repo_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can delete impact runs"
  ON public.impact_runs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.repos r
    WHERE r.id = impact_runs.repo_id AND r.owner_id = auth.uid()
  ));