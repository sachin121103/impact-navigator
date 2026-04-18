import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPTS = [
  "process_payment",
  "User.save",
  "verify_token",
  "Session.send",
];

interface Props {
  onRunRadar?: (prompt: string) => void;
  isLoading?: boolean;
}

export const ImpactInput = ({ onRunRadar, isLoading = false }: Props) => {
  const [value, setValue] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => setPromptIdx((i) => (i + 1) % PROMPTS.length), 2800);
    return () => clearInterval(id);
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim() || PROMPTS[promptIdx];
    if (!isLoading && onRunRadar) onRunRadar(prompt);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="group relative flex items-center gap-2 rounded-lg border border-border bg-card pl-5 pr-2 py-2 shadow-paper transition-shadow focus-within:shadow-glow"
    >
      <span className="font-mono text-sm text-accent">›</span>
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isLoading}
          className="w-full bg-transparent py-2.5 font-mono text-[15px] text-foreground placeholder:text-transparent outline-none disabled:opacity-60"
          placeholder="describe a change…"
          aria-label="Describe the change you want to make"
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
      <Button type="submit" variant="radar" size="sm" className="shrink-0" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            Running…
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
