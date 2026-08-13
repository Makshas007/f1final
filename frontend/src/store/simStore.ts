import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  Override,
  PresetSummary,
  RerouteSuggestion,
  SimulationParams,
  SimulationResult,
  StepResult,
  VenueLayout,
} from "@/types";

interface PreviousRun {
  peak: number;
  events: number;
  people: number;
  curve: string;
}

interface SimState {
  presets: PresetSummary[];
  venue: VenueLayout | null;
  venueId: string | null;
  params: SimulationParams;
  result: SimulationResult | null;
  previousRun: PreviousRun | null;
  isSimulating: boolean;
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
  suggestions: RerouteSuggestion[];
  suggestionsLoading: boolean;
  focusedElementId: string | null;
  focusedPath: string[] | null;
  panelOpen: boolean;
  overrides: Override[];

  setPresets: (presets: PresetSummary[]) => void;
  setVenue: (venue: VenueLayout, venueId: string) => void;
  setParams: (patch: Partial<SimulationParams>) => void;
  setSimulating: (isSimulating: boolean) => void;
  setResult: (result: SimulationResult) => void;
  setCurrentStep: (currentStep: number) => void;
  togglePlay: () => void;
  setPlaying: (isPlaying: boolean) => void;
  setSpeed: (playbackSpeed: number) => void;
  setSuggestions: (suggestions: RerouteSuggestion[]) => void;
  setSuggestionsLoading: (loading: boolean) => void;
  focusElement: (
    focusedElementId: string,
    focusedPath: string[] | null,
  ) => void;
  togglePanel: () => void;
  toggleOverride: (
    elementId: string,
    overrideType: "close" | "reduce_capacity",
    value?: number,
  ) => void;
  clearOverrides: () => void;
}

export const useSimStore = create<SimState>()(
  devtools(
    (set, get) => ({
      presets: [],
      venue: null,
      venueId: null,
      params: {
        total_people: 32000,
        duration_steps: 45,
        step_duration_seconds: 60,
        arrival_curve: "heavy",
        event_start_time: "22:15",
      },
      result: null,
      previousRun: null,
      isSimulating: false,
      currentStep: 0,
      isPlaying: false,
      playbackSpeed: 1,
      suggestions: [],
      suggestionsLoading: false,
      focusedElementId: null,
      focusedPath: null,
      panelOpen: true,
      overrides: [],

      setPresets: (presets) => set({ presets }),
      setVenue: (venue, venueId) =>
        set({
          venue,
          venueId,
          result: null,
          suggestions: [],
          currentStep: 0,
          isPlaying: false,
          focusedElementId: null,
          focusedPath: null,
          overrides: [],
        }),
      setParams: (patch) => set({ params: { ...get().params, ...patch } }),
      setSimulating: (isSimulating) => set({ isSimulating }),
      setResult: (result) => {
        const prev = get().result;
        set({
          previousRun: prev
            ? {
                peak: prev.peak_utilization,
                events: prev.total_bottleneck_events,
                people: prev.params.total_people,
                curve: prev.params.arrival_curve,
              }
            : null,
          result,
          currentStep: 0,
          suggestions: [],
          isPlaying: false,
          focusedElementId: null,
          focusedPath: null,
        });
      },
      setCurrentStep: (currentStep) => set({ currentStep }),
      togglePlay: () => set({ isPlaying: !get().isPlaying }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      setSpeed: (playbackSpeed) => set({ playbackSpeed }),
      setSuggestions: (suggestions) => set({ suggestions }),
      setSuggestionsLoading: (suggestionsLoading) => set({ suggestionsLoading }),
      focusElement: (focusedElementId, focusedPath) =>
        set({ focusedElementId, focusedPath }),
      togglePanel: () => set({ panelOpen: !get().panelOpen }),
      toggleOverride: (elementId, overrideType, value = 0.5) => {
        const existing = get().overrides.find(
          (o) => o.element_id === elementId,
        );
        if (existing && existing.override_type === overrideType) {
          set({
            overrides: get().overrides.filter(
              (o) => o.element_id !== elementId,
            ),
          });
        } else {
          set({
            overrides: [
              ...get().overrides.filter((o) => o.element_id !== elementId),
              { element_id: elementId, override_type: overrideType, value },
            ],
          });
        }
      },
      clearOverrides: () => set({ overrides: [] }),
    }),
    { name: "crowd-flow-optimiser" },
  ),
);

export const currentStepData = (state: SimState): StepResult | null =>
  state.result ? state.result.steps[state.currentStep] : null;
