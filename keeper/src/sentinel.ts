import crypto from "node:crypto";
import { probe, activate } from "./probe.js";
import { recordObservedTtl } from "./ttl.js";
import { log, warn } from "./log.js";

interface Sentinel {
  apiKey: string;
  model: string;
  cacheKey: string;
  activatedAt: number;
  lastProbeAt: number;
  lastAliveAge: number;
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

  sentinels.set(id, {
    apiKey,
    model,
    cacheKey,
    activatedAt: Date.now(),
    lastProbeAt: Date.now(),
    lastAliveAge: 0,
  });
  log(`sentinel created: ${id}`);
}

export async function probeAllSentinels(): Promise<void> {
  for (const [id, sentinel] of sentinels) {
    try {
      await probeSentinel(id, sentinel);
    } catch (err) {
      warn(`sentinel probe error (${id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function probeSentinel(id: string, sentinel: Sentinel): Promise<void> {
  const text = buildSentinelText(sentinel.cacheKey);
  const result = await probe(sentinel.apiKey, sentinel.model, text);
  const now = Date.now();
  const age = now - sentinel.activatedAt;

  sentinel.lastProbeAt = now;

  if (result.alive) {
    sentinel.lastAliveAge = age;
    log(`sentinel alive: ${id} age=${(age / 60000).toFixed(0)}min hit=${result.hitTokens}`);
  } else {
    const observedTtl = (sentinel.lastAliveAge + age) / 2;
    warn(`sentinel dead: ${id} age=${(age / 60000).toFixed(0)}min, lastAlive=${(sentinel.lastAliveAge / 60000).toFixed(0)}min, observedTtl=${(observedTtl / 60000).toFixed(0)}min`);

    recordObservedTtl(observedTtl);

    sentinels.delete(id);
    await createSentinel(sentinel.apiKey, sentinel.model);
  }
}

export function getSentinelStatus(): { id: string; apiKey: string; model: string; ageMs: number; alive: boolean }[] {
  const now = Date.now();
  return [...sentinels.entries()].map(([id, s]) => ({
    id,
    apiKey: `...${s.apiKey.slice(-4)}`,
    model: s.model,
    ageMs: now - s.activatedAt,
    alive: true,
  }));
}
