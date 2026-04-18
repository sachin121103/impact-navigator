import { SubPageShell } from "@/components/SubPageShell";
import { ImpactInput } from "@/components/ImpactInput";
import { RadarVisual } from "@/components/RadarVisual";

const ImpactRadar = () => {
  return (
    <SubPageShell
      eyebrow="03 · impact radar"
      title="Impact Radar."
      tagline="What will I break?"
      description="Describe a change in plain English. Impact Radar maps every downstream dependency, ranks them by risk, and tells you exactly which files will break."
    >
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <ImpactInput />
          <div className="mt-3 flex items-center gap-4 px-1 text-xs text-muted-foreground">
            <span className="font-mono">repo:</span>
            <code className="rounded bg-secondary px-2 py-0.5 font-mono text-foreground">
              github.com/psf/requests
            </code>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <Stat value="306" label="symbols indexed" />
            <Stat value="348" label="call edges" />
            <Stat value="89ms" label="avg radar time" />
          </div>
        </div>

        <div className="relative">
          <RadarVisual />
          <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-4 py-2.5 font-mono text-xs shadow-paper">
            <span className="text-risk-high">●</span> 3 will break ·{" "}
            <span className="text-risk-med">●</span> 12 review ·{" "}
            <span className="text-risk-low">●</span> 32 safe
          </div>
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

export default ImpactRadar;
