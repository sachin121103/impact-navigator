/**
 * Code Impact — given a pasted snippet of code, find which symbols in the
 * indexed repo it references, then traverse callers (downstream) to surface
 * everything that could break.
 *
 * POST /code-impact  { code: string, repoUrl: string }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
function riskLevel(fan_in: number, churn: number): RiskLevel {
  if (fan_in >= 5 || churn >= 3) return "high";
  if (fan_in >= 2 || churn >= 1) return "medium";
  return "low";
}

const STOPWORDS = new Set([
  "if","else","for","while","return","function","const","let","var","int","void","char","float","double",
  "true","false","null","new","this","import","from","export","class","public","private","static",
  "include","define","struct","typedef","sizeof","break","continue","switch","case","default",
  "try","catch","throw","async","await","yield","of","in","do","unsigned","signed","long","short",
]);

function extractIdentifiers(code: string): Set<string> {
  // Strip strings and single/multi-line comments to reduce noise.
  const cleaned = code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");

  const ids = new Set<string>();
  // Function-call-like: identifier followed by (
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]{1,})\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(cleaned)) !== null) {
    const name = m[1];
    if (!STOPWORDS.has(name)) ids.add(name);
  }
  // Member-access tail: .foo or ::foo or ->foo
  const memberRe = /(?:\.|::|->)([A-Za-z_][A-Za-z0-9_]{1,})/g;
  while ((m = memberRe.exec(cleaned)) !== null) {
    const name = m[1];
    if (!STOPWORDS.has(name)) ids.add(name);
  }
  return ids;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const userId = decodeJwtSub(authHeader.replace("Bearer ", ""));
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const code: string = (body.code ?? "").toString();
    const repoUrl: string | undefined = body.repoUrl;
    if (!code.trim()) throw new Error("code is required");
    if (code.length > 50_000) throw new Error("code snippet too large (max 50k chars)");
    if (!repoUrl) throw new Error("repoUrl is required");

    const { data: repo } = await userClient
      .from("repos")
      .select("id, status")
      .eq("url", repoUrl)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!repo) throw new Error("Repo not found — index it first");
    if ((repo as any).status !== "ready") {
      throw new Error(`Repo is not ready (status: ${(repo as any).status})`);
    }
    const repoId = (repo as any).id;

    const ids = extractIdentifiers(code);
    if (ids.size === 0) throw new Error("Could not find any identifiers in the snippet");

    const { data: symbols, error: symErr } = await userClient
      .from("symbols")
      .select("id, qualified_name, name, kind, file_path, line_number, fan_in, fan_out, churn")
      .eq("repo_id", repoId);
    if (symErr || !symbols) throw new Error(`Failed to load symbols: ${symErr?.message}`);

    const symbolMap = new Map<string, any>(
      (symbols as any[]).map((s) => [s.id, s]),
    );
    const byName = new Map<string, any[]>();
    for (const s of symbols as any[]) {
      const arr = byName.get(s.name) ?? [];
      arr.push(s);
      byName.set(s.name, arr);
    }

    // Resolve identifier hits → matched symbols in the repo.
    const matched: any[] = [];
    const matchedIds = new Set<string>();
    for (const id of ids) {
      const hits = byName.get(id);
      if (!hits) continue;
      for (const h of hits) {
        if (!matchedIds.has(h.id)) {
          matchedIds.add(h.id);
          matched.push(h);
        }
      }
    }

    if (matched.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          matched: [],
          affected: [],
          summary: { high: 0, medium: 0, low: 0, total: 0 },
          identifiers: [...ids].slice(0, 50),
          durationMs: Date.now() - startedAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: edges } = await userClient
      .from("edges")
      .select("source_id, target_id")
      .eq("repo_id", repoId);

    // caller map: target -> [callers...]
    const callerMap = new Map<string, string[]>();
    for (const e of (edges ?? []) as any[]) {
      const arr = callerMap.get(e.target_id) ?? [];
      arr.push(e.source_id);
      callerMap.set(e.target_id, arr);
    }

    // BFS from each matched symbol, tracking minimum depth.
    const visited = new Map<string, number>();
    for (const seed of matched) visited.set(seed.id, 0);
    const queue: { id: string; depth: number }[] = matched.map((s) => ({ id: s.id, depth: 0 }));
    const MAX_DEPTH = 5;
    const MAX_AFFECTED = 200;

    while (queue.length > 0 && visited.size <= MAX_AFFECTED) {
      const { id, depth } = queue.shift()!;
      if (depth >= MAX_DEPTH) continue;
      for (const callerId of (callerMap.get(id) ?? [])) {
        if (!visited.has(callerId)) {
          visited.set(callerId, depth + 1);
          queue.push({ id: callerId, depth: depth + 1 });
        }
      }
    }

    const affected: any[] = [];
    for (const [id, depth] of visited) {
      if (matchedIds.has(id)) continue; // exclude seeds
      const sym = symbolMap.get(id);
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
      if (riskOrder[a.risk as RiskLevel] !== riskOrder[b.risk as RiskLevel])
        return riskOrder[a.risk as RiskLevel] - riskOrder[b.risk as RiskLevel];
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.fan_in - a.fan_in;
    });

    const summary = {
      high: affected.filter((a) => a.risk === "high").length,
      medium: affected.filter((a) => a.risk === "medium").length,
      low: affected.filter((a) => a.risk === "low").length,
      total: affected.length,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        matched: matched.map((s) => ({
          id: s.id,
          name: s.name,
          qualified_name: s.qualified_name,
          kind: s.kind,
          file_path: s.file_path,
        })),
        affected,
        summary,
        identifiers: [...ids].slice(0, 50),
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("code-impact error:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
