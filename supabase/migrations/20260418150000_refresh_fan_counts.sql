-- Bulk-update fan_in / fan_out for all symbols in a repo from the edges table.
-- Called by the index-repo edge function instead of N+1 individual updates.
CREATE OR REPLACE FUNCTION public.refresh_fan_counts(p_repo_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.symbols s
  SET
    fan_in  = COALESCE(fi.cnt, 0),
    fan_out = COALESCE(fo.cnt, 0)
  FROM (
    SELECT target_id AS id, COUNT(*)::integer AS cnt
    FROM public.edges
    WHERE repo_id = p_repo_id
    GROUP BY target_id
  ) fi
  FULL OUTER JOIN (
    SELECT source_id AS id, COUNT(*)::integer AS cnt
    FROM public.edges
    WHERE repo_id = p_repo_id
    GROUP BY source_id
  ) fo USING (id)
  WHERE s.id = COALESCE(fi.id, fo.id)
    AND s.repo_id = p_repo_id;
$$;
