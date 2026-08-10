from enum import Enum
from typing import List, Dict, Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    ENTRY = "entry"
    EXIT = "exit"
    JUNCTION = "junction"
    CONCESSION = "concession"
    RESTROOM = "restroom"
    SEATING = "seating"
    PLATFORM = "platform"
    GATE = "gate"


class CongestionStatus(str, Enum):
    CLEAR = "clear"
    MODERATE = "moderate"
    WARNING = "warning"
    CRITICAL = "critical"


class Node(BaseModel):
    id: str
    name: str
    type: NodeType
    capacity: int = Field(..., gt=0)
    x: float
    y: float


class Edge(BaseModel):
    id: str
    source: str
    target: str
    capacity_per_step: int = Field(..., gt=0)
    distance_weight: float = 1.0
    bidirectional: bool = False


class VenueLayout(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    nodes: List[Node]
    edges: List[Edge]
    sources: List[str] = []
    sinks: List[str] = []


class SimulationParams(BaseModel):
    total_people: int = Field(20000, ge=100, le=200000)
    duration_steps: int = Field(45, ge=10, le=120)
    step_duration_seconds: int = Field(60, ge=10, le=300)
    arrival_curve: str = "moderate"
    event_start_time: str = "18:00"


class SimulateRequest(BaseModel):
    venue_id: str
    params: SimulationParams = SimulationParams()


class RerouteRequest(BaseModel):
    simulation_id: str
    step: int


class NodeState(BaseModel):
    id: str
    occupancy: int
    capacity: int
    utilization: float
    status: CongestionStatus


class EdgeState(BaseModel):
    id: str
    flow: int
    capacity: int
    utilization: float
    status: CongestionStatus


class BottleneckInfo(BaseModel):
    element_id: str
    element_type: str
    location_name: str
    current_density: int
    status: CongestionStatus
    expected_clearance_mins: int
    alternatives: List[str] = []
    alternate_path: Optional[List[str]] = None


class StepResult(BaseModel):
    step: int
    time_label: str
    nodes: List[NodeState]
    edges: List[EdgeState]
    bottlenecks: List[BottleneckInfo]
    people_inside: int
    people_exited: int
    arrivals: int


class SimulationResult(BaseModel):
    simulation_id: str
    venue_id: str
    venue_name: str
    total_steps: int
    params: SimulationParams
    steps: List[StepResult]
    peak_utilization: float
    total_bottleneck_events: int
    critical_elements: List[str]
    clearance_step: Optional[int] = None


class RerouteSuggestion(BaseModel):
    bottleneck: BottleneckInfo
    generated_text: str
    source: str = "ai"
    model: Optional[str] = None
