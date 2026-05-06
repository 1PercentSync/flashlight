import crypto from "node:crypto";
import { probe, activate } from "./probe.js";
import { recordObservedTtl, getActivationIntervalMs } from "./ttl.js";
import { log, warn } from "./log.js";

const SAFETY_FACTOR = 0.8;
const PROBE_FACTOR = 0.95;
const INCREASE_FACTOR = 1.05;
const DECREASE_FACTOR = 0.8;

interface Sentinel {
  apiKey: string;
  model: string;
  cacheKey: string;
  createdAt: number;
  probeAt: number;
  probed: boolean;
}

const sentinels = new Map<string, Sentinel>();

function sentinelId(apiKey: string, model: string): string {
  return `${apiKey.slice(-8)}:${model}`;
}

function buildSentinelText(cacheKey: string): string {
  return `${cacheKey},sentinel cache probe token`;
}

export async function ensureSentinel(apiKey: string, model: string): Promise<void> {
  const id = sentinelId(apiKey, model);
  if (sentinels.has(id)) return;
  await createSentinel(apiKey, model);
}

async function createSentinel(apiKey: string, model: string): Promise<void> {
  const id = sentinelId(apiKey, model);
  const cacheKey = crypto.randomBytes(16).toString("hex");
  const text = buildSentinelText(cacheKey);

  try {
    await activate(apiKey, model, [
      { role: "user", content: text },
      { role: "user", content: "OK" },
    ]);
  } catch (err) {
    warn(`sentinel creation failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const now = Date.now();
  const estimatedTtl = getActivationIntervalMs() / SAFETY_FACTOR;
  const probeDelay = estimatedTtl * PROBE_FACTOR;

  sentinels.set(id, {
    apiKey,
    model,
    cacheKey,
    createdAt: now,
    probeAt: now + probeDelay,
    probed: false,
  });
  log(`sentinel created: ${id}, probe scheduled at +${(probeDelay / 60000).toFixed(0)}min`);
}

export async function checkSentinels(): Promise<void> {
  const now = Date.now();
  for (const [id, sentinel] of sentinels) {
    if (sentinel.probed || now < sentinel.probeAt) continue;
    try {
      await probeSentinel(id, sentinel);
    } catch (err) {
      warn(`sentinel probe error (${id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function probeSentinel(id: string, sentinel: Sentinel): Promise<void> {
  sentinel.probed = true;
  const text = buildSentinelText(sentinel.cacheKey);
  const result = await probe(sentinel.apiKey, sentinel.model, text);
  const age = Date.now() - sentinel.createdAt;

  if (result.alive) {
    const adjustedTtl = age * INCREASE_FACTOR;
    recordObservedTtl(adjustedTtl);
    log(`sentinel alive: ${id} age=${(age / 60000).toFixed(0)}min → TTL estimate increased`);
  } else {
    const adjustedTtl = age * DECREASE_FACTOR;
    recordObservedTtl(adjustedTtl);
    warn(`sentinel dead: ${id} age=${(age / 60000).toFixed(0)}min → TTL estimate decreased`);
  }

  sentinels.delete(id);
  await createSentinel(sentinel.apiKey, sentinel.model);
}

export function getSentinelStatus(): { id: string; apiKey: string; model: string; ageMs: number; probeInMs: number }[] {
  const now = Date.now();
  return [...sentinels.entries()].map(([id, s]) => ({
    id,
    apiKey: `...${s.apiKey.slice(-4)}`,
    model: s.model,
    ageMs: now - s.createdAt,
    probeInMs: Math.max(0, s.probeAt - now),
  }));
}
