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
      visual={
        <div className="grid h-full w-full place-items-center">
          <div className="w-[min(82vmin,780px)]">
            <RadarVisual />
          </div>
        </div>
      }
      legend={
        <span className="flex items-center gap-3">
          <span className="text-risk-high">●</span> 3 will break
          <span className="text-border">·</span>
          <span className="text-risk-med">●</span> 12 review
          <span className="text-border">·</span>
          <span className="text-risk-low">●</span> 32 safe
        </span>
      }
      panel={
        <div>
          <ImpactInput />
          <div className="mt-3 flex items-center gap-3 px-1 text-xs text-muted-foreground">
            <span className="font-mono">repo:</span>
            <code className="rounded bg-secondary px-2 py-0.5 font-mono text-foreground">
              github.com/psf/requests
            </code>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Stat value="306" label="symbols" />
            <Stat value="348" label="edges" />
            <Stat value="89ms" label="avg" />
          </div>
        </div>
      }
    />
  );
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="font-display text-xl font-semibold tracking-tight text-foreground">
      {value}
    </span>
    <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
  </div>
);

export default ImpactRadar;
