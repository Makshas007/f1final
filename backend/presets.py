"""Hand-tuned demo venue layouts."""
import math
from typing import Dict, List

from models import VenueLayout


def _n(nid, name, ntype, capacity, x, y):
    return {"id": nid, "name": name, "type": ntype, "capacity": capacity, "x": x, "y": y}


def _e(eid, s, t, cap, w=1.0):
    return {
        "id": eid,
        "source": s,
        "target": t,
        "capacity_per_step": cap,
        "distance_weight": w,
        "bidirectional": False,
    }


def _stadium() -> dict:
    nodes, edges, sources, sinks = [], [], [], []
    cx, cy = 620, 380
    sectors = 8
    for i in range(sectors):
        ang = -math.pi / 2 + i * 2 * math.pi / sectors
        sid = f"S{i+1}"
        nodes.append(
            _n(sid, f"Sector {i+1} Stand", "seating", 6000,
               cx + 165 * math.cos(ang), cy + 135 * math.sin(ang))
        )
        sources.append(sid)
        cid = f"C{i+1}"
        nodes.append(
            _n(cid, f"Concourse {chr(65+i)}", "junction", 2200,
               cx + 300 * math.cos(ang), cy + 235 * math.sin(ang))
        )
        edges.append(_e(f"e_s{i+1}_c{i+1}", sid, cid, 600, 1.0))
    # concourse ring (bidirectional)
    for i in range(sectors):
        j = (i + 1) % sectors
        edges.append(_e(f"e_ring{i+1}", f"C{i+1}", f"C{j+1}", 420, 1.6))
        edges[-1]["bidirectional"] = True
    # concessions hanging off two concourse arcs
    for idx, i in enumerate([1, 5]):
        kid = f"K{idx+1}"
        ang = -math.pi / 2 + i * 2 * math.pi / sectors
        nodes.append(
            _n(kid, f"Food Court {idx+1}", "concession", 500,
               cx + 385 * math.cos(ang), cy + 300 * math.sin(ang))
        )
        edges.append(_e(f"e_c{i+1}_{kid}", f"C{i+1}", kid, 220, 2.4))
        edges.append(_e(f"e_{kid}_c{i+1}", kid, f"C{i+1}", 220, 2.4))
    # turnstile clusters (narrow) -> exits
    turn = [
        ("T1", "Turnstile Bank North", 900, 230, [1, 2, 8]),
        ("T2", "Turnstile Bank East", 500, 130, [2, 3, 4]),
        ("T3", "Turnstile Bank South", 900, 230, [4, 5, 6]),
        ("T4", "Turnstile Bank West", 500, 130, [6, 7, 8]),
    ]
    pos = {"T1": (620, 20), "T2": (1180, 380), "T3": (620, 760), "T4": (60, 380)}
    epos = {"E1": (620, -110), "E2": (1420, 380), "E3": (620, 890), "E4": (-180, 380)}
    for idx, (tid, tname, cap, tcap, links) in enumerate(turn):
        nodes.append(_n(tid, tname, "gate", cap, *pos[tid]))
        for c in links:
            edges.append(_e(f"e_c{c}_{tid}", f"C{c}", tid, tcap, 1.2))
        eid = f"E{idx+1}"
        nodes.append(_n(eid, f"Exit Plaza {idx+1}", "exit", 100000, *epos[eid]))
        sinks.append(eid)
        edges.append(_e(f"e_{tid}_{eid}", tid, eid, int(tcap * 3.4), 1.0))
    return {
        "id": "stadium_egress",
        "name": "Stadium Post-Match Egress",
        "description": "40,000-seat stadium emptying through 4 turnstile banks after full time.",
        "nodes": nodes,
        "edges": edges,
        "sources": sources,
        "sinks": sinks,
        "default_params": {
            "total_people": 28000,
            "duration_steps": 50,
            "arrival_curve": "heavy",
            "event_start_time": "22:15",
        },
    }


def _train_station() -> dict:
    nodes, edges, sources, sinks = [], [], [], []
    platforms = [
        ("P1", "Platform 1", 180),
        ("P2", "Platform 2", 380),
        ("P3", "Platform 3", 580),
    ]
    for pid, pname, y in platforms:
        nodes.append(_n(pid, pname, "platform", 3000, 120, y))
        sources.append(pid)
    stairs = [
        ("ST1", "P1 Escalator", "P1", 260, 130, 150, 3.0),
        ("ST2", "P1 Stairs", "P1", 200, 130, 240, 4.2),
        ("ST3", "P2 Escalator", "P2", 260, 130, 350, 3.0),
        ("ST4", "P2 Stairs", "P2", 200, 130, 440, 4.2),
        ("ST5", "P3 Escalator", "P3", 240, 130, 550, 3.0),
        ("ST6", "P3 Footbridge", "P3", 160, 130, 640, 5.0),
    ]
    for sid, sname, pid, cap, tcap, y, w in stairs:
        nodes.append(_n(sid, sname, "junction", cap, 340, y))
        edges.append(_e(f"e_{pid}_{sid}", pid, sid, tcap, w))
    conc = [
        ("H1", "North Concourse", 900, 560, 200),
        ("H2", "Central Concourse", 1200, 560, 400),
        ("H3", "South Concourse", 900, 560, 600),
    ]
    for hid, hname, cap, x, y in conc:
        nodes.append(_n(hid, hname, "junction", cap, x, y))
    links = [
        ("ST1", "H1", 300, 1.2), ("ST2", "H1", 240, 1.4),
        ("ST3", "H2", 320, 1.2), ("ST4", "H2", 260, 1.4),
        ("ST5", "H3", 300, 1.2), ("ST6", "H3", 200, 1.6),
        ("ST3", "H1", 180, 2.2), ("ST5", "H2", 180, 2.2),
    ]
    for s, t, cap, w in links:
        edges.append(_e(f"e_{s}_{t}", s, t, cap, w))
    for a, b in [("H1", "H2"), ("H2", "H3")]:
        edges.append(_e(f"e_{a}_{b}", a, b, 280, 1.8))
        edges[-1]["bidirectional"] = True
    nodes.append(_n("K1", "Ticket Kiosk", "concession", 250, 700, 300))
    edges.append(_e("e_H1_K1", "H1", "K1", 140, 2.6))
    edges.append(_e("e_K1_H1", "K1", "H1", 140, 2.6))
    nodes.append(_n("R1", "Restrooms", "restroom", 200, 700, 520))
    edges.append(_e("e_H3_R1", "H3", "R1", 120, 2.6))
    edges.append(_e("e_R1_H3", "R1", "H3", 120, 2.6))
    gates = [
        ("G1", "Ticket Gate Bank A", 700, 380, ["H1", "H2"], 900, 200),
        ("G2", "Ticket Gate Bank B", 500, 300, ["H2", "H3"], 900, 480),
    ]
    for gid, gname, cap, gcap, hs, x, y in gates:
        nodes.append(_n(gid, gname, "gate", cap, x, y))
        for h in hs:
            edges.append(_e(f"e_{h}_{gid}", h, gid, gcap, 1.2))
    exits = [("X1", "Street Exit North", 1120, 160), ("X2", "Metro Interchange", 1120, 520)]
    for xid, xname, x, y in exits:
        nodes.append(_n(xid, xname, "exit", 100000, x, y))
        sinks.append(xid)
    edges.append(_e("e_G1_X1", "G1", "X1", 500, 1.0))
    edges.append(_e("e_G2_X2", "G2", "X2", 400, 1.0))
    edges.append(_e("e_G1_X2", "G1", "X2", 150, 2.8))
    return {
        "id": "train_station",
        "name": "Metro Station Morning Rush",
        "description": "Three platforms discharging into a concourse with two narrow ticket-gate banks.",
        "nodes": nodes,
        "edges": edges,
        "sources": sources,
        "sinks": sinks,
        "default_params": {
            "total_people": 13000,
            "duration_steps": 45,
            "arrival_curve": "heavy",
            "event_start_time": "08:30",
        },
    }


def _festival() -> dict:
    nodes, edges, sources, sinks = [], [], [], []
    entries = [
        ("EN1", "Entry Gate North", 120, 120),
        ("EN2", "Entry Gate East", 1120, 160),
        ("EN3", "Entry Gate South", 160, 660),
        ("EN4", "Entry Gate West", 60, 380),
    ]
    for eid, name, x, y in entries:
        nodes.append(_n(eid, name, "entry", 9000, x, y))
        sources.append(eid)
    corridors = [
        ("A1", "Approach Corridor N", 1200, 320, 180),
        ("A2", "Approach Corridor E", 1200, 940, 260),
        ("A3", "Approach Corridor S", 1000, 320, 600),
        ("A4", "Approach Corridor W", 1000, 220, 420),
    ]
    for cid, name, cap, x, y in corridors:
        nodes.append(_n(cid, name, "junction", cap, x, y))
    for (eid, _, _, _), (cid, _, _, _, _) in zip(entries, corridors):
        edges.append(_e(f"e_{eid}_{cid}", eid, cid, 700, 1.0))
    mela = [
        ("M1", "Main Ghat Plaza", 2600, 620, 300),
        ("M2", "Prasad Distribution", 900, 780, 420),
        ("M3", "Sadhu Camp Path", 800, 460, 480),
    ]
    for mid, name, cap, x, y in mela:
        nodes.append(_n(mid, name, "junction", cap, x, y))
    plaza_links = [
        ("A1", "M1", 520, 1.2), ("A2", "M1", 460, 1.4), ("A3", "M3", 420, 1.4),
        ("A4", "M3", 380, 1.4), ("A2", "M2", 300, 1.8), ("M1", "M2", 320, 1.2),
        ("M1", "M3", 300, 1.4), ("M3", "M2", 240, 1.8),
    ]
    for s, t, cap, w in plaza_links:
        edges.append(_e(f"e_{s}_{t}", s, t, cap, w))
        edges[-1]["bidirectional"] = True
    nodes.append(_n("W1", "Water & Food Stalls", "concession", 600, 860, 260))
    edges.append(_e("e_M1_W1", "M1", "W1", 260, 2.2))
    edges.append(_e("e_W1_M1", "W1", "M1", 260, 2.2))
    nodes.append(_n("R1", "Sanitation Block", "restroom", 400, 620, 600))
    edges.append(_e("e_M3_R1", "M3", "R1", 200, 2.4))
    edges.append(_e("e_R1_M3", "R1", "M3", 200, 2.4))
    chokes = [
        ("CH1", "Bridge Choke Point 1", 420, 260, 1000, 160),
        ("CH2", "Bridge Choke Point 2", 360, 200, 1000, 380),
        ("CH3", "Riverside Ramp", 500, 300, 780, 640),
    ]
    for cid, name, cap, ccap, x, y in chokes:
        nodes.append(_n(cid, name, "gate", cap, x, y))
    choke_links = [
        ("M1", "CH1", 300), ("M2", "CH1", 200), ("M2", "CH2", 220),
        ("M1", "CH2", 180), ("M3", "CH3", 280), ("R1", "CH3", 160),
    ]
    for s, t, cap in choke_links:
        edges.append(_e(f"e_{s}_{t}", s, t, cap, 1.3))
    outs = [
        ("EX1", "Egress Zone North", 1160, 100),
        ("EX2", "Egress Zone East", 1160, 420),
        ("EX3", "Egress Zone South", 900, 720),
    ]
    for xid, name, x, y in outs:
        nodes.append(_n(xid, name, "exit", 200000, x, y))
        sinks.append(xid)
    edges.append(_e("e_CH1_EX1", "CH1", "EX1", 560, 1.0))
    edges.append(_e("e_CH2_EX2", "CH2", "EX2", 460, 1.0))
    edges.append(_e("e_CH3_EX3", "CH3", "EX3", 520, 1.0))
    return {
        "id": "festival_ground",
        "name": "Festival Ground (Kumbh-Scale)",
        "description": "Mass-gathering riverside ground with four entries funnelling into narrow bridge choke points.",
        "nodes": nodes,
        "edges": edges,
        "sources": sources,
        "sinks": sinks,
        "default_params": {
            "total_people": 40000,
            "duration_steps": 70,
            "arrival_curve": "moderate",
            "event_start_time": "05:00",
        },
    }


_RAW: List[dict] = [_stadium(), _train_station(), _festival()]
PRESETS: Dict[str, dict] = {p["id"]: p for p in _RAW}


def get_layout(preset_id: str) -> VenueLayout:
    return VenueLayout(**{k: v for k, v in PRESETS[preset_id].items() if k != "default_params"})


def list_presets() -> List[dict]:
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "description": p["description"],
            "node_count": len(p["nodes"]),
            "edge_count": len(p["edges"]),
            "default_params": p["default_params"],
        }
        for p in _RAW
    ]
