import { useEffect } from "react";
import { Toaster } from "sonner";
import "@/App.css";
import { ColorLegend } from "@/components/ColorLegend";
import { ControlPanel } from "@/components/ControlPanel";
import { TacticalHeader } from "@/components/TacticalHeader";
import { TimeScrubber } from "@/components/TimeScrubber";
import { VenueCanvas } from "@/components/VenueCanvas";
import { fetchPreset, fetchPresets } from "@/services/api";
import { useSimStore } from "@/store/simStore";

function App() {
  const setPresets = useSimStore((st) => st.setPresets);
  const setVenue = useSimStore((st) => st.setVenue);
  const setParams = useSimStore((st) => st.setParams);

  useEffect(() => {
    (async () => {
      try {
        const presets = await fetchPresets();
        setPresets(presets);
        if (presets.length) {
          const data = await fetchPreset(presets[0].id);
          setVenue(data.layout, presets[0].id);
          setParams({ ...data.default_params, step_duration_seconds: 60 });
        }
      } catch (e) {
        console.error("Failed to bootstrap presets", e);
      }
    })();
  }, [setPresets, setVenue, setParams]);

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

export default App;
