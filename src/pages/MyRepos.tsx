import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, Loader2, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface RepoRow {
  id: string;
  url: string;
  owner: string;
  name: string;
  status: string;
  visibility: string;
  symbol_count: number;
  edge_count: number;
  file_count: number;
  indexed_at: string | null;
  updated_at: string;
}

const MyRepos = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("repos")
      .select("id,url,owner,name,status,visibility,symbol_count,edge_count,file_count,indexed_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Could not load repos", description: error.message });
    } else {
      setRepos((data ?? []) as RepoRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const toggleVisibility = async (repo: RepoRow) => {
    const next = repo.visibility === "private" ? "public" : "private";
    const { error } = await supabase
      .from("repos")
      .update({ visibility: next })
      .eq("id", repo.id);
    if (error) {
      toast({ variant: "destructive", title: "Could not update", description: error.message });
      return;
    }
    setRepos((prev) => prev.map((r) => (r.id === repo.id ? { ...r, visibility: next } : r)));
  };

  const remove = async (repo: RepoRow) => {
    if (!confirm(`Delete ${repo.owner}/${repo.name}? This wipes all indexed data.`)) return;
    const { error } = await supabase.from("repos").delete().eq("id", repo.id);
    if (error) {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
      return;
    }
    setRepos((prev) => prev.filter((r) => r.id !== repo.id));
    toast({ title: "Deleted", description: `${repo.owner}/${repo.name} removed.` });
  };

  return (
    <div className="min-h-screen texture-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/30">
            <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Meridian<span className="text-accent">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        <div className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-accent">· your repositories</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">My repos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Repos you've indexed. Private by default — only you can read their symbols and edges.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <Button asChild variant="ink">
            <Link to="/code-graph">+ Index a repo on Code Graph</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/impact-radar">Open Impact Radar</Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : repos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No repos yet. Head to{" "}
              <Link to="/code-graph" className="text-accent underline-offset-4 hover:underline">
                Code Graph
              </Link>{" "}
              and paste a GitHub URL to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-paper sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">
                      {repo.owner}/{repo.name}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        repo.visibility === "private"
                          ? "border-accent/30 text-accent"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      {repo.visibility}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        repo.status === "ready"
                          ? "border-risk-low/40 text-risk-low"
                          : repo.status === "failed"
                          ? "border-risk-high/40 text-risk-high"
                          : "border-risk-med/40 text-risk-med"
                      }`}
                    >
                      {repo.status}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {repo.symbol_count} symbols · {repo.edge_count} edges · {repo.file_count} files
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`vis-${repo.id}`}
                      checked={repo.visibility === "public"}
                      onCheckedChange={() => toggleVisibility(repo)}
                    />
                    <Label htmlFor={`vis-${repo.id}`} className="font-mono text-xs">
                      Public
                    </Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(repo)}
                    aria-label="Delete repo"
                  >
                    <Trash2 className="h-4 w-4 text-risk-high" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Symbol metadata only is stored. No source code, no tokens, no secrets.
        </p>
      </main>
    </div>
  );
};

export default MyRepos;
