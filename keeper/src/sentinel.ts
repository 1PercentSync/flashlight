import crypto from "node:crypto";
import { probe, activate } from "./probe.js";
import { recordObservedTtl, getEstimatedTtlMs } from "./ttl.js";
import { log, warn } from "./log.js";

const PROBE_FACTOR = 0.95;
const INCREASE_FACTOR = 1.05;
const DECREASE_FACTOR = 0.8;

const SENTINEL_API_KEY = process.env.SENTINEL_API_KEY ?? "";

interface Sentinel {
  apiKey: string;
  model: string;
  cacheKey: string;
  createdAt: number;
  creationHour: number;
  probeAt: number;
  probed: boolean;
}

const sentinels = new Map<string, Sentinel>();

function sentinelId(model: string): string {
  return model;
}

const PADDING = "x".repeat(512);

function buildSentinelText(cacheKey: string): string {
  return `${cacheKey}\n${PADDING}\nThis is a sentinel cache probe token used to measure DeepSeek prefix cache TTL. The padding above ensures total prompt tokens exceed 128.`;
}

export function getApiKeyForSentinel(taskApiKeys: string[]): string {
  if (SENTINEL_API_KEY) return SENTINEL_API_KEY;
  if (taskApiKeys.length === 0) return "";
  return taskApiKeys[Math.floor(Math.random() * taskApiKeys.length)];
}

export async function reconcileSentinels(activeModels: Map<string, string[]>): Promise<void> {
  for (const [id] of sentinels) {
    if (!activeModels.has(id)) {
      sentinels.delete(id);
      log(`sentinel removed (no active tasks): model=${id}`);
    }
  }

  for (const [model, apiKeys] of activeModels) {
    const id = sentinelId(model);
    const existing = sentinels.get(id);
    if (existing && !existing.probed) continue;

    const apiKey = getApiKeyForSentinel(apiKeys);
    if (!apiKey) {
      warn(`sentinel skip: model=${model}, no apiKey available`);
      continue;
    }

    await createSentinel(apiKey, model);
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

async function createSentinel(apiKey: string, model: string): Promise<void> {
  const id = sentinelId(model);
  const cacheKey = crypto.randomBytes(16).toString("hex");
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
    return;
  }

  const now = Date.now();
  const estimatedTtl = getEstimatedTtlMs(model);
  const probeDelay = estimatedTtl * PROBE_FACTOR;

  sentinels.set(id, {
    apiKey,
    model,
    cacheKey,
    createdAt: now,
    creationHour: new Date().getUTCHours(),
    probeAt: now + probeDelay,
    probed: false,
  });
  log(`sentinel created: model=${model} estimatedTtl=${(estimatedTtl / 60000).toFixed(0)}min probeIn=${(probeDelay / 60000).toFixed(0)}min ${now - start}ms`);
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
    recordObservedTtl(sentinel.model, observedTtl);
    log(`sentinel alive: model=${sentinel.model} age=${(age / 60000).toFixed(0)}min hit=${result.hitTokens}/${result.totalTokens} observedTtl=${(observedTtl / 60000).toFixed(0)}min ${probeMs}ms`);
  } else {
    const observedTtl = age * DECREASE_FACTOR;
    recordObservedTtl(sentinel.model, observedTtl);
    warn(`sentinel dead: model=${sentinel.model} age=${(age / 60000).toFixed(0)}min hit=${result.hitTokens}/${result.totalTokens} observedTtl=${(observedTtl / 60000).toFixed(0)}min ${probeMs}ms`);
  }

  sentinels.delete(id);
}

export function getSentinelStatus(): { model: string; ageMs: number; probeInMs: number }[] {
  const now = Date.now();
  return [...sentinels.values()].map((s) => ({
    model: s.model,
    ageMs: now - s.createdAt,
    probeInMs: Math.max(0, s.probeAt - now),
  }));
}
