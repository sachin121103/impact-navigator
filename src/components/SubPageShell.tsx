import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SubPageShell = ({
  eyebrow,
  title,
  tagline,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  description: string;
  children?: React.ReactNode;
}) => {
  return (
    <div className="min-h-screen texture-paper">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/30">
            <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Meridian<span className="text-accent">.</span>
          </span>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-10 pb-20 animate-fade-up">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
          · {eyebrow}
        </p>
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          {title}
        </h1>
        <p className="mt-4 font-display text-xl italic text-muted-foreground md:text-2xl">
          {tagline}
        </p>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-12">{children}</div>
      </section>
    </div>
  );
};
