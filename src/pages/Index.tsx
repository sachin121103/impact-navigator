import { Link } from "react-router-dom";
import { Compass, GitBranch, Sparkles, Radar, ArrowUpRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen texture-paper">
      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/30">
            <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Meridian<span className="text-accent">.</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link to="/code-graph" className="hover:text-foreground transition-colors">Code Graph</Link>
          <Link to="/sentinel-graph" className="hover:text-foreground transition-colors">Sentinel Graph</Link>
          <Link to="/impact-radar" className="hover:text-foreground transition-colors">Impact Radar</Link>
        </nav>
        {user ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/repos">My repos</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-28 md:pt-24">
        <div className="mx-auto max-w-4xl text-center animate-fade-up">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono">three tools · one bearing</span>
          </div>

          <h1 className="font-display text-6xl font-semibold leading-[1.02] tracking-tight md:text-7xl lg:text-8xl">
            Meridian<span className="text-accent">.</span>
          </h1>
          <p className="mt-5 font-display text-2xl italic text-muted-foreground md:text-3xl">
            Know where you are.
          </p>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            A navigator's toolkit for codebases. Map the terrain, ask the locals,
            and see the storm before it lands.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button variant="ink" size="lg" asChild>
              <Link to="/code-graph">Open Code Graph</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="#tools">Explore the toolkit</a>
            </Button>
          </div>
        </div>

        {/* Decorative compass */}
        <div className="pointer-events-none absolute left-1/2 top-12 -z-10 -translate-x-1/2 opacity-[0.06]">
          <Compass className="h-[520px] w-[520px]" strokeWidth={0.5} />
        </div>
      </section>

      {/* Three tools */}
      <section id="tools" className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-14 flex items-end justify-between gap-8">
            <div className="max-w-xl">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
                · the toolkit
              </p>
              <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Three instruments.<br />One sense of place.
              </h2>
            </div>
            <p className="hidden max-w-sm text-sm text-muted-foreground md:block">
              Each tool answers a different question about your repository.
              Use them alone or together.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <ToolCard
              to="/code-graph"
              n="01"
              icon={<GitBranch className="h-5 w-5" />}
              name="Code Graph"
              tagline="Where does it live?"
              body="Visualise an entire repository as a navigable graph — folders, files, and the threads between them. Zoom from continent to street."
            />
            <ToolCard
              to="/sentinel-graph"
              n="02"
              icon={<Sparkles className="h-5 w-5" />}
              name="Sentinel Graph"
              tagline="What will it touch?"
              body="A live dependency map with dead-code highlighting, ripple impact analysis, and a test orchestrator that runs only the tests your change actually breaks."
            />
            <ToolCard
              to="/impact-radar"
              n="03"
              icon={<Radar className="h-5 w-5" />}
              name="Impact Radar"
              tagline="What will I break?"
              body="Describe a change in plain English. See every downstream dependent ranked red, amber, green — before you ship."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center">
          <div className="font-mono">meridian — know where you are.</div>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-foreground">GitHub</a>
            <a href="#" className="hover:text-foreground">Changelog</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

const ToolCard = ({
  to, n, icon, name, tagline, body,
}: {
  to: string; n: string; icon: React.ReactNode; name: string; tagline: string; body: string;
}) => (
  <Link
    to={to}
    className="group relative flex flex-col rounded-lg border border-border bg-card p-7 shadow-paper transition-all hover:shadow-lift hover:-translate-y-0.5"
  >
    <div className="mb-6 flex items-center justify-between">
      <span className="font-mono text-xs text-muted-foreground">{n}</span>
      <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-accent">
        {icon}
      </div>
    </div>
    <h3 className="mb-1 font-display text-2xl font-semibold tracking-tight">{name}</h3>
    <p className="mb-4 font-display text-base italic text-accent">{tagline}</p>
    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100">
      Open {name} <ArrowUpRight className="h-4 w-4" />
    </div>
  </Link>
);

export default Index;
