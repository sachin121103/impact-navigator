/**
 * Impact Suggest — given a change prompt + resolved target symbol +
 * affected (upstream caller) symbols, returns short AI-generated
 * "breaking change" explanations for the top affected symbols.
 *
 * Uses Lovable AI (LOVABLE_API_KEY) — no user-supplied keys needed.
 *
 * POST /impact-suggest
 *   {
 *     prompt: string,
 *     target: { name, qualified_name, kind, file_path },
 *     affected: Array<{ id, name, qualified_name, kind, file_path, risk }>
 *   }
 *
 * Returns:
 *   { ok: true, suggestions: Array<{ id, why: string, fix: string }> }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface AffectedIn {
  id: string;
  name: string;
  qualified_name?: string;
  kind?: string;
  file_path?: string;
  risk?: number | string;
  depth?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Verify the caller's Supabase JWT — this endpoint burns LOVABLE_API_KEY
  // credits on every call, so it must not accept arbitrary Bearer tokens.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    prompt?: string;
    target?: { name?: string; qualified_name?: string; kind?: string; file_path?: string };
    affected?: AffectedIn[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  const target = body.target ?? {};
  const affected = (body.affected ?? []).slice(0, 8); // cap for cost/latency

  if (!prompt) return json({ error: "prompt is required" }, 400);
  if (affected.length === 0) {
    return json({ ok: true, suggestions: [] });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  const systemPrompt = `You are a senior code reviewer analyzing the downstream impact of a proposed code change.
For each affected symbol provided, write a brief, specific explanation of WHY it could break given the change, and a concrete suggestion for HOW to fix or adapt it.
Keep "why" to one sentence (max ~25 words). Keep "fix" to one short, actionable sentence (max ~25 words).
Be specific to the symbol's name and file. Do not be generic. If the risk is low, say so plainly.`;

  const userPrompt = `Proposed change:
"${prompt}"

Target symbol being changed:
- ${target.qualified_name ?? target.name ?? "unknown"} (${target.kind ?? "symbol"}) in ${target.file_path ?? "unknown file"}

Affected upstream callers (return one suggestion per id):
${affected.map((a, i) =>
  `${i + 1}. id=${a.id} | ${a.qualified_name ?? a.name} (${a.kind ?? "symbol"}) in ${a.file_path ?? "?"} | risk=${a.risk ?? "?"}`
).join("\n")}

Return suggestions for ALL ${affected.length} affected symbols, in the same order, using the suggest_breaking_changes tool.`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_breaking_changes",
              description: "Return a brief why/fix explanation per affected symbol.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "The exact id from the input list" },
                        why: { type: "string", description: "One short sentence explaining why this could break" },
                        fix: { type: "string", description: "One short, actionable sentence on how to fix it" },
                      },
                      required: ["id", "why", "fix"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_breaking_changes" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "AI rate limit hit, please try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted — top up in Settings → Workspace → Usage." }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 502);
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      console.error("No tool_call arguments returned", JSON.stringify(data).slice(0, 500));
      return json({ ok: true, suggestions: [] });
    }
    const parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

    return json({ ok: true, suggestions });
  } catch (err) {
    console.error("impact-suggest error:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
