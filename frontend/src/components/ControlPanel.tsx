import { useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  Download,
  FileJson,
  FileText,
  GitFork,
  Loader2,
  PanelRightClose,
  Play,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/Skeleton";
import { useSimStore } from "@/store/simStore";
import { STATUS } from "@/utils/colors";
import { exportCSV, exportPDF } from "@/utils/report";
import {
  fetchPreset,
  fetchSuggestions,
  runSimulation,
  runWhatIf,
  uploadVenue,
} from "@/services/api";
import type { AxiosError } from "axios";
import type { CongestionStatus } from "@/types";

const CURVES = [
  { id: "light", label: "Light", hint: "flat arrival" },
  { id: "moderate", label: "Moderate", hint: "broad peak" },
  { id: "heavy", label: "Heavy", hint: "sharp surge" },
];

const RISK_META: Record<string, { label: string; color: string }> = {
  stampede_risk: { label: "Stampede Risk", color: "#EF4444" },
  flow_disruption: { label: "Flow Disruption", color: "#F97316" },
  minor_delay: { label: "Minor Delay", color: "#FBBF24" },
  safe: { label: "Safe", color: "#10B981" },
};

const PRIORITY_COLOR: Record<string, string> = {
  immediate: "#EF4444",
  soon: "#F97316",
  watch: "#FBBF24",
};

type Tab = "scenario" | "suggestions" | "whatif";

export const ControlPanel = () => {
  const s = useSimStore();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [whatIfRunning, setWhatIfRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("scenario");

  const loadPreset = async (id: string) => {
    try {
      const data = await fetchPreset(id);
      s.setVenue(data.layout, id);
      s.setParams({ ...data.default_params, step_duration_seconds: 60 });
      toast.success(`${data.layout.name} loaded`);
    } catch {
      toast.error("Could not load preset venue");
    }
  };

  const onUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const layout = JSON.parse(await file.text());
      const data = await uploadVenue(layout);
      s.setVenue(data.layout, data.venue_id);
      toast.success("Custom layout validated and loaded");
    } catch (err) {
      const error = err as AxiosError<{ detail?: string }>;
      const detail =
        error?.response?.data?.detail ||
        (err instanceof SyntaxError
          ? "File is not valid JSON"
          : "Layout validation failed");
      toast.error(typeof detail === "string" ? detail : "Layout schema is invalid");
    } finally {
      ev.target.value = "";
    }
  };

  const loadSuggestions = async (simId: string, step: number) => {
    s.setSuggestionsLoading(true);
    try {
      const data = await fetchSuggestions(simId, step);
      s.setSuggestions(data.suggestions ?? []);
    } catch {
      s.setSuggestions([]);
      toast.error("Could not generate AI recommendations");
    } finally {
      s.setSuggestionsLoading(false);
    }
  };

  const simulate = async () => {
    if (!s.venueId) return;
    s.setSimulating(true);
    try {
      const result = await runSimulation(s.venueId, s.params);
      s.setResult(result);
      setTab("suggestions");
      const firstCritical = result.steps.find((st) =>
        st.bottlenecks.some((b) => b.status === "critical"),
      );
      const target =
        firstCritical ?? result.steps.find((st) => st.bottlenecks.length);
      if (target) {
        s.setCurrentStep(target.step);
        loadSuggestions(result.simulation_id, target.step);
        toast.warning(
          `${target.bottlenecks.length} risk zone(s) detected from ${target.time_label}`,
        );
      } else {
        toast.success("No congestion detected in this scenario");
      }
    } catch (err) {
      const error = err as AxiosError<{ detail?: string }>;
      toast.error(
        error?.response?.data?.detail || "Simulation failed. Please retry.",
      );
    } finally {
      s.setSimulating(false);
    }
  };

  const simulateWhatIf = async () => {
    if (!s.venueId || !s.overrides.length) return;
    setWhatIfRunning(true);
    try {
      const result = await runWhatIf(s.venueId, s.params, s.overrides);
      s.setResult(result); // captures previousRun so the delta card renders
      const target =
        result.steps.find((st) =>
          st.bottlenecks.some((b) => b.status === "critical"),
        ) ?? result.steps.find((st) => st.bottlenecks.length);
      if (target) s.setCurrentStep(target.step);
      toast.success("What-if re-simulated — compare the delta below");
    } catch (err) {
      const error = err as AxiosError<{ detail?: string }>;
      toast.error(
        error?.response?.data?.detail || "What-if simulation failed.",
      );
    } finally {
      setWhatIfRunning(false);
    }
  };

  const step = s.result ? s.result.steps[s.currentStep] : null;
  const eligibleElements = s.venue
    ? s.venue.nodes.filter((n) => n.type !== "exit")
    : [];

  if (!s.panelOpen) {
    return (
      <button
        data-testid="open-panel-btn"
        onClick={s.togglePanel}
        className="absolute right-6 top-24 z-20 flex items-center gap-2 rounded-md border border-white/10 bg-[#0B1221]/80 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-300 backdrop-blur-xl duration-150 hover:border-sky-400/50"
      >
        <ScrollText className="h-4 w-4" /> Controls
      </button>
    );
  }

  return (
    <aside
      data-testid="control-panel"
      className="absolute bottom-0 right-0 top-[70px] z-20 flex w-[400px] max-w-[92vw] flex-col border-l border-white/10 bg-[#0B1221]/80 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="flex gap-1">
          {[
            { id: "scenario", label: "Scenario" },
            { id: "suggestions", label: "AI Reroutes" },
            { id: "whatif", label: "What-If" },
          ].map((t) => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id as Tab)}
              className={`rounded-md px-3 py-1.5 text-xs uppercase tracking-[0.14em] duration-150 ${
                tab === t.id
                  ? "bg-sky-400/15 text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          data-testid="close-panel-btn"
          onClick={s.togglePanel}
          className="text-slate-500 duration-150 hover:text-slate-200"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "scenario" ? (
          <div className="space-y-7">
            <section>
              <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Venue layout
              </p>
              <div className="space-y-2">
                {s.presets.length === 0
                  ? [0, 1, 2].map((i) => (
                      <Skeleton
                        key={i}
                        className="h-[86px] w-full"
                      />
                    ))
                  : s.presets.map((p) => (
                      <button
                        key={p.id}
                        data-testid={`preset-${p.id}`}
                        onClick={() => loadPreset(p.id)}
                        className={`w-full rounded-md border px-4 py-3 text-left duration-150 ${
                          s.venueId === p.id
                            ? "border-sky-400/50 bg-sky-400/10"
                            : "border-white/10 hover:border-white/30 hover:bg-white/5"
                        }`}
                      >
                        <p className="font-[Exo_2] text-sm font-semibold text-slate-100">
                          {p.name}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                          {p.description}
                        </p>
                        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                          {p.node_count} nodes · {p.edge_count} edges
                        </p>
                      </button>
                    ))}
                <button
                  data-testid="upload-layout-btn"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-white/15 px-4 py-3 text-xs text-slate-400 duration-150 hover:border-sky-400/50 hover:text-slate-200"
                >
                  <FileJson className="h-4 w-4" /> Upload custom layout (.json)
                </button>
                <input
                  ref={fileRef}
                  data-testid="layout-file-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={onUpload}
                  className="hidden"
                />
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Expected crowd
                </p>
                <p
                  data-testid="crowd-size-value"
                  className="font-mono text-sm font-semibold text-sky-300"
                >
                  {s.params.total_people.toLocaleString()}
                </p>
              </div>
              <Slider
                data-testid="crowd-size-slider"
                value={[s.params.total_people]}
                min={1000}
                max={100000}
                step={1000}
                onValueChange={([v]) => s.setParams({ total_people: v })}
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-600">
                <span>1K</span>
                <span>100K</span>
              </div>
            </section>

            <section>
              <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Arrival curve
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CURVES.map((c) => (
                  <button
                    key={c.id}
                    data-testid={`curve-${c.id}`}
                    onClick={() => s.setParams({ arrival_curve: c.id })}
                    className={`rounded-md border px-2 py-2.5 duration-150 ${
                      s.params.arrival_curve === c.id
                        ? "border-sky-400/50 bg-sky-400/10 text-sky-300"
                        : "border-white/10 text-slate-400 hover:border-white/30"
                    }`}
                  >
                    <span className="block text-xs font-semibold">{c.label}</span>
                    <span className="mt-0.5 block font-mono text-[9px] opacity-70">
                      {c.hint}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <button
                data-testid="advanced-toggle"
                onClick={() => setAdvanced(!advanced)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500 duration-150 hover:text-slate-300"
              >
                <ChevronRight
                  className={`h-3 w-3 duration-200 ${advanced ? "rotate-90" : ""}`}
                />
                Advanced
              </button>
              {advanced && (
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="text-xs text-slate-400">Event start time</span>
                    <input
                      data-testid="start-time-input"
                      type="time"
                      value={s.params.event_start_time}
                      onChange={(e) =>
                        s.setParams({ event_start_time: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-white/10 bg-[#040914] px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">
                      Simulation window (minutes):{" "}
                      <span className="font-mono text-slate-200">
                        {s.params.duration_steps}
                      </span>
                    </span>
                    <Slider
                      data-testid="duration-slider"
                      className="mt-3"
                      value={[s.params.duration_steps]}
                      min={15}
                      max={120}
                      step={5}
                      onValueChange={([v]) => s.setParams({ duration_steps: v })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-400">
                      Random seed (optional)
                    </span>
                    <input
                      data-testid="seed-input"
                      type="number"
                      placeholder="random each run"
                      value={s.params.seed ?? ""}
                      onChange={(e) =>
                        s.setParams({
                          seed: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-white/10 bg-[#040914] px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-sky-400/60"
                    />
                  </label>
                </div>
              )}
            </section>

            <button
              data-testid="run-simulation-btn"
              disabled={s.isSimulating || !s.venueId}
              onClick={simulate}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-sky-400/50 bg-sky-400/15 px-4 py-3.5 font-[Exo_2] text-sm font-bold uppercase tracking-[0.18em] text-sky-200 duration-150 hover:bg-sky-400/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s.isSimulating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Simulating…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Run simulation
                </>
              )}
            </button>

            {s.result && (
              <section data-testid="export-section">
                <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Export briefing
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    data-testid="export-pdf-btn"
                    onClick={() => s.result && exportPDF(s.result)}
                    className="flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2.5 text-xs text-slate-300 duration-150 hover:border-sky-400/50 hover:text-sky-200"
                  >
                    <FileText className="h-4 w-4" /> PDF report
                  </button>
                  <button
                    data-testid="export-csv-btn"
                    onClick={() => s.result && exportCSV(s.result)}
                    className="flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2.5 text-xs text-slate-300 duration-150 hover:border-sky-400/50 hover:text-sky-200"
                  >
                    <Download className="h-4 w-4" /> CSV timeline
                  </button>
                </div>
              </section>
            )}

            {s.previousRun && s.result && (
              <div
                data-testid="comparison-card"
                className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  vs previous run
                </p>
                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div>
                    <p className="text-slate-500">Peak load</p>
                    <p className="text-slate-200">
                      {Math.round(s.previousRun.peak * 100)}% →{" "}
                      <span className="text-sky-300">
                        {Math.round(s.result.peak_utilization * 100)}%
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Risk events</p>
                    <p className="text-slate-200">
                      {s.previousRun.events} →{" "}
                      <span className="text-sky-300">
                        {s.result.total_bottleneck_events}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : tab === "suggestions" ? (
          <div className="space-y-4">
            {!s.result ? (
              <p className="text-sm text-slate-400">
                Run a simulation to generate AI rerouting recommendations.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Step {s.currentStep} · {step?.time_label}
                  </p>
                  <button
                    data-testid="refresh-suggestions-btn"
                    onClick={() =>
                      s.result &&
                      loadSuggestions(s.result.simulation_id, s.currentStep)
                    }
                    className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-300 duration-150 hover:border-sky-400/50"
                  >
                    <Sparkles className="h-3 w-3" /> Generate
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    data-testid="export-pdf-btn-suggestions"
                    onClick={() => s.result && exportPDF(s.result)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[11px] text-slate-300 duration-150 hover:border-sky-400/50 hover:text-sky-200"
                  >
                    <FileText className="h-3.5 w-3.5" /> PDF report
                  </button>
                  <button
                    data-testid="export-csv-btn-suggestions"
                    onClick={() => s.result && exportCSV(s.result)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[11px] text-slate-300 duration-150 hover:border-sky-400/50 hover:text-sky-200"
                  >
                    <Download className="h-3.5 w-3.5" /> CSV timeline
                  </button>
                </div>

                {s.suggestionsLoading && (
                  <div className="space-y-3" data-testid="suggestions-loading">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Querying Hugging
                      Face model…
                    </div>
                    {[0, 1].map((i) => (
                      <Skeleton key={i} className="h-[120px] w-full" />
                    ))}
                  </div>
                )}

                {!s.suggestionsLoading && s.suggestions.length === 0 && (
                  <p data-testid="no-suggestions" className="text-sm text-slate-400">
                    {step?.bottlenecks?.length
                      ? "Press Generate to get recommendations for this time step."
                      : "No congestion detected at this time step."}
                  </p>
                )}

                {!s.suggestionsLoading &&
                  s.suggestions.map((sg, i) => {
                    const st =
                      STATUS[sg.bottleneck.status as CongestionStatus] ??
                      STATUS.clear;
                    return (
                      <button
                        key={`${sg.bottleneck.element_id}-${i}`}
                        data-testid={`suggestion-card-${i}`}
                        onClick={() =>
                          s.focusElement(
                            sg.bottleneck.element_id,
                            sg.bottleneck.alternate_path ?? null,
                          )
                        }
                        className="block w-full rounded-md border border-white/10 bg-white/[0.03] px-4 py-4 text-left duration-150 hover:border-sky-400/40 hover:bg-white/[0.06]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-[Exo_2] text-sm font-semibold text-slate-100">
                            {sg.bottleneck.location_name}
                          </p>
                          <span
                            className="flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                            style={{
                              color: st.color,
                              backgroundColor: `${st.color}26`,
                              border: `1px solid ${st.color}`,
                            }}
                          >
                            {st.icon} {st.label}
                          </span>
                        </div>

                        {(sg.ai_action ||
                          sg.ai_priority ||
                          sg.ai_risk) && (
                          <div
                            data-testid={`suggestion-ai-meta-${i}`}
                            className="mt-2 flex flex-wrap items-center gap-1.5"
                          >
                            {sg.ai_action && (
                              <span
                                data-testid={`ai-action-${i}`}
                                className="rounded-sm border border-sky-400/50 bg-sky-400/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-sky-200"
                              >
                                {sg.ai_action.replace(/_/g, " ")}
                              </span>
                            )}
                            {sg.ai_priority && (
                              <span
                                className="rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                                style={{
                                  color:
                                    PRIORITY_COLOR[sg.ai_priority] ?? "#94A3B8",
                                  backgroundColor: `${
                                    PRIORITY_COLOR[sg.ai_priority] ?? "#94A3B8"
                                  }22`,
                                }}
                              >
                                {sg.ai_priority}
                              </span>
                            )}
                            {sg.ai_risk && RISK_META[sg.ai_risk] && (
                              <span
                                data-testid={`ai-risk-${i}`}
                                className="flex items-center gap-1 rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                                style={{
                                  color: RISK_META[sg.ai_risk].color,
                                  backgroundColor: `${RISK_META[sg.ai_risk].color}22`,
                                  border: `1px solid ${RISK_META[sg.ai_risk].color}`,
                                }}
                              >
                                <ShieldAlert className="h-3 w-3" />
                                {sg.ai_risk_source === "ai" ? "AI" : "Rule"}:{" "}
                                {RISK_META[sg.ai_risk].label}
                              </span>
                            )}
                          </div>
                        )}

                        <p className="mt-2 text-xs leading-relaxed text-slate-300">
                          {sg.generated_text}
                        </p>
                        {sg.ai_impact && (
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] italic text-emerald-300/80">
                            <Zap className="h-3 w-3" /> {sg.ai_impact}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            {sg.source === "ai" ? (
                              <Cpu className="h-3 w-3 text-sky-400" />
                            ) : (
                              <ScrollText className="h-3 w-3" />
                            )}
                            {sg.source === "ai" ? "HF AI" : "Template"}
                          </span>
                          <span>{sg.bottleneck.current_density}% load</span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />~
                            {sg.bottleneck.expected_clearance_mins} min
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5" data-testid="whatif-tab">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                What-if planning
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Close a gate or throttle a route, then re-simulate. The routing
                model re-solves around the change so you can see the impact.
              </p>
            </div>

            {!s.venue ? (
              <p className="text-sm text-slate-400">Load a venue first.</p>
            ) : (
              <>
                <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
                  {eligibleElements.map((n) => {
                    const ov = s.overrides.find((o) => o.element_id === n.id);
                    return (
                      <div
                        key={n.id}
                        data-testid={`whatif-row-${n.id}`}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 duration-150 ${
                          ov
                            ? "border-sky-400/50 bg-sky-400/10"
                            : "border-white/10"
                        }`}
                      >
                        <span className="truncate text-xs text-slate-200">
                          {n.name}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            data-testid={`whatif-close-${n.id}`}
                            onClick={() => s.toggleOverride(n.id, "close", 0)}
                            className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase duration-150 ${
                              ov?.override_type === "close"
                                ? "border-red-400/60 bg-red-400/15 text-red-300"
                                : "border-white/10 text-slate-400 hover:border-white/30"
                            }`}
                          >
                            Close
                          </button>
                          <button
                            data-testid={`whatif-reduce-${n.id}`}
                            onClick={() =>
                              s.toggleOverride(n.id, "reduce_capacity", 0.5)
                            }
                            className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase duration-150 ${
                              ov?.override_type === "reduce_capacity"
                                ? "border-orange-400/60 bg-orange-400/15 text-orange-300"
                                : "border-white/10 text-slate-400 hover:border-white/30"
                            }`}
                          >
                            −50%
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    data-testid="run-whatif-btn"
                    disabled={whatIfRunning || !s.overrides.length}
                    onClick={simulateWhatIf}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-sky-400/50 bg-sky-400/15 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-sky-200 duration-150 hover:bg-sky-400/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {whatIfRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Re-simulating…
                      </>
                    ) : (
                      <>
                        <GitFork className="h-4 w-4" /> Re-simulate ({s.overrides.length})
                      </>
                    )}
                  </button>
                  <button
                    data-testid="clear-whatif-btn"
                    disabled={!s.overrides.length}
                    onClick={s.clearOverrides}
                    className="grid place-items-center rounded-md border border-white/10 px-3 text-slate-400 duration-150 hover:border-white/30 disabled:opacity-40"
                    title="Clear changes"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {s.previousRun && s.result && (
                  <div
                    data-testid="whatif-delta"
                    className="rounded-md border border-white/10 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Impact vs previous run
                    </p>
                    <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                      <div>
                        <p className="text-slate-500">Peak load</p>
                        <p className="text-slate-200">
                          {Math.round(s.previousRun.peak * 100)}% →{" "}
                          <span className="text-sky-300">
                            {Math.round(s.result.peak_utilization * 100)}%
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Risk events</p>
                        <p className="text-slate-200">
                          {s.previousRun.events} →{" "}
                          <span
                            className={
                              s.result.total_bottleneck_events <=
                              s.previousRun.events
                                ? "text-emerald-300"
                                : "text-red-300"
                            }
                          >
                            {s.result.total_bottleneck_events}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
