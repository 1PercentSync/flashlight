import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

const DATA_DIR = process.env.DATA_DIR ?? "/app/data";
const TTL_FILE = path.join(DATA_DIR, "ttl_estimate.json");
const INITIAL_ESTIMATE_MS = 43_200_000; // 12h
const SAFETY_FACTOR = 0.8;
const BUCKET_EMA_WEIGHT = 0.3;
const GLOBAL_EMA_WEIGHT = 0.1;
const HOURS = 24;

interface ModelTtl {
  hourly: number[];
  samples: number[];
  globalEstimateMs: number;
  totalSamples: number;
}

interface PersistData {
  models: Record<string, ModelTtl>;
  lastUpdated: number;
}

const models = new Map<string, ModelTtl>();
let lastUpdated = Date.now();

function freshModelTtl(): ModelTtl {
  return {
    hourly: Array(HOURS).fill(0),
    samples: Array(HOURS).fill(0),
    globalEstimateMs: INITIAL_ESTIMATE_MS,
    totalSamples: 0,
  };
}

function getModel(model: string): ModelTtl {
  let m = models.get(model);
  if (!m) {
    m = freshModelTtl();
    models.set(model, m);
  }
  return m;
}

export function loadTtlEstimate(): void {
  try {
    if (fs.existsSync(TTL_FILE)) {
      const data: PersistData = JSON.parse(fs.readFileSync(TTL_FILE, "utf-8"));
      if (data.models) {
        for (const [model, ttl] of Object.entries(data.models)) {
          if (ttl.hourly?.length === HOURS) {
            models.set(model, ttl);
          }
        }
        lastUpdated = data.lastUpdated ?? Date.now();
        const names = [...models.keys()].join(", ");
        log(`TTL loaded: ${models.size} models [${names}]`);
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
    const data: PersistData = {
      models: Object.fromEntries(models),
      lastUpdated,
    };
    fs.writeFileSync(TTL_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    log(`TTL persist failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function recordObservedTtl(model: string, observedMs: number): void {
  const m = getModel(model);
  const hour = new Date().getUTCHours();

  if (m.samples[hour] === 0) {
    m.hourly[hour] = observedMs;
  } else {
    m.hourly[hour] = (1 - BUCKET_EMA_WEIGHT) * m.hourly[hour] + BUCKET_EMA_WEIGHT * observedMs;
  }
  m.samples[hour]++;

  if (m.totalSamples === 0) {
    m.globalEstimateMs = observedMs;
  } else {
    m.globalEstimateMs = (1 - GLOBAL_EMA_WEIGHT) * m.globalEstimateMs + GLOBAL_EMA_WEIGHT * observedMs;
  }
  m.totalSamples++;
  lastUpdated = Date.now();

  persist();
  log(`TTL[${model}] updated: hour=${hour} bucket=${fmt(m.hourly[hour])} global=${fmt(m.globalEstimateMs)} (sample #${m.totalSamples})`);
}

export function getActivationIntervalMs(model: string): number {
  const m = getModel(model);
  const hour = new Date().getUTCHours();
  const estimate = m.samples[hour] > 0 ? m.hourly[hour] : m.globalEstimateMs;
  return estimate * SAFETY_FACTOR;
}

export function getEstimatedTtlMs(model: string): number {
  const m = getModel(model);
  const hour = new Date().getUTCHours();
  return m.samples[hour] > 0 ? m.hourly[hour] : m.globalEstimateMs;
}

export function getMinSamples(model: string): number {
  const m = getModel(model);
  return Math.min(...m.samples);
}

export function getTtlState(): {
  models: Record<string, {
    globalEstimateMs: number;
    totalSamples: number;
    currentHour: number;
    currentHourEstimateMs: number;
    activationIntervalMs: number;
    hourly: { hour: number; estimateMs: number; samples: number }[];
  }>;
  lastUpdated: number;
} {
  const hour = new Date().getUTCHours();
  const result: Record<string, any> = {};
  for (const [model, m] of models) {
    result[model] = {
      globalEstimateMs: m.globalEstimateMs,
      totalSamples: m.totalSamples,
      currentHour: hour,
      currentHourEstimateMs: m.samples[hour] > 0 ? m.hourly[hour] : m.globalEstimateMs,
      activationIntervalMs: getActivationIntervalMs(model),
      hourly: m.hourly.map((est, h) => ({ hour: h, estimateMs: est, samples: m.samples[h] })),
    };
  }
  return { models: result, lastUpdated };
}

function fmt(ms: number): string {
  return `${(ms / 60000).toFixed(0)}min`;
}
