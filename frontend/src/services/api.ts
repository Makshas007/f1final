import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import type {
  PresetSummary,
  PresetDetail,
  Override,
  RerouteResponse,
  SimulationParams,
  SimulationResult,
  UploadVenueResponse,
  VenueLayout,
} from "@/types";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const MAX_RETRIES = 2;

const http: AxiosInstance = axios.create({ baseURL: API, timeout: 60_000 });

type RetryConfig = InternalAxiosRequestConfig & { _retryCount?: number };

// Retry transient failures (network errors + 5xx) with exponential backoff.
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const retriable = status === undefined || status >= 500;

    if (config && retriable) {
      const attempt = config._retryCount ?? 0;
      if (attempt < MAX_RETRIES) {
        config._retryCount = attempt + 1;
        const delay = 300 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return http(config);
      }
    }
    return Promise.reject(error);
  },
);

export const fetchPresets = async (): Promise<PresetSummary[]> =>
  (await http.get<PresetSummary[]>("/presets")).data;

export const fetchPreset = async (id: string): Promise<PresetDetail> =>
  (await http.get<PresetDetail>(`/presets/${id}`)).data;

export const uploadVenue = async (
  layout: VenueLayout,
): Promise<UploadVenueResponse> =>
  (await http.post<UploadVenueResponse>("/venues", layout)).data;

export const runSimulation = async (
  venueId: string,
  params: SimulationParams,
): Promise<SimulationResult> =>
  (await http.post<SimulationResult>("/simulate", { venue_id: venueId, params }))
    .data;

export const runWhatIf = async (
  venueId: string,
  params: SimulationParams,
  overrides: Override[],
): Promise<SimulationResult> =>
  (
    await http.post<SimulationResult>("/simulate-whatif", {
      venue_id: venueId,
      params,
      overrides,
    })
  ).data;

export const fetchSuggestions = async (
  simulationId: string,
  step: number,
): Promise<RerouteResponse> =>
  (
    await http.post<RerouteResponse>("/reroute-suggestions", {
      simulation_id: simulationId,
      step,
    })
  ).data;
