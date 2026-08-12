import { statusColor } from "./colors";
import type { StepResult, VenueLayout, VenueNode } from "@/types";

export interface Transform {
  scale: number;
  offX: number;
  offY: number;
}

export interface ZoomState {
  k: number;
  x: number;
  y: number;
}

export interface Insets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface RenderOptions {
  venue: VenueLayout;
  step: StepResult | null;
  width: number;
  height: number;
  transform: Transform;
  zoom: ZoomState;
  hoverId: string | null;
  focusedElementId: string | null;
  focusedPath: string[] | null;
  tick: number;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export function computeTransform(
  venue: VenueLayout,
  width: number,
  height: number,
  insets: Insets = {},
): Transform {
  const { top = 110, right = 40, bottom = 130, left = 40 } = insets;
  const xs = venue.nodes.map((n) => n.x);
  const ys = venue.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const usableW = Math.max(width - left - right, 200);
  const usableH = Math.max(height - top - bottom, 200);
  const scale = Math.min(
    usableW / Math.max(maxX - minX, 1),
    usableH / Math.max(maxY - minY, 1),
  );
  const offX = left + (usableW - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = top + (usableH - (maxY - minY) * scale) / 2 - minY * scale;
  return { scale, offX, offY };
}

export const project = (
  node: { x: number; y: number },
  t: Transform,
): { x: number; y: number } => ({
  x: node.x * t.scale + t.offX,
  y: node.y * t.scale + t.offY,
});

const DASH: Record<string, number[]> = {
  clear: [],
  moderate: [14, 8],
  warning: [3, 7],
  critical: [],
};

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(56,189,248,0.05)";
  ctx.lineWidth = 1;
  const gap = 56;
  for (let x = 0; x < w; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function nodeShape(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  type: string,
  r: number,
): void {
  ctx.beginPath();
  switch (type) {
    case "exit":
      ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      break;
    case "gate":
      ctx.moveTo(p.x, p.y - r * 1.25);
      ctx.lineTo(p.x + r * 1.25, p.y);
      ctx.lineTo(p.x, p.y + r * 1.25);
      ctx.lineTo(p.x - r * 1.25, p.y);
      ctx.closePath();
      break;
    case "concession":
    case "restroom":
      ctx.moveTo(p.x, p.y - r * 1.2);
      ctx.lineTo(p.x + r * 1.1, p.y + r * 0.9);
      ctx.lineTo(p.x - r * 1.1, p.y + r * 0.9);
      ctx.closePath();
      break;
    case "seating":
    case "platform":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = p.x + r * 1.15 * Math.cos(a);
        const y = p.y + r * 1.15 * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case "entry":
      ctx.moveTo(p.x - r, p.y - r);
      ctx.lineTo(p.x + r * 0.4, p.y - r);
      ctx.lineTo(p.x + r * 1.2, p.y);
      ctx.lineTo(p.x + r * 0.4, p.y + r);
      ctx.lineTo(p.x - r, p.y + r);
      ctx.closePath();
      break;
    default:
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
}

function crosshatch(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  for (let o = -r; o <= r; o += 5) {
    ctx.beginPath();
    ctx.moveTo(p.x + o, p.y - r);
    ctx.lineTo(p.x + o + r, p.y + r);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  opts: RenderOptions,
): void {
  const {
    venue,
    step,
    width,
    height,
    transform: t,
    zoom,
    hoverId,
    focusedElementId,
    focusedPath,
    tick,
  } = opts;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#040914";
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  // Everything below is drawn in venue space, transformed by the pan/zoom state.
  ctx.save();
  ctx.translate(zoom.x, zoom.y);
  ctx.scale(zoom.k, zoom.k);

  const nodeById: Record<string, VenueNode> = {};
  venue.nodes.forEach((n) => {
    nodeById[n.id] = n;
  });
  const nodeState: Record<string, StepResult["nodes"][number]> = {};
  const edgeState: Record<string, StepResult["edges"][number]> = {};
  if (step) {
    step.nodes.forEach((s) => {
      nodeState[s.id] = s;
    });
    step.edges.forEach((s) => {
      edgeState[s.id] = s;
    });
  }
  const pulse = 0.55 + 0.45 * Math.sin(tick / 320);

  // edges
  venue.edges.forEach((e) => {
    const a = nodeById[e.source];
    const b = nodeById[e.target];
    if (!a || !b) return;
    const st = edgeState[e.id];
    const status = st ? st.status : "clear";
    const util = st ? st.utilization : 0;
    const p1 = project(a, t);
    const p2 = project(b, t);
    const color = statusColor(status);
    ctx.save();
    ctx.setLineDash(DASH[status] ?? []);
    ctx.lineCap = "round";
    ctx.strokeStyle = color;
    ctx.globalAlpha = status === "clear" ? 0.28 : 0.55 + util * 0.45;
    ctx.lineWidth = 2 + util * 7;
    if (status === "critical") {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * pulse;
      ctx.lineWidth = 5 + util * 8;
    }
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  });

  // focused alternate path
  if (focusedPath && focusedPath.length > 1) {
    ctx.save();
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 3.5;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -(tick / 24) % 21;
    ctx.shadowColor = "#38BDF8";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    focusedPath.forEach((id, i) => {
      const n = nodeById[id];
      if (!n) return;
      const p = project(n, t);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // nodes
  venue.nodes.forEach((n) => {
    const st = nodeState[n.id];
    const status = st ? st.status : "clear";
    const util = st ? Math.min(st.utilization, 1.4) : 0;
    const p = project(n, t);
    const color = statusColor(status);
    const [r, g, bl] = hexToRgb(color);
    const baseR =
      n.type === "exit" || n.type === "seating" || n.type === "platform"
        ? 13
        : 10;
    const radius = baseR + util * 8;
    const glowR = 22 + util * 34;

    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, glowR);
    const alpha = status === "clear" ? 0.22 : 0.35 + util * 0.4;
    grad.addColorStop(
      0,
      `rgba(${r},${g},${bl},${alpha * (status === "critical" ? pulse : 1)})`,
    );
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    nodeShape(ctx, p, n.type, radius);
    ctx.fillStyle = "#0B1221";
    ctx.fill();
    ctx.lineWidth = focusedElementId === n.id || hoverId === n.id ? 3.2 : 2;
    ctx.strokeStyle = color;
    if (status === "critical" || focusedElementId === n.id) {
      ctx.shadowColor = focusedElementId === n.id ? "#38BDF8" : color;
      ctx.shadowBlur = 18;
    }
    ctx.stroke();
    ctx.restore();

    if (status === "critical") {
      crosshatch(ctx, p, radius * 0.85, color);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = "700 13px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("!", p.x, p.y - radius - 9);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = status === "clear" ? "rgba(148,163,184,0.75)" : "#F8FAFC";
    ctx.font = "500 11px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    const above =
      n.type === "gate" || n.type === "concession" || n.type === "restroom";
    ctx.fillText(
      n.name,
      p.x,
      above
        ? p.y - radius - (status === "critical" ? 22 : 12)
        : p.y + radius + 16,
    );
    ctx.restore();
  });

  ctx.restore();
}

export function hitTest(
  venue: VenueLayout,
  t: Transform,
  mx: number,
  my: number,
  zoom: ZoomState,
): VenueNode | null {
  const worldX = (mx - zoom.x) / zoom.k;
  const worldY = (my - zoom.y) / zoom.k;
  let best: { node: VenueNode; d: number } | null = null;
  for (const n of venue.nodes) {
    const p = project(n, t);
    const d = Math.hypot(p.x - worldX, p.y - worldY);
    if (d < 22 && (best === null || d < best.d)) {
      best = { node: n, d };
    }
  }
  return best ? best.node : null;
}
