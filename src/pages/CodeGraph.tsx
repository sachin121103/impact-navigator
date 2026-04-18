import { SubPageShell } from "@/components/SubPageShell";
import { GraphVisual } from "@/components/GraphVisual";

const CodeGraph = () => {
  return (
    <SubPageShell
      eyebrow="01 · code graph"
      title="Code Graph."
      tagline="Where does it live?"
      description="Visualise your repository as a navigable graph of folders, files and the connections between them. Zoom from the whole forest down to a single leaf."
    >
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative">
          <GraphVisual />
          <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-4 py-2.5 font-mono text-xs shadow-paper">
            <span className="text-accent">●</span> 4 folders ·{" "}
            <span className="text-foreground/70">●</span> 10 files ·{" "}
            <span className="text-accent">→</span> 3 cross-deps
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <Stat value="87" label="folders" />
            <Stat value="1,204" label="files" />
            <Stat value="3,418" label="edges" />
          </div>
          <p className="mt-8 max-w-md text-base leading-relaxed text-muted-foreground">
            Every directory becomes a cluster. Every import becomes a thread.
            Hover to see what depends on what — at a glance, then in detail.
          </p>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Interactive graph coming next.
          </p>
        </div>
      </div>
    </SubPageShell>
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

export default CodeGraph;
