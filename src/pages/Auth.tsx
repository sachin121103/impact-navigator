import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Compass, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const credSchema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email" }).max(255),
  password: z.string().min(8, { message: "At least 8 characters" }).max(72),
});

const DEMO_EMAIL = "demo@meridian.dev";
const DEMO_PASSWORD = "MeridianDemo2026!";

const Auth = () => {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/repos";

  useEffect(() => {
    if (!loading && user) navigate(redirectTo, { replace: true });
  }, [user, loading, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast({
        variant: "destructive",
        title: "Check your details",
        description: parsed.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/repos` },
        });
        if (error) throw error;
        toast({ title: "Welcome aboard", description: "You're signed in." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Authentication failed",
        description: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = () => {
    setMode("signin");
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <div className="min-h-screen texture-paper">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/30">
            <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Meridian<span className="text-accent">.</span>
          </span>
        </Link>
      </header>

      <main className="mx-auto max-w-md px-6 pt-12 pb-16">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Welcome back. Your repos stay private to you."
            : "Index private repos. Your code stays yours."}
        </p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-paper">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" variant="ink" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-accent underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Try the demo
            </span>
          </div>
          <dl className="mt-3 space-y-1 font-mono text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">email</dt>
              <dd className="text-foreground">{DEMO_EMAIL}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">password</dt>
              <dd className="text-foreground">{DEMO_PASSWORD}</dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={fillDemo}
            disabled={submitting}
          >
            Fill demo credentials
          </Button>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            ⚠️ Demo account is shared across visitors — don't index proprietary code under it.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          We store symbol metadata only — never your source code or tokens.
        </p>
      </main>
    </div>
  );
};

export default Auth;
