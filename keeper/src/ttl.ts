import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
const TTL_FILE = path.join(DATA_DIR, "ttl_estimate.json");
const INITIAL_ESTIMATE_MS = 43_200_000; // 12h
const SAFETY_FACTOR = 0.8;
const EMA_WEIGHT = 0.3;
const HOURS = 24;

interface TtlData {
  hourly: number[];    // 24 per-hour TTL estimates (ms)
  samples: number[];   // 24 per-hour sample counts
  globalEstimateMs: number;
  totalSamples: number;
  lastUpdated: number;
}

let state: TtlData = freshState();

function freshState(): TtlData {
  return {
    hourly: Array(HOURS).fill(INITIAL_ESTIMATE_MS),
    samples: Array(HOURS).fill(0),
    globalEstimateMs: INITIAL_ESTIMATE_MS,
    totalSamples: 0,
    lastUpdated: Date.now(),
  };
}

export function loadTtlEstimate(): void {
  try {
    if (fs.existsSync(TTL_FILE)) {
      const data: TtlData = JSON.parse(fs.readFileSync(TTL_FILE, "utf-8"));
      if (data.hourly?.length === HOURS) {
        state = data;
        log(`TTL loaded: global=${fmt(state.globalEstimateMs)}, ${state.totalSamples} samples`);
        return;
      }
    }
  } catch {}
  log(`TTL: using default ${fmt(INITIAL_ESTIMATE_MS)}`);
}

function persist(): void {
  try {
    const dir = path.dirname(TTL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TTL_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

export function recordObservedTtl(observedMs: number): void {
  const hour = new Date().getUTCHours();

  if (state.samples[hour] === 0) {
    state.hourly[hour] = observedMs;
  } else {
    state.hourly[hour] = (1 - EMA_WEIGHT) * state.hourly[hour] + EMA_WEIGHT * observedMs;
  }
  state.samples[hour]++;

  if (state.totalSamples === 0) {
    state.globalEstimateMs = observedMs;
  } else {
    state.globalEstimateMs = (1 - EMA_WEIGHT) * state.globalEstimateMs + EMA_WEIGHT * observedMs;
  }
  state.totalSamples++;
  state.lastUpdated = Date.now();

  persist();
  log(`TTL updated: hour=${hour} bucket=${fmt(state.hourly[hour])} global=${fmt(state.globalEstimateMs)} (sample #${state.totalSamples})`);
}

export function getActivationIntervalMs(): number {
  const hour = new Date().getUTCHours();
  const estimate = state.samples[hour] > 0 ? state.hourly[hour] : state.globalEstimateMs;
  return estimate * SAFETY_FACTOR;
}

export function getTtlState(): {
  globalEstimateMs: number;
  currentHour: number;
  currentHourEstimateMs: number;
  activationIntervalMs: number;
  totalSamples: number;
  hourly: { hour: number; estimateMs: number; samples: number }[];
  lastUpdated: number;
} {
  const hour = new Date().getUTCHours();
  return {
    globalEstimateMs: state.globalEstimateMs,
    currentHour: hour,
    currentHourEstimateMs: state.samples[hour] > 0 ? state.hourly[hour] : state.globalEstimateMs,
    activationIntervalMs: getActivationIntervalMs(),
    totalSamples: state.totalSamples,
    hourly: state.hourly.map((est, h) => ({ hour: h, estimateMs: est, samples: state.samples[h] })),
    lastUpdated: state.lastUpdated,
  };
}

function fmt(ms: number): string {
  return `${(ms / 60000).toFixed(0)}min`;
}
