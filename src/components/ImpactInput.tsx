import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPTS = [
  "Rename process_payment to charge_card",
  "Change User.save() signature to accept commit=True",
  "Delete the legacy auth.verify_token function",
  "Modify Session.send() to be async",
];

export const ImpactInput = () => {
  const [value, setValue] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => setPromptIdx((i) => (i + 1) % PROMPTS.length), 2800);
    return () => clearInterval(id);
  }, [value]);

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="group relative flex items-center gap-2 rounded-lg border border-border bg-card pl-5 pr-2 py-2 shadow-paper transition-shadow focus-within:shadow-glow"
    >
      <span className="font-mono text-sm text-accent">›</span>
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-transparent py-2.5 font-mono text-[15px] text-foreground placeholder:text-transparent outline-none"
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
      <Button type="submit" variant="radar" size="sm" className="shrink-0">
        Run radar
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </form>
  );
};
