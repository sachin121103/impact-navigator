import { useEffect, useState, FormEvent } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPTS = [
  "process_payment",
  "User.save",
  "verify_token",
  "Session.send",
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export const ImpactInput = ({ value, onChange, onSubmit, loading }: Props) => {
  const [promptIdx, setPromptIdx] = useState(0);

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => setPromptIdx((i) => (i + 1) % PROMPTS.length), 2800);
    return () => clearInterval(id);
  }, [value]);

  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!loading && value.trim()) onSubmit();
  };

  return (
    <form
      onSubmit={handle}
      className="group relative flex items-center gap-2 rounded-lg border border-border bg-card pl-5 pr-2 py-2 shadow-paper transition-shadow focus-within:shadow-glow"
    >
      <span className="font-mono text-sm text-accent">›</span>
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          className="w-full bg-transparent py-2.5 font-mono text-[15px] text-foreground placeholder:text-transparent outline-none disabled:opacity-60"
          placeholder="function name…"
          aria-label="Function name to analyze"
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex items-center font-mono text-[15px] text-muted-foreground">
            <span key={promptIdx} className="animate-fade-up">
              {PROMPTS[promptIdx]}
            </span>
            <span className="ml-0.5 inline-block h-4 w-[2px] bg-muted-foreground animate-blink" />
          </div>
        )}
      </div>
      <Button type="submit" variant="radar" size="sm" disabled={loading || !value.trim()} className="shrink-0">
        {loading ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            Analyzing
          </>
        ) : (
          <>
            Run radar
            <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
};
