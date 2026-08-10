import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const http = axios.create({ baseURL: API, timeout: 60000 });

export const fetchPresets = async () => (await http.get("/presets")).data;
export const fetchPreset = async (id) => (await http.get(`/presets/${id}`)).data;
export const uploadVenue = async (layout) => (await http.post("/venues", layout)).data;
export const runSimulation = async (venue_id, params) =>
  (await http.post("/simulate", { venue_id, params })).data;
export const fetchSuggestions = async (simulation_id, step) =>
  (await http.post("/reroute-suggestions", { simulation_id, step })).data;
