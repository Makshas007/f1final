import type { SimulationParams } from "@/types";

export interface UrlState {
  venue?: string;
  params?: Partial<SimulationParams>;
}

/** Parse the shareable venue + scenario parameters out of the current URL. */
export function readUrlState(): UrlState {
  const query = new URLSearchParams(window.location.search);
  const venue = query.get("venue") ?? undefined;

  const params: Partial<SimulationParams> = {};
  const people = query.get("people");
  const curve = query.get("curve");
  const steps = query.get("steps");
  const start = query.get("start");

  if (people) params.total_people = Number(people);
  if (curve) params.arrival_curve = curve;
  if (steps) params.duration_steps = Number(steps);
  if (start) params.event_start_time = start;

  return { venue, params: Object.keys(params).length ? params : undefined };
}

/** Reflect the active preset + scenario into the URL so it can be shared. */
export function writeUrlState(
  venue: string | null,
  params: SimulationParams,
): void {
  const query = new URLSearchParams();
  if (venue) query.set("venue", venue);
  query.set("people", String(params.total_people));
  query.set("curve", params.arrival_curve);
  query.set("steps", String(params.duration_steps));
  query.set("start", params.event_start_time);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${query.toString()}`,
  );
}
