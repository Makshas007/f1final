import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useSimStore } from "../store/simStore";

const SPEEDS = [1, 2, 4];

export const TimeScrubber = () => {
  const result = useSimStore((s) => s.result);
  const currentStep = useSimStore((s) => s.currentStep);
  const isPlaying = useSimStore((s) => s.isPlaying);
  const speed = useSimStore((s) => s.playbackSpeed);
  const setCurrentStep = useSimStore((s) => s.setCurrentStep);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!isPlaying || !result) return;
    timer.current = setInterval(() => {
      const s = useSimStore.getState();
      if (s.currentStep >= s.result.total_steps - 1) {
        s.setPlaying(false);
        return;
      }
      s.setCurrentStep(s.currentStep + 1);
    }, 420 / speed);
    return () => clearInterval(timer.current);
  }, [isPlaying, speed, result, setPlaying, setCurrentStep]);

  if (!result) return null;
  const step = result.steps[currentStep];
  const total = result.total_steps;
  const severity = (s) =>
    s.nodes.some((n) => n.status === "critical") || s.edges.some((e) => e.status === "critical")
      ? "#EF4444"
      : s.nodes.some((n) => n.status === "warning") || s.edges.some((e) => e.status === "warning")
      ? "#F97316"
      : s.bottlenecks.length
      ? "#FBBF24"
      : "#10B981";

  return (
    <div
      data-testid="time-scrubber"
      className="pointer-events-auto absolute bottom-6 left-1/2 z-20 w-[min(680px,60vw)] -translate-x-1/2 rounded-md border border-white/10 bg-[#0B1221]/80 px-6 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-4">
        <button
          data-testid="play-toggle-btn"
          onClick={togglePlay}
          className="grid h-10 w-10 place-items-center rounded-md border border-sky-400/40 bg-sky-400/10 text-sky-300 duration-150 hover:border-sky-400 hover:bg-sky-400/20 active:scale-95"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          data-testid="step-back-btn"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-300 duration-150 hover:border-white/30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          data-testid="step-fwd-btn"
          onClick={() => setCurrentStep(Math.min(total - 1, currentStep + 1))}
          className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-300 duration-150 hover:border-white/30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex-1">
          <div className="mb-1 flex h-3 items-end gap-[2px]">
            {result.steps.map((s, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm duration-150"
                style={{
                  height: i === currentStep ? "12px" : "6px",
                  backgroundColor: severity(s),
                  opacity: i === currentStep ? 1 : 0.45,
                }}
              />
            ))}
          </div>
          <input
            data-testid="time-slider"
            type="range"
            min={0}
            max={total - 1}
            value={currentStep}
            onChange={(e) => setCurrentStep(Number(e.target.value))}
            className="scrub-slider w-full"
          />
        </div>

        <div className="text-right">
          <p data-testid="time-label" className="font-mono text-lg font-bold text-slate-50">
            {step.time_label}
          </p>
          <p className="font-mono text-[10px] text-slate-500">
            T+{currentStep} / {total - 1}
          </p>
        </div>

        <div className="flex gap-1">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              data-testid={`speed-${sp}x-btn`}
              onClick={() => setSpeed(sp)}
              className={`rounded-md border px-2 py-1 font-mono text-[11px] duration-150 ${
                speed === sp
                  ? "border-sky-400/60 bg-sky-400/15 text-sky-300"
                  : "border-white/10 text-slate-400 hover:border-white/30"
              }`}
            >
              {sp}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
