import type { CongestionStatus, NodeType } from "@/types";

interface StatusStyle {
  color: string;
  label: string;
  pattern: string;
  icon: string;
}

export const STATUS: Record<CongestionStatus, StatusStyle> = {
  clear: { color: "#10B981", label: "Clear", pattern: "solid", icon: "\u25CF" },
  moderate: { color: "#FBBF24", label: "Moderate", pattern: "dashed", icon: "\u25D0" },
  warning: { color: "#F97316", label: "Warning", pattern: "dotted", icon: "\u25B2" },
  critical: { color: "#EF4444", label: "Critical", pattern: "cross", icon: "\u2715" },
};

export const statusColor = (status: string): string =>
  (STATUS[status as CongestionStatus] ?? STATUS.clear).color;

export const NODE_SHAPE: Record<NodeType, string> = {
  entry: "chevron",
  exit: "square",
  gate: "diamond",
  junction: "circle",
  concession: "triangle",
  restroom: "triangle",
  seating: "hex",
  platform: "hex",
};

export const NODE_LABELS: Record<NodeType, string> = {
  entry: "Entry",
  exit: "Exit",
  gate: "Gate / Turnstile",
  junction: "Walkway junction",
  concession: "Concession",
  restroom: "Restroom",
  seating: "Seating stand",
  platform: "Platform",
};
