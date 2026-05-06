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

function buildSentinelText(cacheKey: string): string {
  return `${cacheKey},sentinel cache probe token`;
}

export function getApiKeyForSentinel(taskApiKeys: string[]): string {
  if (SENTINEL_API_KEY) return SENTINEL_API_KEY;
  if (taskApiKeys.length === 0) return "";
  return taskApiKeys[Math.floor(Math.random() * taskApiKeys.length)];
}

export async function reconcileSentinels(activeModels: Map<string, string[]>): Promise<void> {
  // activeModels: model → [apiKeys from active tasks]

  // Remove sentinels for models with no active tasks
  for (const [id] of sentinels) {
    if (!activeModels.has(id)) {
      sentinels.delete(id);
      log(`sentinel removed (no active tasks): ${id}`);
    }
  }

  // Create sentinels for models that need one
  for (const [model, apiKeys] of activeModels) {
    const id = sentinelId(model);
    const existing = sentinels.get(id);
    if (existing && !existing.probed) continue; // active sentinel exists, not yet probed

    const apiKey = getApiKeyForSentinel(apiKeys);
    if (!apiKey) continue;

    await createSentinel(apiKey, model);
  }
}

export async function checkDueSentinels(): Promise<void> {
  const now = Date.now();
  for (const [id, sentinel] of sentinels) {
    if (sentinel.probed || now < sentinel.probeAt) continue;
    await probeSentinel(id, sentinel);
  }
}

async function createSentinel(apiKey: string, model: string): Promise<void> {
  const id = sentinelId(model);
  const cacheKey = crypto.randomBytes(16).toString("hex");
  const text = buildSentinelText(cacheKey);

  try {
    await activate(apiKey, model, [
      { role: "user", content: text },
      { role: "user", content: "OK" },
    ]);
  } catch (err) {
    warn(`sentinel creation failed (${model}): ${err instanceof Error ? err.message : String(err)}`);
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
  log(`sentinel created: ${model}, probe in ${(probeDelay / 60000).toFixed(0)}min`);
}

async function probeSentinel(id: string, sentinel: Sentinel): Promise<void> {
  sentinel.probed = true;
  const text = buildSentinelText(sentinel.cacheKey);
  const result = await probe(sentinel.apiKey, sentinel.model, text);
  const age = Date.now() - sentinel.createdAt;

  if (result.alive) {
    const observedTtl = age * INCREASE_FACTOR;
    recordObservedTtl(sentinel.model, observedTtl);
    log(`sentinel alive: ${sentinel.model} age=${(age / 60000).toFixed(0)}min → TTL up`);
  } else {
    const observedTtl = age * DECREASE_FACTOR;
    recordObservedTtl(sentinel.model, observedTtl);
    warn(`sentinel dead: ${sentinel.model} age=${(age / 60000).toFixed(0)}min → TTL down`);
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
