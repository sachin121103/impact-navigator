CREATE OR REPLACE FUNCTION public.refresh_fan_counts(p_repo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ownership guard: only the repo owner (or service role) may recompute.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.repos
    WHERE id = p_repo_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'access denied: not repo owner';
  END IF;

  UPDATE public.symbols s
  SET fan_in = (
        SELECT COUNT(*) FROM public.edges e
        WHERE e.repo_id = p_repo_id AND e.target_id = s.id
      ),
      fan_out = (
        SELECT COUNT(*) FROM public.edges e
        WHERE e.repo_id = p_repo_id AND e.source_id = s.id
      )
  WHERE s.repo_id = p_repo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_fan_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_fan_counts(uuid) TO authenticated, service_role;