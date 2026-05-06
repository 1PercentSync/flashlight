import crypto from "node:crypto";
import { probe, activate } from "./probe.js";
import { recordObservedTtl, getEstimatedTtlMs, getMinSamples } from "./ttl.js";
import { log, warn } from "./log.js";

const PROBE_FACTOR = 0.95;
const INCREASE_FACTOR = 1.05;
const DECREASE_FACTOR = 0.8;

const SENTINEL_API_KEY = process.env.SENTINEL_API_KEY ?? "";
const SENTINEL_MODELS_RAW = process.env.SENTINEL_MODELS ?? "deepseek-v4-flash";
const SENTINEL_MODELS = SENTINEL_MODELS_RAW.split(",").map((s) => s.trim()).filter(Boolean);

const OVERRIDE_INTERVAL_MS = process.env.SENTINEL_INTERVAL_MS ? parseInt(process.env.SENTINEL_INTERVAL_MS, 10) : 0;

function getLaunchIntervalMs(model: string): number {
  if (OVERRIDE_INTERVAL_MS > 0) return OVERRIDE_INTERVAL_MS;
  const min = getMinSamples(model);
  if (min < 3) return 60 * 60_000;     // 60min — exploration (24 hours in 1 day)
  return 110 * 60_000;                  // 110min — steady state (not hour-aligned)
}

interface Sentinel {
  id: string;
  apiKey: string;
  model: string;
  cacheKey: string;
  createdAt: number;
  creationHour: number;
  probeAt: number;
  probed: boolean;
}

const sentinels = new Map<string, Sentinel>();
const lastLaunch = new Map<string, number>(); // model → last creation timestamp

const PADDING = "x".repeat(512);

function buildSentinelText(cacheKey: string): string {
  return `${cacheKey}\n${PADDING}\nThis is a sentinel cache probe token used to measure DeepSeek prefix cache TTL. The padding above ensures total prompt tokens exceed 128.`;
}

export function getApiKeyForSentinel(taskApiKeys: string[]): string {
  if (SENTINEL_API_KEY) return SENTINEL_API_KEY;
  if (taskApiKeys.length === 0) return "";
  return taskApiKeys[Math.floor(Math.random() * taskApiKeys.length)];
}

export async function reconcileSentinels(taskApiKeys: string[]): Promise<void> {
  for (const [id, sentinel] of sentinels) {
    if (!SENTINEL_MODELS.includes(sentinel.model)) {
      sentinels.delete(id);
      log(`sentinel removed (not in SENTINEL_MODELS): ${id}`);
    }
  }

  const now = Date.now();
  for (const model of SENTINEL_MODELS) {
    const last = lastLaunch.get(model) ?? 0;
    if (now - last < getLaunchIntervalMs(model)) continue;

    const apiKey = getApiKeyForSentinel(taskApiKeys);
    if (!apiKey) {
      warn(`sentinel skip: model=${model}, no apiKey available`);
      continue;
    }

    const created = await createSentinel(apiKey, model);
    if (created) lastLaunch.set(model, now);
  }
}

export async function checkDueSentinels(): Promise<void> {
  const now = Date.now();
  for (const [id, sentinel] of sentinels) {
    if (sentinel.probed || now < sentinel.probeAt) continue;
    try {
      await probeSentinel(id, sentinel);
    } catch (err) {
      warn(`sentinel probe error: model=${id} age=${((now - sentinel.createdAt) / 60000).toFixed(0)}min err=${err instanceof Error ? err.message : String(err)}`);
      sentinels.delete(id);
    }
  }
}

async function createSentinel(apiKey: string, model: string): Promise<boolean> {
  const cacheKey = crypto.randomBytes(16).toString("hex");
  const id = `${model}:${cacheKey.slice(0, 8)}`;
  const text = buildSentinelText(cacheKey);
  const keyLabel = SENTINEL_API_KEY ? "dedicated" : `...${apiKey.slice(-4)}`;

  log(`sentinel creating: model=${model} key=${keyLabel}`);
  const start = Date.now();

  try {
    await activate(apiKey, model, [
      { role: "user", content: text },
      { role: "user", content: "当前是测试缓存是否依旧生效,直接回复OK" },
    ]);
  } catch (err) {
    warn(`sentinel creation failed: model=${model} ${Date.now() - start}ms err=${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  const now = Date.now();
  const estimatedTtl = getEstimatedTtlMs(model);
  const probeDelay = estimatedTtl * PROBE_FACTOR;

  sentinels.set(id, {
    id,
    apiKey,
    model,
    cacheKey,
    createdAt: now,
    creationHour: new Date().getUTCHours(),
    probeAt: now + probeDelay,
    probed: false,
  });
  log(`sentinel created: model=${model} estimatedTtl=${(estimatedTtl / 60000).toFixed(0)}min probeIn=${(probeDelay / 60000).toFixed(0)}min ${now - start}ms`);
  return true;
}

async function probeSentinel(id: string, sentinel: Sentinel): Promise<void> {
  sentinel.probed = true;
  const text = buildSentinelText(sentinel.cacheKey);
  const age = Date.now() - sentinel.createdAt;

  log(`sentinel probing: model=${sentinel.model} age=${(age / 60000).toFixed(0)}min creationHour=${sentinel.creationHour}`);
  const start = Date.now();
  const result = await probe(sentinel.apiKey, sentinel.model, text);
  const probeMs = Date.now() - start;

  if (result.alive) {
    const observedTtl = age * INCREASE_FACTOR;
    recordObservedTtl(sentinel.model, observedTtl, sentinel.creationHour);
    log(`sentinel alive: model=${sentinel.model} age=${(age / 60000).toFixed(0)}min creationHour=${sentinel.creationHour} hit=${result.hitTokens}/${result.totalTokens} observedTtl=${(observedTtl / 60000).toFixed(0)}min ${probeMs}ms`);
  } else {
    const observedTtl = age * DECREASE_FACTOR;
    recordObservedTtl(sentinel.model, observedTtl, sentinel.creationHour);
    warn(`sentinel dead: model=${sentinel.model} age=${(age / 60000).toFixed(0)}min creationHour=${sentinel.creationHour} hit=${result.hitTokens}/${result.totalTokens} observedTtl=${(observedTtl / 60000).toFixed(0)}min ${probeMs}ms`);
  }

  sentinels.delete(id);
}

export function getSentinelStatus(): { id: string; model: string; ageMs: number; probeInMs: number }[] {
  const now = Date.now();
  return [...sentinels.values()].map((s) => ({
    id: s.id,
    model: s.model,
    ageMs: now - s.createdAt,
    probeInMs: Math.max(0, s.probeAt - now),
  }));
}
