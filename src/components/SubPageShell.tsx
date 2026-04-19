import { Link } from "react-router-dom";
import { ArrowLeft, Compass, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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
  visual: React.ReactNode;
  panel: React.ReactNode;
  legend?: React.ReactNode;
}) => {
  const { user, signOut } = useAuth();
  return (
    <div className="relative min-h-screen w-full texture-paper">
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

        <div className="pointer-events-auto flex items-center gap-2">
          {user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="rounded-full bg-card/70 backdrop-blur gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="rounded-full bg-card/70 backdrop-blur">
            <Link to="/" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Two-column split: visual left, text right */}
      <div className="grid min-h-screen grid-cols-1 items-start gap-8 px-6 pb-16 pt-24 lg:grid-cols-[1.1fr_440px] lg:gap-12 lg:pl-10 lg:pr-12">
        {/* Visual column */}
        <div className="relative flex min-h-[55vh] items-start justify-center lg:sticky lg:top-24 lg:min-h-[80vh]">
          <div className="w-full max-w-[680px]">{visual}</div>
        </div>

        {/* Text + panel column */}
        <div className="relative animate-fade-up">
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
      </div>

      {/* Legend pill */}
      {legend && (
        <div className="pointer-events-auto absolute bottom-4 left-4 z-10 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 font-mono text-[10px] text-muted-foreground shadow-paper backdrop-blur">
          {legend}
        </div>
      )}
    </div>
  );
};
