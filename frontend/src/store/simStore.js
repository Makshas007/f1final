import { create } from "zustand";

export const useSimStore = create((set, get) => ({
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
    }),
  setParams: (patch) => set({ params: { ...get().params, ...patch } }),
  setSimulating: (isSimulating) => set({ isSimulating }),
  setResult: (result) =>
    set({
      previousRun: get().result
        ? {
            peak: get().result.peak_utilization,
            events: get().result.total_bottleneck_events,
            people: get().result.params.total_people,
            curve: get().result.params.arrival_curve,
          }
        : null,
      result,
      currentStep: 0,
      suggestions: [],
      isPlaying: false,
      focusedElementId: null,
      focusedPath: null,
    }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  togglePlay: () => set({ isPlaying: !get().isPlaying }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setSuggestionsLoading: (suggestionsLoading) => set({ suggestionsLoading }),
  focusElement: (focusedElementId, focusedPath) =>
    set({ focusedElementId, focusedPath }),
  togglePanel: () => set({ panelOpen: !get().panelOpen }),
}));

export const currentStepData = (state) =>
  state.result ? state.result.steps[state.currentStep] : null;
