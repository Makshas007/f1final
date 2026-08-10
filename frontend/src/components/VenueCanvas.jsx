import { useEffect, useRef, useState } from "react";
import { useSimStore } from "../store/simStore";
import { computeTransform, hitTest, project, renderFrame } from "../utils/canvasRenderer";
import { NODE_LABELS, STATUS } from "../utils/colors";

export const VenueCanvas = () => {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const hoverRef = useRef(null);
  const transformRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const venue = useSimStore((s) => s.venue);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: false, alpha: false });
    let raf;
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

    const loop = (tick) => {
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
          hoverId: hoverRef.current,
          focusedElementId: s.focusedElementId,
          focusedPath: s.focusedPath,
          tick,
        });
      } else if (size.w > 0) {
        ctx.clearRect(0, 0, size.w, size.h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const onMove = (ev) => {
    const s = useSimStore.getState();
    const t = transformRef.current;
    if (!s.venue || !t) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const node = hitTest(s.venue, t, mx, my);
    hoverRef.current = node ? node.id : null;
    if (!node) {
      setTooltip(null);
      return;
    }
    const step = s.result ? s.result.steps[s.currentStep] : null;
    const st = step ? step.nodes.find((n) => n.id === node.id) : null;
    const p = project(node, t);
    setTooltip({
      x: p.x,
      y: p.y,
      name: node.name,
      type: NODE_LABELS[node.type] || node.type,
      occupancy: st ? st.occupancy : null,
      capacity: node.capacity,
      util: st ? Math.round(st.utilization * 100) : null,
      status: st ? st.status : null,
    });
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
            left: Math.min(tooltip.x + 20, (wrapRef.current?.clientWidth || 800) - 240),
            top: Math.max(tooltip.y - 40, 12),
          }}
        >
          <p className="font-[Exo_2] text-sm font-semibold text-slate-50">{tooltip.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {tooltip.type}
          </p>
          {tooltip.util !== null ? (
            <div className="mt-2 font-mono text-xs text-slate-300">
              <span className="text-slate-100">
                {tooltip.occupancy.toLocaleString()}
              </span>
              <span className="text-slate-500"> / {tooltip.capacity.toLocaleString()}</span>
              <span
                className="ml-2 font-semibold"
                style={{ color: STATUS[tooltip.status]?.color }}
              >
                {tooltip.util}% {STATUS[tooltip.status]?.icon} {STATUS[tooltip.status]?.label}
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
