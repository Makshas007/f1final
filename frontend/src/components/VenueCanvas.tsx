import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
} from "d3-zoom";
import { useSimStore } from "@/store/simStore";
import {
  computeTransform,
  hitTest,
  project,
  renderFrame,
  type Transform,
  type ZoomState,
} from "@/utils/canvasRenderer";
import { NODE_LABELS, STATUS } from "@/utils/colors";
import type { CongestionStatus, NodeType } from "@/types";

interface Tooltip {
  x: number;
  y: number;
  name: string;
  type: string;
  occupancy: number | null;
  capacity: number;
  util: number | null;
  status: CongestionStatus | null;
}

export const VenueCanvas = () => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<string | null>(null);
  const transformRef = useRef<Transform | null>(null);
  const zoomRef = useRef<ZoomState>({ k: 1, x: 0, y: 0 });
  const zoomBehaviorRef = useRef<ZoomBehavior<
    HTMLCanvasElement,
    unknown
  > | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const venue = useSimStore((s) => s.venue);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let raf = 0;
    let size = { w: 0, h: 0 };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      size = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.4, 4])
      .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        const t = event.transform;
        zoomRef.current = { k: t.k, x: t.x, y: t.y };
      });
    zoomBehaviorRef.current = zoomBehavior;
    select(canvas)
      .call(zoomBehavior)
      .on("dblclick.zoom", null);

    const loop = (tick: number) => {
      if (!document.hidden) {
        const s = useSimStore.getState();
        if (s.venue && size.w > 0) {
          const t = computeTransform(s.venue, size.w, size.h, {
            top: 110,
            bottom: s.result ? 150 : 90,
            left: 60,
            right: s.panelOpen ? 440 : 80,
          });
          transformRef.current = t;
          renderFrame(ctx, {
            venue: s.venue,
            step: s.result ? s.result.steps[s.currentStep] : null,
            width: size.w,
            height: size.h,
            transform: t,
            zoom: zoomRef.current,
            hoverId: hoverRef.current,
            focusedElementId: s.focusedElementId,
            focusedPath: s.focusedPath,
            overrideIds: new Set(s.overrides.map((o) => o.element_id)),
            tick,
          });
        } else if (size.w > 0) {
          ctx.clearRect(0, 0, size.w, size.h);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const onMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const s = useSimStore.getState();
    const t = transformRef.current;
    if (!s.venue || !t || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const z = zoomRef.current;
    const node = hitTest(s.venue, t, mx, my, z);
    hoverRef.current = node ? node.id : null;
    if (!node) {
      setTooltip(null);
      return;
    }
    const step = s.result ? s.result.steps[s.currentStep] : null;
    const st = step ? step.nodes.find((n) => n.id === node.id) : null;
    const p = project(node, t);
    setTooltip({
      x: p.x * z.k + z.x,
      y: p.y * z.k + z.y,
      name: node.name,
      type: NODE_LABELS[node.type as NodeType] ?? node.type,
      occupancy: st ? st.occupancy : null,
      capacity: node.capacity,
      util: st ? Math.round(st.utilization * 100) : null,
      status: st ? st.status : null,
    });
  };

  const applyZoom = (factor: number | "reset") => {
    const canvas = canvasRef.current;
    const zb = zoomBehaviorRef.current;
    if (!canvas || !zb) return;
    const selection = select(canvas);
    if (factor === "reset") {
      zb.transform(selection, zoomIdentity);
    } else {
      zb.scaleBy(selection, factor);
    }
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 z-0" data-testid="venue-canvas-wrap">
      <canvas
        ref={canvasRef}
        data-testid="venue-canvas"
        onMouseMove={onMove}
        onMouseLeave={() => {
          hoverRef.current = null;
          setTooltip(null);
        }}
        className="block cursor-crosshair"
      />

      {venue && (
        <div className="absolute left-6 top-24 z-20 flex flex-col gap-1">
          <button
            data-testid="zoom-in-btn"
            onClick={() => applyZoom(1.4)}
            title="Zoom in"
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-[#0B1221]/80 text-slate-300 backdrop-blur-xl duration-150 hover:border-sky-400/50 hover:text-sky-300"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            data-testid="zoom-out-btn"
            onClick={() => applyZoom(0.7)}
            title="Zoom out"
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-[#0B1221]/80 text-slate-300 backdrop-blur-xl duration-150 hover:border-sky-400/50 hover:text-sky-300"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            data-testid="zoom-reset-btn"
            onClick={() => applyZoom("reset")}
            title="Reset view"
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-[#0B1221]/80 text-slate-300 backdrop-blur-xl duration-150 hover:border-sky-400/50 hover:text-sky-300"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {!venue && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-slate-500">
            Loading venue graph…
          </p>
        </div>
      )}

      {tooltip && (
        <div
          data-testid="node-tooltip"
          className="pointer-events-none absolute z-30 min-w-[210px] rounded-md border border-white/10 bg-[#0B1221]/90 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          style={{
            left: Math.min(
              tooltip.x + 20,
              (wrapRef.current?.clientWidth ?? 800) - 240,
            ),
            top: Math.max(tooltip.y - 40, 12),
          }}
        >
          <p className="font-[Exo_2] text-sm font-semibold text-slate-50">
            {tooltip.name}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {tooltip.type}
          </p>
          {tooltip.util !== null && tooltip.occupancy !== null && tooltip.status ? (
            <div className="mt-2 font-mono text-xs text-slate-300">
              <span className="text-slate-100">
                {tooltip.occupancy.toLocaleString()}
              </span>
              <span className="text-slate-500">
                {" "}
                / {tooltip.capacity.toLocaleString()}
              </span>
              <span
                className="ml-2 font-semibold"
                style={{ color: STATUS[tooltip.status].color }}
              >
                {tooltip.util}% {STATUS[tooltip.status].icon}{" "}
                {STATUS[tooltip.status].label}
              </span>
            </div>
          ) : (
            <p className="mt-2 font-mono text-xs text-slate-500">
              cap {tooltip.capacity.toLocaleString()} · run simulation for load
            </p>
          )}
        </div>
      )}
    </div>
  );
};
