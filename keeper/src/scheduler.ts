import { getAll, getExpired, remove, type KeepaliveTask } from "./store.js";
import { probe, activate } from "./probe.js";
import { reconcileSentinels, checkDueSentinels, getSentinelStatus } from "./sentinel.js";
import { getActivationIntervalMs } from "./ttl.js";
import { log, warn } from "./log.js";

const TICK_INTERVAL_MS = 60_000;

let unexpectedDeaths = 0;
let tickCount = 0;

export function startScheduler(): void {
  scheduleNext();
  log("scheduler started, tick interval=60s");
}

function scheduleNext(): void {
  setTimeout(async () => {
    await tick();
    scheduleNext();
  }, TICK_INTERVAL_MS);
}

async function tick(): Promise<void> {
  tickCount++;
  const tickStart = Date.now();
  const tasks = getAll();

  try {
    const apiKeys = [...new Set(tasks.map((t) => t.apiKey))];
    await reconcileSentinels(apiKeys);
    await checkDueSentinels();
  } catch (err) {
    warn(`sentinel error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const expired = getExpired();
  for (const task of expired) {
    log(`task expired (48h): workspace=${task.workspaceId} shard=${task.shardId} age=${((Date.now() - task.registeredAt) / 3600000).toFixed(1)}h`);
    remove(task.id);
  }

  const now = Date.now();
  let activatedCount = 0;
  for (const task of getAll()) {
    const intervalMs = getActivationIntervalMs(task.model);
    if (now - task.lastKeepaliveAt >= intervalMs) {
      await processTask(task);
      activatedCount++;
    }
  }

  const elapsed = Date.now() - tickStart;
  if (activatedCount > 0 || expired.length > 0 || tickCount % 60 === 0) {
    const sentinelInfo = getSentinelStatus().map(
      (s) => `${s.model} age=${(s.ageMs / 60000).toFixed(0)}min probeIn=${(s.probeInMs / 60000).toFixed(0)}min`,
    ).join("; ") || "none";
    log(`tick #${tickCount}: ${tasks.length} tasks, ${activatedCount} activated, ${expired.length} expired, ${elapsed}ms | sentinel: ${sentinelInfo}`);
  }
}

async function processTask(task: KeepaliveTask): Promise<void> {
  const intervalMs = getActivationIntervalMs(task.model);
  const overdue = Date.now() - task.lastKeepaliveAt - intervalMs;
  log(`task due: workspace=${task.workspaceId} shard=${task.shardId} model=${task.model} overdue=${(overdue / 60000).toFixed(0)}min interval=${(intervalMs / 60000).toFixed(0)}min`);

  try {
    const firstTurnText = task.messages[0]?.content;
    if (!firstTurnText) {
      warn(`task ${task.id} has no messages, removing`);
      remove(task.id);
      return;
    }

    const probeStart = Date.now();
    const probeResult = await probe(task.apiKey, task.model, firstTurnText);
    const probeMs = Date.now() - probeStart;

    if (probeResult.alive) {
      log(`probe alive: workspace=${task.workspaceId} shard=${task.shardId} hit=${probeResult.hitTokens}/${probeResult.totalTokens} ${probeMs}ms`);
      const actStart = Date.now();
      const actResult = await activate(task.apiKey, task.model, task.messages);
      const actMs = Date.now() - actStart;
      log(`activation sent: workspace=${task.workspaceId} shard=${task.shardId} hit=${actResult.hitTokens}/${actResult.totalTokens} ${actMs}ms`);
      task.lastKeepaliveAt = Date.now();
    } else {
      const timeSince = Date.now() - task.lastKeepaliveAt;
      warn(`UNEXPECTED DEATH: workspace=${task.workspaceId} shard=${task.shardId} model=${task.model} timeSinceLastAlive=${(timeSince / 60000).toFixed(0)}min probeTokens=${probeResult.totalTokens} ${probeMs}ms, task removed`);
      remove(task.id);
      unexpectedDeaths++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`task ${task.id} activation failed: ${msg}`);
  }
}

export function getUnexpectedDeaths(): number {
  return unexpectedDeaths;
}
