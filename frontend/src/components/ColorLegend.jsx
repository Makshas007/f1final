import { STATUS } from "../utils/colors";

const ITEMS = [
  { key: "clear", hint: "< 50% · solid" },
  { key: "moderate", hint: "50–75% · dashed" },
  { key: "warning", hint: "75–90% · dotted" },
  { key: "critical", hint: "> 90% · hatched" },
];

export const ColorLegend = () => (
  <div
    data-testid="color-legend"
    className="pointer-events-auto absolute bottom-6 left-6 z-20 rounded-md border border-white/10 bg-[#0B1221]/75 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
  >
    <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
      Congestion scale
    </p>
    <ul className="space-y-2">
      {ITEMS.map(({ key, hint }) => (
        <li key={key} className="flex items-center gap-3" data-testid={`legend-${key}`}>
          <span
            className="grid h-4 w-4 place-items-center rounded-sm text-[10px] font-bold"
            style={{
              backgroundColor: `${STATUS[key].color}26`,
              border: `1px solid ${STATUS[key].color}`,
              color: STATUS[key].color,
            }}
          >
            {STATUS[key].icon}
          </span>
          <span className="text-xs text-slate-200">{STATUS[key].label}</span>
          <span className="font-mono text-[10px] text-slate-500">{hint}</span>
        </li>
      ))}
    </ul>
  </div>
);
