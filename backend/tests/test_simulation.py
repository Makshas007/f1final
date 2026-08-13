"""Pure unit tests for the crowd-flow simulation engine (no server required)."""
import networkx as nx

import presets
from models import Override, SimulationParams
from simulation import (
    apply_overrides,
    build_graph,
    classify_congestion,
    generate_arrival_curve,
    resolve_endpoints,
    run_simulation,
)


def _stadium():
    return presets.get_layout("stadium_egress")


class TestGraphBuild:
    def test_build_graph_node_and_edge_counts(self):
        layout = _stadium()
        G = build_graph(layout)
        assert G.number_of_nodes() == len(layout.nodes)
        # bidirectional edges add a reverse edge, so edges >= declared edges
        assert G.number_of_edges() >= len(layout.edges)
        assert isinstance(G, nx.DiGraph)

    def test_resolve_endpoints(self):
        layout = _stadium()
        sources, sinks = resolve_endpoints(layout)
        assert len(sources) > 0 and len(sinks) > 0
        node_types = {n.id: n.type.value for n in layout.nodes}
        assert all(node_types[s] == "exit" for s in sinks)


class TestArrivalCurve:
    def test_curve_sums_to_total(self):
        for curve in ("light", "moderate", "heavy"):
            counts = generate_arrival_curve(28000, 50, curve)
            assert sum(counts) == 28000
            assert len(counts) == 50
            assert all(c >= 0 for c in counts)

    def test_heavy_peaks_earlier_than_moderate(self):
        import numpy as np

        heavy = generate_arrival_curve(28000, 50, "heavy")
        moderate = generate_arrival_curve(28000, 50, "moderate")
        assert int(np.argmax(heavy)) <= int(np.argmax(moderate))


class TestClassify:
    def test_boundaries(self):
        assert classify_congestion(0.0).value == "clear"
        assert classify_congestion(0.49).value == "clear"
        assert classify_congestion(0.50).value == "moderate"
        assert classify_congestion(0.74).value == "moderate"
        assert classify_congestion(0.75).value == "warning"
        assert classify_congestion(0.89).value == "warning"
        assert classify_congestion(0.90).value == "critical"
        assert classify_congestion(1.5).value == "critical"


class TestRunSimulation:
    def test_shape_and_emergent_bottlenecks(self):
        layout = _stadium()
        params = SimulationParams(
            total_people=28000, duration_steps=50, arrival_curve="heavy"
        )
        result = run_simulation(layout, params)
        assert result.total_steps == 50
        assert len(result.steps) == 50
        assert result.peak_utilization > 0
        peak_inside = max(s.people_inside for s in result.steps)
        assert peak_inside > result.steps[0].people_inside  # crowd builds
        assert result.steps[-1].people_inside < peak_inside  # then eases
        assert any(len(s.bottlenecks) > 0 for s in result.steps)

    def test_zero_effective_load_is_all_clear(self):
        layout = _stadium()
        params = SimulationParams(
            total_people=100, duration_steps=20, arrival_curve="light"
        )
        result = run_simulation(layout, params)
        assert result.total_bottleneck_events == 0

    def test_seed_is_reproducible(self):
        layout = _stadium()
        p = SimulationParams(total_people=28000, duration_steps=40, seed=7)
        a = run_simulation(layout, p)
        b = run_simulation(layout, p)
        assert a.peak_utilization == b.peak_utilization
        assert a.total_bottleneck_events == b.total_bottleneck_events


class TestWhatIfOverrides:
    def test_reduce_capacity_scales_edges(self):
        layout = _stadium()
        gate = next(n for n in layout.nodes if n.type.value == "gate")
        base_out = {
            e.id: e.capacity_per_step for e in layout.edges if e.source == gate.id
        }
        mod = apply_overrides(
            layout, [Override(element_id=gate.id, override_type="reduce_capacity", value=0.5)]
        )
        for e in mod.edges:
            if e.source == gate.id:
                assert e.capacity_per_step <= max(1, int(base_out[e.id] * 0.5))

    def test_close_throttles_but_keeps_simulatable(self):
        layout = _stadium()
        gate = next(n for n in layout.nodes if n.type.value == "gate")
        params = SimulationParams(total_people=28000, duration_steps=45, arrival_curve="heavy")
        base = run_simulation(layout, params)
        whatif = run_simulation(
            layout, params, overrides=[Override(element_id=gate.id, override_type="close")]
        )
        # Still produces a full, valid result (never disconnects the graph).
        assert len(whatif.steps) == 45
        # Closing a turnstile bank should not reduce overall peak load.
        assert whatif.peak_utilization >= base.peak_utilization - 0.001

    def test_override_does_not_mutate_original_layout(self):
        layout = _stadium()
        gate = next(n for n in layout.nodes if n.type.value == "gate")
        original_caps = {e.id: e.capacity_per_step for e in layout.edges}
        apply_overrides(layout, [Override(element_id=gate.id, override_type="close")])
        assert {e.id: e.capacity_per_step for e in layout.edges} == original_caps
