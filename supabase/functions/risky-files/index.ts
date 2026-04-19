/**
 * Risky Files — surface historically fragile files based on git churn.
 *
 * We aggregate the `churn` field already stored on `symbols` (computed from
 * `git log --follow` during indexing) per file_path, and return the top N.
 *
 * POST /risky-files  { repoUrl: string, limit?: number }
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
  const userId = decodeJwtSub(authHeader.replace("Bearer ", ""));
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const repoUrl: string | undefined = body.repoUrl;
    const limit: number = Math.min(Math.max(Number(body.limit) || 12, 1), 50);
    if (!repoUrl) throw new Error("repoUrl is required");

    const { data: repo } = await userClient
      .from("repos")
      .select("id")
      .eq("url", repoUrl)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!repo) throw new Error("Repo not found");
    const repoId = (repo as any).id;

    // Pull only the columns we need. Churn is per-symbol but reflects the
    // number of commits that touched that symbol's file in git history.
    const { data: rows, error } = await userClient
      .from("symbols")
      .select("file_path, churn")
      .eq("repo_id", repoId);
    if (error) throw error;

    // Aggregate per file. We take the MAX churn across symbols in a file,
    // which equals the file's commit count (every symbol in the same file
    // shares that file's git history), and count how many symbols live there.
    const byFile = new Map<string, { churn: number; symbols: number }>();
    for (const r of (rows ?? []) as any[]) {
      const existing = byFile.get(r.file_path);
      if (!existing) {
        byFile.set(r.file_path, { churn: r.churn ?? 0, symbols: 1 });
      } else {
        existing.churn = Math.max(existing.churn, r.churn ?? 0);
        existing.symbols += 1;
      }
    }

    const files = [...byFile.entries()]
      .map(([file_path, v]) => ({ file_path, churn: v.churn, symbols: v.symbols }))
      .filter((f) => f.churn > 0)
      .sort((a, b) => b.churn - a.churn)
      .slice(0, limit);

    const maxChurn = files[0]?.churn ?? 0;

    return new Response(
      JSON.stringify({
        ok: true,
        files,
        maxChurn,
        totalFiles: byFile.size,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
