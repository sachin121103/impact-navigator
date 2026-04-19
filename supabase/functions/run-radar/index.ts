/**
 * Impact Radar — Run Radar
 *
 * POST /run-radar  { prompt: string, repoId?: string, repoUrl?: string }
 *
 * Authenticated. Uses the caller's JWT so RLS naturally scopes data to the
 * user's own repos (or repos they've made public). Service-role is only used
 * for the impact_runs insert at the end.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Lightweight JWT payload decoder — extracts `sub`. Authorization is enforced
// by the userClient (Authorization header → RLS) and the final service-role
// insert relies on repo_id which the user has already been verified to own.
function decodeJwtSub(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

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

// English verbs / generic words from the prompt — never used as fuzzy hints.
const STOPWORDS = new Set([
  "rename", "renamed", "change", "changed", "delete", "deleted",
  "remove", "removed", "modify", "modified", "update", "updated",
  "refactor", "refactored", "add", "added", "fix", "fixed",
  "the", "this", "that", "from", "into", "make", "function", "method",
  "class", "module", "file", "and", "for", "with", "all", "any",
  "new", "old", "use", "using", "behavior", "logic", "code",
]);

function tokens(id: string): string[] {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[_\-.]/)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 2);
}

interface Hint {
  raw: string;
  parts: string[];
  strong: boolean;
}

function extractSymbolHints(prompt: string): Hint[] {
  const seen = new Map<string, Hint>();
  const add = (raw: string, strong: boolean) => {
    const r = raw.trim();
    if (!r || r.length < 2) return;
    const lc = r.toLowerCase();
    if (STOPWORDS.has(lc)) return;
    const prev = seen.get(lc);
    if (prev) prev.strong = prev.strong || strong;
    else seen.set(lc, { raw: r, parts: tokens(r), strong });
  };

  const strongPatterns = [
    /\b(\w+\.\w+(?:\.\w+)*)\s*\(/g,
    /`([^`\n]+)`/g,
    /(?:rename|change|delete|modify|update|refactor|remove|fix|add)\s+([A-Za-z_][\w.]*)/gi,
    /([A-Za-z_][\w.]*)\s+(?:function|method|class)/gi,
    /\b([A-Za-z_][\w.]*)\s*\(\s*\)?/g,
  ];
  for (const re of strongPatterns) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(prompt)) !== null) add(m[1], true);
  }
  for (const word of prompt.split(/\W+/)) {
    if (word.length >= 3 && /^[A-Za-z_]/.test(word)) add(word, false);
  }
  return [...seen.values()];
}

function classifyChangeKind(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("rename") || p.includes("renamed")) return "rename";
  if (p.includes("delete") || p.includes("remove")) return "delete";
  if (p.includes("signature") || p.includes("parameter") || p.includes("argument")) return "signature";
  return "behavior";
}

function scoreSymbol(
  sym: { name: string; qualified_name: string; kind: string },
  hints: Hint[],
): number {
  if (hints.length === 0) return 0;
  const n = sym.name.toLowerCase();
  const qn = sym.qualified_name.toLowerCase();
  const symParts = new Set(tokens(sym.name));
  let score = 0;

  for (const h of hints) {
    const lc = h.raw.toLowerCase();
    const lastDot = lc.split(".").pop()!;
    const weight = h.strong ? 1 : 0.35;

    let local = 0;
    if (qn === lc || qn.endsWith(`.${lc}`) || qn.endsWith(`::${lc}`)) local = 30;
    else if (n === lc) local = 26;
    else if (n === lastDot) local = 22;
    else if (qn.endsWith(`.${lastDot}`) || qn.endsWith(`::${lastDot}`)) local = 18;
    else if (n.includes(lc) || lc.includes(n)) local = 8;
    else if (qn.includes(lc)) local = 4;

    if (local <= 8 && h.parts.length > 0) {
      const overlap = h.parts.filter((p) => symParts.has(p)).length;
      if (overlap > 0) {
        const coverage = overlap / h.parts.length;
        local += 6 * overlap + Math.round(4 * coverage);
      }
    }

    score += local * weight;
  }

  if (sym.kind === "function" || sym.kind === "method") score += 0.5;
  else if (sym.kind === "class") score += 0.25;
  return score;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  // Require a valid JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const userId = decodeJwtSub(token);
  if (!userId) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid session" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Service-role client used only for the final impact_runs insert (which
  // still passes through the RLS WITH CHECK because we set repo_id).
  const adminClient = createClient(
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

    // Resolve repo via the user's RLS scope — this guarantees they can only
    // touch their own repos (or public ones).
    let resolvedRepoId: string;
    if (repoId) {
      const { data: r } = await userClient
        .from("repos")
        .select("id, status")
        .eq("id", repoId)
        .maybeSingle();
      if (!r) throw new Error("Repo not found or you don't have access");
      if ((r as any).status !== "ready") {
        throw new Error(`Repo is not ready yet (status: ${(r as any).status}).`);
      }
      resolvedRepoId = (r as any).id;
    } else {
      const { data: r } = await userClient
        .from("repos")
        .select("id, status")
        .eq("url", repoUrl!)
        .eq("owner_id", userId)
        .maybeSingle();
      if (!r) throw new Error("Repo not found — index it first via Code Graph");
      if ((r as any).status !== "ready") {
        throw new Error(`Repo is not ready yet (status: ${(r as any).status}).`);
      }
      resolvedRepoId = (r as any).id;
    }

    // Load symbols + edges through user client (RLS-scoped).
    const { data: symbols, error: symErr } = await userClient
      .from("symbols")
      .select("id, qualified_name, name, kind, file_path, line_number, fan_in, fan_out, churn")
      .eq("repo_id", resolvedRepoId);
    if (symErr || !symbols) throw new Error(`Failed to load symbols: ${symErr?.message}`);
    if (symbols.length === 0) throw new Error("No symbols found — is the repo indexed?");

    const hints = extractSymbolHints(prompt);
    const symbolMap = new Map((symbols as any[]).map((s) => [s.id, s]));

    let bestSymbol: any = null;
    let bestScore = -1;
    for (const sym of symbols as any[]) {
      const s = scoreSymbol(sym, hints);
      if (s > bestScore) { bestScore = s; bestSymbol = sym; }
    }

    if (!bestSymbol || bestScore < 2) {
      throw new Error("Could not identify a symbol from the prompt — try including the exact function or method name.");
    }

    const { data: edges, error: edgeErr } = await userClient
      .from("edges")
      .select("source_id, target_id")
      .eq("repo_id", resolvedRepoId);
    if (edgeErr) throw new Error(`Failed to load edges: ${edgeErr.message}`);

    const callerMap = new Map<string, string[]>();
    for (const e of edges as any[]) {
      const arr = callerMap.get(e.target_id) ?? [];
      arr.push(e.source_id);
      callerMap.set(e.target_id, arr);
    }

    const visited = new Map<string, number>();
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

    const { data: run } = await adminClient
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
          fan_in: bestSymbol.fan_in ?? 0,
          fan_out: bestSymbol.fan_out ?? 0,
          churn: bestSymbol.churn ?? 0,
        },
        changeKind,
        affected,
        summary,
        durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("run-radar error:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
