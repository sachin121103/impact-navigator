import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SubPageShell = ({
  eyebrow,
  title,
  tagline,
  description,
  visual,
  panel,
  legend,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  description: string;
  /** Full-bleed background visual (e.g. radar / star). */
  visual: React.ReactNode;
  /** Glassy panel content (input, explanation, etc.) shown on the right. */
  panel: React.ReactNode;
  /** Optional legend pill rendered bottom-left. */
  legend?: React.ReactNode;
}) => {
  return (
    <div className="relative h-screen w-full overflow-hidden texture-paper">
      {/* Full-bleed visual */}
      <div className="absolute inset-0 opacity-90">{visual}</div>

      {/* Soft fade so panel text stays legible */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[520px] bg-gradient-to-l from-background/70 via-background/20 to-transparent" />

      {/* Floating top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 shadow-paper backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative grid h-6 w-6 place-items-center rounded-full border border-foreground/30">
              <Compass className="h-3 w-3 text-accent" strokeWidth={2.2} />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">
              Meridian<span className="text-accent">.</span>
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            / {eyebrow.split("·").pop()?.trim() ?? eyebrow}
          </span>
        </div>

        <Button variant="ghost" size="sm" asChild className="pointer-events-auto rounded-full bg-card/70 backdrop-blur">
          <Link to="/" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </Button>
      </header>

      {/* Right-side content column */}
      <aside className="pointer-events-none absolute right-0 top-0 z-10 flex h-full w-full max-w-[520px] flex-col justify-center px-8 py-24">
        <div className="pointer-events-auto animate-fade-up">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-accent">
            · {eyebrow}
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-3 font-display text-lg italic text-muted-foreground md:text-xl">
            {tagline}
          </p>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className="mt-7">{panel}</div>
        </div>
      </aside>

      {/* Legend pill */}
      {legend && (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 font-mono text-[10px] text-muted-foreground shadow-paper backdrop-blur">
          {legend}
        </div>
      )}
    </div>
  );
};
