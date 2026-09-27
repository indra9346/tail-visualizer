import { useId } from "react";
import { cn } from "@/lib/cn";

/** Must match MAX_REQUIREMENTS_CHARS on the server (server/lib/validation.ts); the server is the authority. */
export const MAX_REQUIREMENTS_CHARS = 1500;

const SUGGESTIONS = [
  "Keep the existing toilet, sink and shower unchanged.",
  "Keep the same room layout, doors, windows and lighting.",
  "Use a light-coloured wall tile and a darker floor tile.",
  "Give it a premium, classic hotel-style look.",
  "Use a thin, neat grout line that matches the tile.",
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Free-text design instructions for the AI. Optional: with no text the
 * server applies sensible defaults. The text is sent to the server, which
 * sanitizes it and treats it strictly as preferences (never as commands).
 */
export function RequirementsInput({ value, onChange, disabled }: Props) {
  const id = useId();
  const remaining = MAX_REQUIREMENTS_CHARS - value.length;

  function addSuggestion(text: string) {
    if (value.includes(text)) return;
    const next = value.trim().length === 0 ? text : `${value.trim()} ${text}`;
    onChange(next.slice(0, MAX_REQUIREMENTS_CHARS));
  }

  return (
    <div>
      <label htmlFor={id} className="font-display text-xl text-stone-900">
        Describe Your Requirements <span className="text-sm font-normal text-stone-400">(optional)</span>
      </label>
      <p className="mt-1 text-sm text-stone-500">
        Tell the AI exactly how to apply the tile: which surfaces, the style and colours you prefer, and what must stay unchanged.
      </p>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        maxLength={MAX_REQUIREMENTS_CHARS}
        rows={5}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe exactly how you want the tiles applied. Mention floor/walls, preferred coverage, style, colours, what must remain unchanged, and any design preferences. Example: Use the selected tile on the floor and the matching wall area. Keep the existing toilet, sink, shower and lighting unchanged. Make it look realistic for showing to a house owner."
        className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 disabled:bg-stone-50"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => addSuggestion(s)}
              className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600 transition hover:border-stone-400 hover:bg-white disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
        <p className={cn("text-xs", remaining < 100 ? "text-red-700" : "text-stone-400")} aria-live="polite">
          {remaining} characters left
        </p>
      </div>
    </div>
  );
}
