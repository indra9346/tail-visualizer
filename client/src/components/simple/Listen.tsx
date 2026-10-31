import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/**
 * Reads the screen's instruction aloud, for owners who read little. Uses the phone's own voice (no download, works
 * offline on most phones); hidden where the browser has no voice.
 */
export function ListenButton({ text, className }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);
  // A new screen stops the old instruction.
  useEffect(() => {
    if (canSpeak()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [text]);
  if (!canSpeak()) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const say = new SpeechSynthesisUtterance(text);
    say.lang = "en-IN";
    say.rate = 0.92;
    say.onend = () => setSpeaking(false);
    say.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(say);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={cn("flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 text-[15px] font-bold transition-colors", speaking ? "bg-stone-900 text-white" : "bg-sage-200 text-ink hover:bg-sage-300", className)}
    >
      <Icon name={speaking ? "stop" : "volume"} className="h-5 w-5" />
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}
