import { useEffect } from "react";
import { useSimStore } from "@/store/simStore";

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
};

/**
 * Control-room keyboard shortcuts:
 *  Space -> play / pause,  ArrowLeft/Right -> step,  Escape -> close panel.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const s = useSimStore.getState();

      switch (event.key) {
        case " ":
          if (s.result) {
            event.preventDefault();
            s.togglePlay();
          }
          break;
        case "ArrowLeft":
          if (s.result) {
            event.preventDefault();
            s.setCurrentStep(Math.max(0, s.currentStep - 1));
          }
          break;
        case "ArrowRight":
          if (s.result) {
            event.preventDefault();
            s.setCurrentStep(
              Math.min(s.result.total_steps - 1, s.currentStep + 1),
            );
          }
          break;
        case "Escape":
          if (s.panelOpen) s.togglePanel();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
