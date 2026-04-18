import { GitBranch, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImpactInput } from "@/components/ImpactInput";
import { RadarVisual } from "@/components/RadarVisual";

const Index = () => {
  return (
    <div className="min-h-screen texture-paper">
      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/20">
            <div className="h-1.5 w-1.5 rounded-full bg-accent" />
            <div className="absolute inset-0 rounded-full bg-accent/20 animate-radar-pulse" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Impact<span className="text-accent">.</span>Radar
          </span>
        </div>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#repos" className="hover:text-foreground transition-colors">Repos</a>
          <a href="#docs" className="hover:text-foreground transition-colors">Docs</a>
        </nav>
        <Button variant="outline" size="sm">Sign in</Button>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pt-12 pb-24 md:pt-20">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left: copy + input */}
          <div className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
              <span className="font-mono">v0.1 · indexing psf/requests</span>
            </div>

            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              See the <em className="text-accent not-italic">blast radius</em><br />
              before you ship.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Describe a change in plain English. Impact Radar maps every downstream
              dependency, ranks them by risk, and tells you exactly which files will break.
            </p>

            <div className="mt-10 max-w-xl">
              <ImpactInput />
              <div className="mt-3 flex items-center gap-4 px-1 text-xs text-muted-foreground">
                <span className="font-mono">repo:</span>
                <code className="rounded bg-secondary px-2 py-0.5 font-mono text-foreground">
                  github.com/psf/requests
                </code>
                <button className="ml-auto underline-offset-4 hover:underline">change</button>
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <Stat value="2,341" label="symbols indexed" />
              <Stat value="11,094" label="call edges" />
              <Stat value="89ms" label="avg radar time" />
            </div>
          </div>

          {/* Right: animated radar */}
          <div className="relative">
            <RadarVisual />
            <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-4 py-2.5 font-mono text-xs shadow-paper">
              <span className="text-risk-high">●</span> 3 will break ·{" "}
              <span className="text-risk-med">●</span> 12 review ·{" "}
              <span className="text-risk-low">●</span> 32 safe
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-16 max-w-2xl">
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
              · how it works
            </p>
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Three steps from intent to impact.
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <Step
              n="01"
              icon={<GitBranch className="h-5 w-5" />}
              title="Index your repo"
              body="We clone, parse the AST, and build a complete call graph. Functions, classes, imports — every edge captured."
            />
            <Step
              n="02"
              icon={<Search className="h-5 w-5" />}
              title="Describe the change"
              body="Type what you're about to do in plain English. No forms. We resolve it to the right symbol in your graph."
            />
            <Step
              n="03"
              icon={<Zap className="h-5 w-5" />}
              title="See the blast radius"
              body="Every downstream dependent, ranked red/amber/green by depth, churn, and change type. Click to explore."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center">
          <div className="font-mono">
            impact.radar — built for engineers who ship without flinching.
          </div>
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

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex items-baseline gap-2">
    <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
      {value}
    </span>
    <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
  </div>
);

const Step = ({
  n,
  icon,
  title,
  body,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className="group relative rounded-lg border border-border bg-card p-7 shadow-paper transition-all hover:shadow-lift hover:-translate-y-0.5">
    <div className="mb-6 flex items-center justify-between">
      <span className="font-mono text-xs text-muted-foreground">{n}</span>
      <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-accent">
        {icon}
      </div>
    </div>
    <h3 className="mb-2 font-display text-xl font-semibold tracking-tight">{title}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
  </div>
);

export default Index;
