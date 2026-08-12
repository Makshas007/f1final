import { jsPDF } from "jspdf";
import type { SimulationResult } from "@/types";

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Download a per-step CSV of the simulation timeline. */
export function exportCSV(result: SimulationResult): void {
  const header = [
    "step",
    "time",
    "people_inside",
    "people_exited",
    "arrivals",
    "bottlenecks",
    "critical_elements",
  ];
  const rows = result.steps.map((step) => [
    step.step,
    step.time_label,
    step.people_inside,
    step.people_exited,
    step.arrivals,
    step.bottlenecks.length,
    step.nodes.filter((n) => n.status === "critical").length +
      step.edges.filter((e) => e.status === "critical").length,
  ]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  download(`${result.venue_id}_timeline.csv`, csv, "text/csv;charset=utf-8");
}

interface CriticalEvent {
  time: string;
  location: string;
  density: number;
  clearance: number;
}

function collectCriticalEvents(result: SimulationResult): CriticalEvent[] {
  const seen = new Set<string>();
  const events: CriticalEvent[] = [];
  for (const step of result.steps) {
    for (const b of step.bottlenecks) {
      if (b.status !== "critical") continue;
      const key = b.element_id;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        time: step.time_label,
        location: b.location_name,
        density: b.current_density,
        clearance: b.expected_clearance_mins,
      });
    }
  }
  return events;
}

/** Generate a printable PDF incident briefing for control-room handover. */
export function exportPDF(result: SimulationResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 60;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Crowd Flow Optimiser \u2014 Incident Briefing", left, y);

  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(result.venue_name, left, y);
  y += 16;
  doc.text(`Generated ${new Date().toLocaleString()}`, left, y);

  y += 30;
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Scenario", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const p = result.params;
  const scenario = [
    `Expected crowd: ${p.total_people.toLocaleString()} people`,
    `Arrival curve: ${p.arrival_curve}`,
    `Event start: ${p.event_start_time}   |   Window: ${p.duration_steps} min`,
  ];
  scenario.forEach((line) => {
    y += 16;
    doc.text(line, left, y);
  });

  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Key findings", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const clearance =
    result.clearance_step !== null && result.clearance_step !== undefined
      ? `${result.clearance_step} min`
      : "beyond window";
  const findings = [
    `Peak load: ${Math.round(result.peak_utilization * 100)}% of capacity`,
    `Total risk events: ${result.total_bottleneck_events}`,
    `Estimated clearance: ${clearance}`,
  ];
  findings.forEach((line) => {
    y += 16;
    doc.text(line, left, y);
  });

  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Critical bottlenecks", left, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const events = collectCriticalEvents(result);
  if (!events.length) {
    y += 18;
    doc.text("No critical bottlenecks were detected in this scenario.", left, y);
  } else {
    y += 18;
    doc.setTextColor(120);
    doc.text("Time", left, y);
    doc.text("Location", left + 70, y);
    doc.text("Load", left + 330, y);
    doc.text("Clearance", left + 400, y);
    doc.setTextColor(20);
    events.slice(0, 20).forEach((event) => {
      y += 16;
      if (y > 780) {
        doc.addPage();
        y = 60;
      }
      doc.text(event.time, left, y);
      doc.text(event.location.slice(0, 44), left + 70, y);
      doc.text(`${event.density}%`, left + 330, y);
      doc.text(`~${event.clearance} min`, left + 400, y);
    });
  }

  doc.save(`${result.venue_id}_incident_briefing.pdf`);
}
