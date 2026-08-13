import {
  Activity,
  AlertTriangle,
  Radar,
  TimerReset,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useSimStore } from "@/store/simStore";

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: string;
  testid: string;
}

const Kpi = ({ icon: Icon, label, value, tone = "text-slate-100", testid }: KpiProps) => (
  <div
    className="flex items-center gap-3 border-l border-white/10 pl-5"
    data-testid={testid}
  >
    <Icon className="h-4 w-4 text-sky-400/80" strokeWidth={1.8} />
    <div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className={`font-mono text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  </div>
);

export const TacticalHeader = () => {
  const result = useSimStore((s) => s.result);
  const currentStep = useSimStore((s) => s.currentStep);
  const step = result ? result.steps[currentStep] : null;
  const peak = result ? Math.round(result.peak_utilization * 100) : null;
  const criticalNow = step
    ? step.nodes.filter((n) => n.status === "critical").length +
      step.edges.filter((e) => e.status === "critical").length
    : 0;

  const sparkline = (() => {
    if (!result || result.steps.length < 2) return null;
    const w = 132;
    const h = 30;
    const values = result.steps.map((s) => s.people_inside);
    const maxVal = Math.max(...values, 1);
    const n = values.length;
    const points = values
      .map((v, i) => {
        const x = (i / (n - 1)) * w;
        const y = h - (v / maxVal) * (h - 3) - 1.5;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const ratio = values[currentStep] / maxVal;
    const stroke =
      ratio > 0.8 ? "#EF4444" : ratio > 0.5 ? "#FBBF24" : "#10B981";
    const cx = (currentStep / (n - 1)) * w;
    return (
      <div
        className="flex items-center gap-3 border-l border-white/10 pl-5"
        data-testid="crowd-sparkline"
      >
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
            Crowd over time
          </p>
          <svg width={w} height={h} className="mt-1 overflow-visible">
            <polyline
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <line
              x1={cx}
              y1={0}
              x2={cx}
              y2={h}
              stroke="#38BDF8"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle cx={cx} cy={h - (values[currentStep] / maxVal) * (h - 3) - 1.5} r={2.4} fill="#38BDF8" />
          </svg>
        </div>
      </div>
    );
  })();

  return (
    <header
      data-testid="tactical-header"
      className="absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center gap-y-3 border-b border-white/10 bg-[#0B1221]/75 px-6 py-3 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 pr-8">
        <span className="grid h-9 w-9 place-items-center rounded-md border border-sky-400/40 bg-sky-400/10">
          <Radar className="h-5 w-5 text-sky-400" strokeWidth={2} />
        </span>
        <div>
          <h1 className="font-[Exo_2] text-base font-bold uppercase tracking-[0.16em] text-slate-50">
            Crowd Flow Optimiser
          </h1>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
            {result ? result.venue_name : "Predictive crowd safety console"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Kpi
          testid="kpi-inside"
          icon={Users}
          label="People inside"
          value={step ? step.people_inside.toLocaleString() : "\u2014"}
        />
        <Kpi
          testid="kpi-peak"
          icon={Activity}
          label="Peak load"
          value={peak !== null ? `${peak}%` : "\u2014"}
          tone={
            peak !== null && peak > 90
              ? "text-red-400"
              : peak !== null && peak > 75
                ? "text-orange-400"
                : "text-emerald-400"
          }
        />
        <Kpi
          testid="kpi-critical-now"
          icon={AlertTriangle}
          label="Critical now"
          value={result ? String(criticalNow) : "\u2014"}
          tone={criticalNow > 0 ? "text-red-400" : "text-emerald-400"}
        />
        <Kpi
          testid="kpi-clearance"
          icon={TimerReset}
          label="Clearance"
          value={
            result
              ? result.clearance_step !== null &&
                result.clearance_step !== undefined
                ? `${result.clearance_step} min`
                : "> window"
              : "\u2014"
          }
        />
        {sparkline}
      </div>
    </header>
  );
};
