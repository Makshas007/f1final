import { useEffect } from "react";
import { Toaster } from "sonner";
import { ColorLegend } from "@/components/ColorLegend";
import { ControlPanel } from "@/components/ControlPanel";
import { TacticalHeader } from "@/components/TacticalHeader";
import { TimeScrubber } from "@/components/TimeScrubber";
import { VenueCanvas } from "@/components/VenueCanvas";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { fetchPreset, fetchPresets } from "@/services/api";
import { useSimStore } from "@/store/simStore";
import { readUrlState, writeUrlState } from "@/utils/urlState";

export default function App() {
  const setPresets = useSimStore((st) => st.setPresets);
  const setVenue = useSimStore((st) => st.setVenue);
  const setParams = useSimStore((st) => st.setParams);
  const venueId = useSimStore((st) => st.venueId);
  const params = useSimStore((st) => st.params);

  useKeyboardShortcuts();

  useEffect(() => {
    (async () => {
      try {
        const presets = await fetchPresets();
        setPresets(presets);
        if (!presets.length) return;
        const url = readUrlState();
        const target = presets.find((p) => p.id === url.venue) ?? presets[0];
        const data = await fetchPreset(target.id);
        setVenue(data.layout, target.id);
        setParams({
          ...data.default_params,
          step_duration_seconds: 60,
          ...(url.params ?? {}),
        });
      } catch (e) {
        console.error("Failed to bootstrap presets", e);
      }
    })();
  }, [setPresets, setVenue, setParams]);

  // Keep the URL in sync with the active preset + scenario for shareable links.
  useEffect(() => {
    if (venueId && venueId.startsWith("custom_")) return;
    writeUrlState(venueId, params);
  }, [venueId, params]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040914]">
      <VenueCanvas />
      <TacticalHeader />
      <ControlPanel />
      <ColorLegend />
      <TimeScrubber />
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
