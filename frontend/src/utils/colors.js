export const STATUS = {
  clear: { color: "#10B981", label: "Clear", pattern: "solid", icon: "●" },
  moderate: { color: "#FBBF24", label: "Moderate", pattern: "dashed", icon: "◐" },
  warning: { color: "#F97316", label: "Warning", pattern: "dotted", icon: "▲" },
  critical: { color: "#EF4444", label: "Critical", pattern: "cross", icon: "✕" },
};

export const statusColor = (s) => (STATUS[s] || STATUS.clear).color;

export const NODE_SHAPE = {
  entry: "chevron",
  exit: "square",
  gate: "diamond",
  junction: "circle",
  concession: "triangle",
  restroom: "triangle",
  seating: "hex",
  platform: "hex",
};

export const NODE_LABELS = {
  entry: "Entry",
  exit: "Exit",
  gate: "Gate / Turnstile",
  junction: "Walkway junction",
  concession: "Concession",
  restroom: "Restroom",
  seating: "Seating stand",
  platform: "Platform",
};
