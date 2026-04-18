/**
 * Impact Radar — Run Radar
 *
 * POST /run-radar  { prompt: string, repoId?: string, repoUrl?: string }
 *
 * Resolves the symbol named in the prompt, traverses the call graph in reverse
 * (BFS over callers), classifies each affected node by risk, saves to
 * impact_runs, and returns the full blast-radius result.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RiskLevel = "high" | "medium" | "low";

interface AffectedSymbol {
  id: string;
  qualified_name: string;
  name: string;
  kind: string;
  file_path: string;
  line_number: number;
  fan_in: number;
  fan_out: number;
  churn: number;
  risk: RiskLevel;
  depth: number;
}

function riskLevel(fan_in: number, churn: number): RiskLevel {
  if (fan_in >= 5 || churn >= 3) return "high";
  if (fan_in >= 2 || churn >= 1) return "medium";
  return "low";
}

function extractSymbolHints(prompt: string): string[] {
  const hints = new Set<string>();

  const patterns = [
    /\b(\w+\.\w+(?:\.\w+)*)\s*\(/g,      // qualified.call()
    /`([^`\n]+)`/g,                        // `backtick names`
    /(?:rename|change|delete|modify|update|refactor|remove)\s+([A-Za-z_][\w.]*)/gi,
    /([A-Za-z_][\w.]*)\s+(?:function|method|class)/gi,
  ];

  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(prompt)) !== null) {
      const name = m[1].trim();
      if (name && name.length > 1) hints.add(name);
    }
  }

  // Fallback: all words of length > 2 starting with a letter
  for (const word of prompt.split(/\W+/)) {
    if (word.length > 2 && /^[A-Za-z_]/.test(word)) hints.add(word);
  }

  return [...hints];
}

function classifyChangeKind(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("rename") || p.includes("renamed")) return "rename";
  if (p.includes("delete") || p.includes("remove")) return "delete";
  if (p.includes("signature") || p.includes("parameter") || p.includes("argument")) return "signature";
  return "behavior";
}

function scoreSymbol(sym: { name: string; qualified_name: string; kind: string }, hints: string[]): number {
  let score = 0;
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const n = sym.name.toLowerCase();
    const qn = sym.qualified_name.toLowerCase();

    if (qn === h || qn.endsWith(`.${h}`)) score += 10;
    else if (n === h) score += 8;
    else if (qn.endsWith(`.${h.split(".").pop()!}`)) score += 6;
    else if (n.includes(h) || h.includes(n)) score += 4;
    else if (qn.includes(h)) score += 2;
  }
  // Prefer functions and methods over modules
  if (sym.kind === "function" || sym.kind === "method") score += 2;
  else if (sym.kind === "class") score += 1;
  return score;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const prompt: string = (body.prompt ?? "").trim();
    const repoId: string | undefined = body.repoId;
    const repoUrl: string | undefined = body.repoUrl;

    if (!prompt) throw new Error("prompt is required");
    if (!repoId && !repoUrl) throw new Error("repoId or repoUrl is required");

    // Resolve repo
    let resolvedRepoId: string;
    if (repoId) {
      resolvedRepoId = repoId;
    } else {
      const { data: repo, error } = await supabase
        .from("repos")
        .select("id, status")
        .eq("url", repoUrl!)
        .single();
      if (error || !repo) throw new Error("Repo not found — index it first via /index-repo");
      if ((repo as any).status !== "ready") {
        throw new Error(`Repo is not ready yet (status: ${(repo as any).status}). Try again after indexing.`);
      }
      resolvedRepoId = (repo as any).id;
    }

    // Load all symbols (name + metrics only — we need the full set for scoring)
    const { data: symbols, error: symErr } = await supabase
      .from("symbols")
      .select("id, qualified_name, name, kind, file_path, line_number, fan_in, fan_out, churn")
      .eq("repo_id", resolvedRepoId);
    if (symErr || !symbols) throw new Error(`Failed to load symbols: ${symErr?.message}`);
    if (symbols.length === 0) throw new Error("No symbols found — is the repo indexed?");

    // Resolve the best-matching symbol
    const hints = extractSymbolHints(prompt);
    const symbolMap = new Map((symbols as any[]).map((s) => [s.id, s]));

    let bestSymbol: any = null;
    let bestScore = -1;
    for (const sym of symbols as any[]) {
      const s = scoreSymbol(sym, hints);
      if (s > bestScore) {
        bestScore = s;
        bestSymbol = sym;
      }
    }

    if (!bestSymbol || bestScore < 2) {
      throw new Error("Could not identify a symbol from the prompt — try including the exact function or method name.");
    }

    // Load all edges for this repo
    const { data: edges, error: edgeErr } = await supabase
      .from("edges")
      .select("source_id, target_id")
      .eq("repo_id", resolvedRepoId);
    if (edgeErr) throw new Error(`Failed to load edges: ${edgeErr.message}`);

    // Build reverse adjacency: targetId → [sourceIds] (callers of target)
    const callerMap = new Map<string, string[]>();
    for (const e of edges as any[]) {
      const arr = callerMap.get(e.target_id) ?? [];
      arr.push(e.source_id);
      callerMap.set(e.target_id, arr);
    }

    // BFS: find everything that (transitively) calls the changed symbol
    const visited = new Map<string, number>(); // id → depth
    const queue: { id: string; depth: number }[] = [{ id: bestSymbol.id, depth: 0 }];
    visited.set(bestSymbol.id, 0);
    const MAX_DEPTH = 5;
    const MAX_AFFECTED = 100;

    while (queue.length > 0 && visited.size <= MAX_AFFECTED + 1) {
      const { id, depth } = queue.shift()!;
      if (depth >= MAX_DEPTH) continue;
      for (const callerId of (callerMap.get(id) ?? [])) {
        if (!visited.has(callerId)) {
          visited.set(callerId, depth + 1);
          queue.push({ id: callerId, depth: depth + 1 });
        }
      }
    }

    // Build the affected list (exclude the root symbol itself)
    const affected: AffectedSymbol[] = [];
    for (const [id, depth] of visited) {
      if (id === bestSymbol.id) continue;
      const sym = symbolMap.get(id) as any;
      if (!sym) continue;
      affected.push({
        id: sym.id,
        qualified_name: sym.qualified_name,
        name: sym.name,
        kind: sym.kind,
        file_path: sym.file_path,
        line_number: sym.line_number,
        fan_in: sym.fan_in,
        fan_out: sym.fan_out,
        churn: sym.churn,
        risk: riskLevel(sym.fan_in, sym.churn),
        depth,
      });
    }

    // Sort: high risk → medium → low, then by depth asc, then by fan_in desc
    const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
    affected.sort((a, b) => {
      if (riskOrder[a.risk] !== riskOrder[b.risk]) return riskOrder[a.risk] - riskOrder[b.risk];
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.fan_in - a.fan_in;
    });

    const summary = {
      high: affected.filter((a) => a.risk === "high").length,
      medium: affected.filter((a) => a.risk === "medium").length,
      low: affected.filter((a) => a.risk === "low").length,
      total: affected.length,
    };

    const changeKind = classifyChangeKind(prompt);
    const durationMs = Date.now() - startedAt;

    // Persist the run (non-blocking error — don't fail the request if write fails)
    const { data: run } = await supabase
      .from("impact_runs")
      .insert({
        repo_id: resolvedRepoId,
        prompt,
        resolved_symbol_id: bestSymbol.id,
        change_kind: changeKind,
        affected: affected as any,
        summary: summary as any,
        duration_ms: durationMs,
      })
      .select("id")
      .single();

    return new Response(
      JSON.stringify({
        ok: true,
        runId: (run as any)?.id ?? null,
        resolvedSymbol: {
          id: bestSymbol.id,
          qualified_name: bestSymbol.qualified_name,
          name: bestSymbol.name,
          kind: bestSymbol.kind,
          file_path: bestSymbol.file_path,
          line_number: bestSymbol.line_number,
        },
        affected,
        summary,
        durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("run-radar error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
