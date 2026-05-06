import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
const TTL_FILE = path.join(DATA_DIR, "ttl_estimate.json");
const INITIAL_ESTIMATE_MS = 43_200_000; // 12h
const SAFETY_FACTOR = 0.8;
const EMA_WEIGHT = 0.3;

interface TtlData {
  estimatedMs: number;
  samples: number;
  lastUpdated: number;
}

let state: TtlData = {
  estimatedMs: INITIAL_ESTIMATE_MS,
  samples: 0,
  lastUpdated: Date.now(),
};

export function loadTtlEstimate(): void {
  try {
    if (fs.existsSync(TTL_FILE)) {
      const data: TtlData = JSON.parse(fs.readFileSync(TTL_FILE, "utf-8"));
      if (data.estimatedMs > 0 && data.samples >= 0) {
        state = data;
        log(`TTL estimate loaded: ${(state.estimatedMs / 60000).toFixed(1)} min (${state.samples} samples)`);
        return;
      }
    }
  } catch {}
  log(`TTL estimate: using default ${INITIAL_ESTIMATE_MS / 60000} min`);
}

function persist(): void {
  try {
    const dir = path.dirname(TTL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TTL_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

export function recordObservedTtl(observedMs: number): void {
  if (state.samples === 0) {
    state.estimatedMs = observedMs;
  } else {
    state.estimatedMs = (1 - EMA_WEIGHT) * state.estimatedMs + EMA_WEIGHT * observedMs;
  }
  state.samples++;
  state.lastUpdated = Date.now();
  persist();
  log(`TTL updated: ${(state.estimatedMs / 60000).toFixed(1)} min (sample #${state.samples}, observed=${(observedMs / 60000).toFixed(1)} min)`);
}

export function getActivationIntervalMs(): number {
  return state.estimatedMs * SAFETY_FACTOR;
}

export function getTtlState(): TtlData & { activationIntervalMs: number } {
  return { ...state, activationIntervalMs: getActivationIntervalMs() };
}
