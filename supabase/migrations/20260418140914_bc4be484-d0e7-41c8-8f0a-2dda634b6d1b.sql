-- Repos being indexed
CREATE TABLE public.repos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | indexing | ready | failed
  status_message TEXT,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Functions / classes / modules discovered in a repo
CREATE TABLE public.symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  qualified_name TEXT NOT NULL,        -- e.g. requests.sessions.Session.send
  name TEXT NOT NULL,                  -- e.g. send
  kind TEXT NOT NULL,                  -- function | method | class | module
  file_path TEXT NOT NULL,             -- e.g. src/requests/sessions.py
  line_number INTEGER NOT NULL DEFAULT 1,
  churn INTEGER NOT NULL DEFAULT 0,    -- recent commit touches
  fan_in INTEGER NOT NULL DEFAULT 0,   -- # of incoming callers
  fan_out INTEGER NOT NULL DEFAULT 0,  -- # of outgoing calls
  docstring TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repo_id, qualified_name)
);

CREATE INDEX idx_symbols_repo ON public.symbols(repo_id);
CREATE INDEX idx_symbols_name ON public.symbols(repo_id, name);
CREATE INDEX idx_symbols_file ON public.symbols(repo_id, file_path);

-- Directed call/import edges between symbols
CREATE TABLE public.edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.symbols(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.symbols(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'call',   -- call | import | inherits
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id, kind)
);

CREATE INDEX idx_edges_source ON public.edges(source_id);
CREATE INDEX idx_edges_target ON public.edges(target_id);
CREATE INDEX idx_edges_repo ON public.edges(repo_id);

-- Saved impact analyses
CREATE TABLE public.impact_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repo_id UUID NOT NULL REFERENCES public.repos(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  resolved_symbol_id UUID REFERENCES public.symbols(id) ON DELETE SET NULL,
  change_kind TEXT,                    -- rename | signature | delete | behavior
  affected JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_impact_runs_repo ON public.impact_runs(repo_id);

-- Enable RLS
ALTER TABLE public.repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_runs ENABLE ROW LEVEL SECURITY;

-- Public read (this is a public demo of indexed open-source repos)
CREATE POLICY "Repos are publicly readable" ON public.repos FOR SELECT USING (true);
CREATE POLICY "Symbols are publicly readable" ON public.symbols FOR SELECT USING (true);
CREATE POLICY "Edges are publicly readable" ON public.edges FOR SELECT USING (true);
CREATE POLICY "Impact runs are publicly readable" ON public.impact_runs FOR SELECT USING (true);

-- Anyone can create an impact run (to try the radar without auth)
CREATE POLICY "Anyone can create impact runs" ON public.impact_runs FOR INSERT WITH CHECK (true);

-- Writes to repos/symbols/edges are server-only (service-role bypasses RLS).
-- No INSERT/UPDATE/DELETE policies for anon/authenticated => denied by default.

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_repos_updated_at
  BEFORE UPDATE ON public.repos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();