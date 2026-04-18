// Impact Analyze — resolves a function name in an indexed repo and returns
// upstream callers ranked by risk, suitable for the Impact Radar visualization.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeRepoUrl = (raw: string) => {
  let s = raw.trim().replace(/\.git$/i, "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(s)) {
    if (/^github\.com\//i.test(s)) s = `https://${s}`;
    else if (/^[^/]+\/[^/]+$/.test(s)) s = `https://github.com/${s}`;
  }
  return s.toLowerCase();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { repoUrl?: string; repoId?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const query = (body.query ?? "").trim();
  if (!query) return json({ error: "query is required" }, 400);
  if (!body.repoUrl && !body.repoId) {
    return json({ error: "repoUrl or repoId is required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();

  // 1. Resolve repo (or auto-index if missing — Impact Radar is self-sufficient)
  let repo: { id: string; status: string; owner: string; name: string; symbol_count?: number; file_count?: number } | null = null;
  if (body.repoId) {
    const { data } = await supabase
      .from("repos")
      .select("id,status,owner,name,symbol_count,file_count")
      .eq("id", body.repoId)
      .maybeSingle();
    repo = data;
  } else if (body.repoUrl) {
    const url = normalizeRepoUrl(body.repoUrl);
    const { data: byUrl } = await supabase
      .from("repos")
      .select("id,status,owner,name,symbol_count,file_count")
      .ilike("url", url)
      .limit(1);
    repo = byUrl?.[0] ?? null;

    if (!repo) {
      const m = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
      if (m) {
        const { data: byOwnerName } = await supabase
          .from("repos")
          .select("id,status,owner,name,symbol_count,file_count")
          .ilike("owner", m[1])
          .ilike("name", m[2])
          .limit(1);
        repo = byOwnerName?.[0] ?? null;
      }
    }

    const shouldAutoIndex = !repo || (repo.status === "ready" && (repo.symbol_count ?? 0) === 0 && (repo.file_count ?? 0) === 0);

    if (shouldAutoIndex) {
      try {
        const indexRes = await supabase.functions.invoke("index-repo", {
          body: { repoUrl: body.repoUrl },
        });
        if (indexRes.error) throw new Error(indexRes.error.message);

        const { data: refreshedRepo } = await supabase
          .from("repos")
          .select("id,status,owner,name,symbol_count,file_count")
          .ilike("url", url)
          .limit(1);
        repo = refreshedRepo?.[0] ?? null;
      } catch (e) {
        return json({
          error: `Could not auto-index repository: ${(e as Error).message}`,
        }, 502);
      }
    }
  }

  if (!repo) return json({ error: "Repository could not be resolved." }, 404);

  if (repo.status !== "ready") {
    const deadline = Date.now() + 110_000;
    while (Date.now() < deadline && repo && repo.status !== "ready") {
      if (repo.status === "failed") {
        return json({ error: "Repository indexing failed. Try again." }, 502);
      }
      await new Promise((r) => setTimeout(r, 2500));
      const { data: refreshed } = await supabase
        .from("repos")
        .select("id,status,owner,name,symbol_count,file_count")
        .eq("id", repo.id)
        .maybeSingle();
      repo = refreshed;
    }
    if (!repo || repo.status !== "ready") {
      return json({ error: "Repository is still indexing. Try again in a moment." }, 409);
    }
  }

  // 2. Resolve target symbol — try the full query, then each identifier-like
  //    token in it (so "Delete update_game" still matches `update_game`).
  const candidates = Array.from(
    new Set(
      [query, ...(query.match(/[A-Za-z_][\w.]*/g) ?? [])]
        .map((s) => s.trim())
        .filter((s) => s.length > 1),
    ),
  );

  let target: any = null;
  for (const cand of candidates) {
    const { data: exact } = await supabase
      .from("symbols")
      .select("id,name,qualified_name,kind,file_path,line_number,fan_in,fan_out,churn")
      .eq("repo_id", repo.id)
      .or(`name.eq.${cand},qualified_name.eq.${cand}`)
      .order("fan_in", { ascending: false })
      .limit(1);
    if (exact?.length) { target = exact[0]; break; }
  }
  if (!target) {
    for (const cand of candidates) {
      const { data: fuzzy } = await supabase
        .from("symbols")
        .select("id,name,qualified_name,kind,file_path,line_number,fan_in,fan_out,churn")
        .eq("repo_id", repo.id)
        .or(`name.ilike.%${cand}%,qualified_name.ilike.%${cand}%`)
        .order("fan_in", { ascending: false })
        .limit(1);
      if (fuzzy?.length) { target = fuzzy[0]; break; }
    }
  }
  if (!target) {
    return json({
      error: `No symbol matching "${query}" found in this repo. Try a function name or qualified symbol from the indexed source files.`,
    }, 404);
  }

  // 3. BFS upstream callers
  const MAX_DEPTH = 4;
  const MAX_NODES = 200;
  const depthOf = new Map<string, number>(); // symbolId -> depth
  const edgeKindOf = new Map<string, string>();
  let frontier: string[] = [target.id];
  depthOf.set(target.id, 0);

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    if (!frontier.length) break;
    const { data: edges } = await supabase
      .from("edges")
      .select("source_id,target_id,kind")
      .eq("repo_id", repo.id)
      .in("target_id", frontier);
    if (!edges?.length) break;

    const next: string[] = [];
    for (const e of edges) {
      if (depthOf.has(e.source_id)) continue;
      depthOf.set(e.source_id, depth);
      edgeKindOf.set(e.source_id, e.kind);
      next.push(e.source_id);
      if (depthOf.size - 1 >= MAX_NODES) break;
    }
    frontier = next;
    if (depthOf.size - 1 >= MAX_NODES) break;
  }

  const callerIds = [...depthOf.keys()].filter((id) => id !== target.id);

  // 4. Fetch metadata
  let callers: any[] = [];
  if (callerIds.length) {
    const { data } = await supabase
      .from("symbols")
      .select("id,name,qualified_name,kind,file_path,line_number,fan_in,churn")
      .in("id", callerIds);
    callers = data ?? [];
  }

  // 5. Score & bucket
  const maxFanIn = Math.max(1, ...callers.map((c) => c.fan_in ?? 0));
  const maxChurn = Math.max(1, ...callers.map((c) => c.churn ?? 0));

  const affected = callers.map((c) => {
    const depth = depthOf.get(c.id) ?? MAX_DEPTH;
    const risk =
      0.5 * (1 / depth) +
      0.3 * ((c.fan_in ?? 0) / maxFanIn) +
      0.2 * ((c.churn ?? 0) / maxChurn);
    const bucket = risk > 0.66 ? "high" : risk > 0.33 ? "med" : "low";
    return {
      id: c.id,
      name: c.name,
      qualified_name: c.qualified_name,
      kind: c.kind,
      file_path: c.file_path,
      line_number: c.line_number,
      fan_in: c.fan_in,
      churn: c.churn,
      depth,
      edge_kind: edgeKindOf.get(c.id) ?? "call",
      risk: Math.round(risk * 1000) / 1000,
      bucket,
    };
  });

  affected.sort((a, b) => b.risk - a.risk);

  const summary = {
    high: affected.filter((a) => a.bucket === "high").length,
    med: affected.filter((a) => a.bucket === "med").length,
    low: affected.filter((a) => a.bucket === "low").length,
    total: affected.length,
    depthMax: affected.reduce((m, a) => Math.max(m, a.depth), 0),
  };

  const duration_ms = Date.now() - t0;

  // 6. Persist (best-effort)
  supabase
    .from("impact_runs")
    .insert({
      repo_id: repo.id,
      prompt: query,
      resolved_symbol_id: target.id,
      change_kind: "analyze",
      affected,
      summary,
      duration_ms,
    })
    .then(() => {})
    .catch(() => {});

  return json({
    repo: { id: repo.id, owner: repo.owner, name: repo.name },
    target: {
      id: target.id,
      name: target.name,
      qualified_name: target.qualified_name,
      kind: target.kind,
      file_path: target.file_path,
      line_number: target.line_number,
      fan_in: target.fan_in,
      fan_out: target.fan_out,
    },
    affected,
    summary,
    duration_ms,
  });
});
