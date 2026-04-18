import { SubPageShell } from "@/components/SubPageShell";
import { Folder, FileCode } from "lucide-react";

const CodeGraph = () => {
  return (
    <SubPageShell
      eyebrow="01 · code graph"
      title="Code Graph."
      tagline="Where does it live?"
      description="Visualise your repository as a navigable graph of folders, files and the connections between them. Zoom from the whole forest down to a single leaf."
    >
      <div className="grid gap-4 rounded-lg border border-border bg-card p-8 shadow-paper md:grid-cols-3">
        <Placeholder icon={<Folder className="h-5 w-5" />} label="src/" sub="42 files" />
        <Placeholder icon={<Folder className="h-5 w-5" />} label="lib/" sub="18 files" />
        <Placeholder icon={<Folder className="h-5 w-5" />} label="tests/" sub="27 files" />
        <Placeholder icon={<FileCode className="h-5 w-5" />} label="index.ts" sub="entry" />
        <Placeholder icon={<FileCode className="h-5 w-5" />} label="api.ts" sub="34 edges" />
        <Placeholder icon={<FileCode className="h-5 w-5" />} label="utils.ts" sub="71 edges" />
      </div>
      <p className="mt-6 font-mono text-xs text-muted-foreground">
        Graph rendering coming next.
      </p>
    </SubPageShell>
  );
};

const Placeholder = ({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) => (
  <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/60 p-4">
    <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-accent">{icon}</div>
    <div>
      <div className="font-mono text-sm">{label}</div>
      <div className="font-mono text-xs text-muted-foreground">{sub}</div>
    </div>
  </div>
);

export default CodeGraph;
