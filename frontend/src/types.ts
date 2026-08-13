// Shared domain types mirroring the FastAPI backend schema.

export type NodeType =
  | "entry"
  | "exit"
  | "junction"
  | "concession"
  | "restroom"
  | "seating"
  | "platform"
  | "gate";

export type CongestionStatus = "clear" | "moderate" | "warning" | "critical";

export interface VenueNode {
  id: string;
  name: string;
  type: NodeType;
  capacity: number;
  x: number;
  y: number;
}

export interface VenueEdge {
  id: string;
  source: string;
  target: string;
  capacity_per_step: number;
  distance_weight: number;
  bidirectional: boolean;
}

export interface VenueLayout {
  id: string;
  name: string;
  description?: string | null;
  nodes: VenueNode[];
  edges: VenueEdge[];
  sources: string[];
  sinks: string[];
}

export interface SimulationParams {
  total_people: number;
  duration_steps: number;
  step_duration_seconds: number;
  arrival_curve: string;
  event_start_time: string;
  seed?: number | null;
}

export interface Override {
  element_id: string;
  override_type: "close" | "reduce_capacity";
  value: number;
}

export interface PresetSummary {
  id: string;
  name: string;
  description: string;
  node_count: number;
  edge_count: number;
  default_params: Partial<SimulationParams>;
}

export interface NodeState {
  id: string;
  occupancy: number;
  capacity: number;
  utilization: number;
  status: CongestionStatus;
}

export interface EdgeState {
  id: string;
  flow: number;
  capacity: number;
  utilization: number;
  status: CongestionStatus;
}

export interface BottleneckInfo {
  element_id: string;
  element_type: string;
  location_name: string;
  current_density: number;
  status: CongestionStatus;
  expected_clearance_mins: number;
  alternatives: string[];
  alternate_path?: string[] | null;
}

export interface StepResult {
  step: number;
  time_label: string;
  nodes: NodeState[];
  edges: EdgeState[];
  bottlenecks: BottleneckInfo[];
  people_inside: number;
  people_exited: number;
  arrivals: number;
}

export interface SimulationResult {
  simulation_id: string;
  venue_id: string;
  venue_name: string;
  total_steps: number;
  params: SimulationParams;
  steps: StepResult[];
  peak_utilization: number;
  total_bottleneck_events: number;
  critical_elements: string[];
  clearance_step?: number | null;
}

export interface RerouteSuggestion {
  bottleneck: BottleneckInfo;
  generated_text: string;
  source: string;
  model?: string | null;
  ai_action?: string | null;
  ai_priority?: string | null;
  ai_affected_zones?: string[];
  ai_impact?: string | null;
  ai_risk?: string | null;
  ai_risk_source?: string | null;
}

export interface RerouteResponse {
  step: number;
  time_label: string;
  suggestions: RerouteSuggestion[];
  message?: string;
}

export interface PresetDetail {
  layout: VenueLayout;
  default_params: Partial<SimulationParams>;
}

export interface UploadVenueResponse {
  venue_id: string;
  layout: VenueLayout;
}
