"""Macroscopic crowd-flow simulation over a venue graph."""
import math
import uuid
from typing import Dict, List, Optional, Tuple

import networkx as nx
import numpy as np

from models import (
    BottleneckInfo,
    CongestionStatus,
    EdgeState,
    NodeState,
    SimulationParams,
    SimulationResult,
    StepResult,
    VenueLayout,
)

SOURCE_TYPES = {"entry", "seating", "platform"}


def build_graph(layout: VenueLayout) -> nx.DiGraph:
    G = nx.DiGraph()
    for node in layout.nodes:
        G.add_node(node.id, **node.model_dump())
    node_ids = {n.id for n in layout.nodes}
    for edge in layout.edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            raise ValueError(
                f"Edge '{edge.id}' references unknown node "
                f"('{edge.source}' -> '{edge.target}')"
            )
        G.add_edge(
            edge.source,
            edge.target,
            id=edge.id,
            capacity=edge.capacity_per_step,
            weight=max(edge.distance_weight, 0.01),
        )
        if edge.bidirectional:
            G.add_edge(
                edge.target,
                edge.source,
                id=f"{edge.id}_rev",
                capacity=edge.capacity_per_step,
                weight=max(edge.distance_weight, 0.01),
            )
    return G


def resolve_endpoints(layout: VenueLayout) -> Tuple[List[str], List[str]]:
    sources = layout.sources or [n.id for n in layout.nodes if n.type in SOURCE_TYPES]
    sinks = layout.sinks or [n.id for n in layout.nodes if n.type == "exit"]
    if not sources:
        raise ValueError("Layout has no source nodes (entry/seating/platform).")
    if not sinks:
        raise ValueError("Layout has no exit nodes.")
    return sources, sinks


def generate_arrival_curve(total: int, steps: int, curve_type: str) -> List[int]:
    x = np.linspace(0, 1, steps)
    if curve_type == "light":
        weights = np.ones(steps)
    elif curve_type == "heavy":
        weights = np.exp(-0.5 * ((x - 0.20) / 0.08) ** 2)
    else:  # moderate
        weights = np.exp(-0.5 * ((x - 0.30) / 0.16) ** 2)
    weights = weights / weights.sum()
    counts = np.floor(weights * total).astype(int)
    counts[int(np.argmax(weights))] += total - int(counts.sum())
    return counts.tolist()


def classify_congestion(utilization: float) -> CongestionStatus:
    if utilization < 0.50:
        return CongestionStatus.CLEAR
    if utilization < 0.75:
        return CongestionStatus.MODERATE
    if utilization < 0.90:
        return CongestionStatus.WARNING
    return CongestionStatus.CRITICAL


def _distance_to_sink(G: nx.DiGraph, sinks: List[str]) -> Dict[str, float]:
    dist: Dict[str, float] = {}
    for sink in sinks:
        lengths = nx.shortest_path_length(G.reverse(copy=True), sink, weight="weight")
        for node, d in lengths.items():
            if node not in dist or d < dist[node]:
                dist[node] = d
    return dist


def _routing_table(
    G: nx.DiGraph, dist: Dict[str, float], sinks: List[str], k: int = 3
) -> Dict[str, List[Tuple[str, float, str, int]]]:
    """node -> list of (next_hop, weight, edge_id, edge_capacity) ranked by progress."""
    table: Dict[str, List[Tuple[str, float, str, int]]] = {}
    sink_set = set(sinks)
    for node in G.nodes:
        if node in sink_set or node not in dist:
            table[node] = []
            continue
        options = []
        for _, nbr, data in G.out_edges(node, data=True):
            if nbr in dist and dist[nbr] < dist[node] - 1e-9:
                progress = dist[node] - dist[nbr]
                options.append((nbr, progress, data["id"], data["capacity"]))
        options.sort(key=lambda o: (-o[1], -o[3]))
        options = options[:k]
        total_cap = sum(o[3] for o in options) or 1
        table[node] = [(o[0], o[3] / total_cap, o[2], o[3]) for o in options]
    return table


def compute_alternate_path(
    G: nx.DiGraph,
    start: str,
    sinks: List[str],
    blocked_edge_ids: set,
    blocked_nodes: set,
) -> Optional[List[str]]:
    H = G.copy()
    for u, v, data in H.edges(data=True):
        penalty = 1.0
        if data["id"] in blocked_edge_ids:
            penalty *= 500
        if v in blocked_nodes:
            penalty *= 500
        H[u][v]["pweight"] = data["weight"] * penalty
    best = None
    for sink in sinks:
        try:
            path = nx.shortest_path(H, start, sink, weight="pweight")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue
        cost = sum(
            H[path[i]][path[i + 1]]["pweight"] for i in range(len(path) - 1)
        )
        if best is None or cost < best[0]:
            best = (cost, path)
    return best[1] if best else None


def _time_label(start: str, step: int, step_seconds: int) -> str:
    try:
        hh, mm = [int(p) for p in start.split(":")[:2]]
    except Exception:
        hh, mm = 18, 0
    total = hh * 60 + mm + int(step * step_seconds / 60)
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def run_simulation(layout: VenueLayout, params: SimulationParams) -> SimulationResult:
    G = build_graph(layout)
    sources, sinks = resolve_endpoints(layout)
    dist = _distance_to_sink(G, sinks)
    unreachable = [n for n in G.nodes if n not in dist]
    if any(s in unreachable for s in sources):
        raise ValueError("One or more source nodes cannot reach any exit node.")
    table = _routing_table(G, dist, sinks)

    node_meta = {n.id: n for n in layout.nodes}
    edge_meta = {}
    for u, v, data in G.edges(data=True):
        edge_meta[data["id"]] = (u, v, data["capacity"])

    src_caps = {s: node_meta[s].capacity for s in sources}
    total_src_cap = sum(src_caps.values()) or 1
    arrivals = generate_arrival_curve(
        params.total_people, params.duration_steps, params.arrival_curve
    )

    occupancy: Dict[str, float] = {n: 0.0 for n in G.nodes}
    sink_set = set(sinks)
    steps: List[StepResult] = []
    peak_util = 0.0
    bottleneck_events = 0
    critical_elements: set = set()
    exited_total = 0
    clearance_step: Optional[int] = None
    rng = np.random.default_rng(42)

    for step in range(params.duration_steps):
        incoming = arrivals[step]
        for s in sources:
            occupancy[s] += incoming * (src_caps[s] / total_src_cap)

        edge_flow: Dict[str, float] = {eid: 0.0 for eid in edge_meta}
        inflow: Dict[str, float] = {n: 0.0 for n in G.nodes}
        outflow: Dict[str, float] = {n: 0.0 for n in G.nodes}
        headroom: Dict[str, float] = {}
        for n in G.nodes:
            if n in sink_set:
                headroom[n] = math.inf
            else:
                headroom[n] = max(node_meta[n].capacity - occupancy[n], 0.0)

        order = sorted(G.nodes, key=lambda n: dist.get(n, math.inf))
        for u in order:
            if u in sink_set:
                continue
            demand = occupancy[u]
            if demand <= 0:
                continue
            hops = table.get(u, [])
            if not hops:
                continue
            remaining = demand
            for nbr, share, eid, cap in hops:
                if remaining <= 0:
                    break
                jitter = 1.0 + float(rng.normal(0, 0.03))
                want = min(demand * share * jitter, remaining)
                allowed = min(want, cap - edge_flow[eid], headroom[nbr])
                if allowed <= 0:
                    continue
                edge_flow[eid] += allowed
                inflow[nbr] += allowed
                outflow[u] += allowed
                headroom[nbr] -= allowed
                remaining -= allowed
            # spill remaining onto any hop with leftover capacity
            if remaining > 0:
                for nbr, _share, eid, cap in hops:
                    allowed = min(remaining, cap - edge_flow[eid], headroom[nbr])
                    if allowed <= 0:
                        continue
                    edge_flow[eid] += allowed
                    inflow[nbr] += allowed
                    outflow[u] += allowed
                    headroom[nbr] -= allowed
                    remaining -= allowed
                    if remaining <= 0:
                        break

        for n in G.nodes:
            occupancy[n] += inflow[n] - outflow[n]
        step_exited = 0
        for s in sinks:
            step_exited += int(occupancy[s])
            occupancy[s] = 0.0
        exited_total += step_exited

        node_states: List[NodeState] = []
        for n in G.nodes:
            if n in sink_set:
                util = 0.0
                occ = 0
            else:
                occ = int(round(occupancy[n]))
                util = occ / node_meta[n].capacity
            status = classify_congestion(util)
            peak_util = max(peak_util, util)
            if status in (CongestionStatus.WARNING, CongestionStatus.CRITICAL):
                bottleneck_events += 1
            if status == CongestionStatus.CRITICAL:
                critical_elements.add(n)
            node_states.append(
                NodeState(
                    id=n,
                    occupancy=occ,
                    capacity=node_meta[n].capacity,
                    utilization=round(util, 3),
                    status=status,
                )
            )

        edge_states: List[EdgeState] = []
        for eid, (u, v, cap) in edge_meta.items():
            flow = int(round(edge_flow[eid]))
            util = flow / cap
            status = classify_congestion(util)
            peak_util = max(peak_util, util)
            if status in (CongestionStatus.WARNING, CongestionStatus.CRITICAL):
                bottleneck_events += 1
            if status == CongestionStatus.CRITICAL:
                critical_elements.add(eid)
            edge_states.append(
                EdgeState(
                    id=eid,
                    flow=flow,
                    capacity=cap,
                    utilization=round(util, 3),
                    status=status,
                )
            )

        flagged_nodes = {
            s.id for s in node_states
            if s.status in (CongestionStatus.WARNING, CongestionStatus.CRITICAL)
        }
        flagged_edges = {
            s.id for s in edge_states
            if s.status in (CongestionStatus.WARNING, CongestionStatus.CRITICAL)
        }
        bottlenecks = _build_bottlenecks(
            G, node_states, edge_states, node_meta, edge_meta,
            flagged_nodes, flagged_edges, sinks, table,
        )

        people_inside = int(sum(v for k, v in occupancy.items() if k not in sink_set))
        if clearance_step is None and step > 0 and people_inside <= 0 and exited_total > 0:
            clearance_step = step

        steps.append(
            StepResult(
                step=step,
                time_label=_time_label(
                    params.event_start_time, step, params.step_duration_seconds
                ),
                nodes=node_states,
                edges=edge_states,
                bottlenecks=bottlenecks,
                people_inside=people_inside,
                people_exited=exited_total,
                arrivals=int(incoming),
            )
        )

    return SimulationResult(
        simulation_id=str(uuid.uuid4()),
        venue_id=layout.id,
        venue_name=layout.name,
        total_steps=params.duration_steps,
        params=params,
        steps=steps,
        peak_utilization=round(peak_util, 3),
        total_bottleneck_events=bottleneck_events,
        critical_elements=sorted(critical_elements),
        clearance_step=clearance_step,
    )


def _build_bottlenecks(
    G, node_states, edge_states, node_meta, edge_meta,
    flagged_nodes, flagged_edges, sinks, table,
) -> List[BottleneckInfo]:
    out: List[BottleneckInfo] = []
    severity_rank = {CongestionStatus.CRITICAL: 0, CongestionStatus.WARNING: 1}

    candidates = []
    for s in node_states:
        if s.id in flagged_nodes:
            candidates.append(("node", s))
    for s in edge_states:
        if s.id in flagged_edges:
            candidates.append(("edge", s))
    candidates.sort(key=lambda c: (severity_rank.get(c[1].status, 2), -c[1].utilization))

    for kind, state in candidates[:8]:
        if kind == "node":
            name = node_meta[state.id].name
            start = state.id
            density = int(state.utilization * 100)
            excess = max(state.occupancy - state.capacity * 0.75, 0)
            throughput = sum(c for _, _, _, c in table.get(state.id, [])) or 1
        else:
            u, v, cap = edge_meta[state.id]
            name = f"{node_meta[u].name} → {node_meta[v].name}"
            start = u
            density = int(state.utilization * 100)
            excess = max(state.flow - cap, 0)
            throughput = cap
        alt_path = compute_alternate_path(
            G, start, sinks, set(flagged_edges), flagged_nodes - {start}
        )
        alternatives = []
        if alt_path and len(alt_path) > 1:
            alternatives = [node_meta[p].name for p in alt_path[1:4] if p in node_meta]
        out.append(
            BottleneckInfo(
                element_id=state.id,
                element_type=kind,
                location_name=name,
                current_density=density,
                status=state.status,
                expected_clearance_mins=int(min(max(excess / throughput, 1), 45)),
                alternatives=alternatives or ["no clear alternate route"],
                alternate_path=alt_path,
            )
        )
    return out
