import { getAll, getExpired, remove, type KeepaliveTask } from "./store.js";
import { probe, activate } from "./probe.js";
import { probeAllSentinels } from "./sentinel.js";
import { getActivationIntervalMs } from "./ttl.js";
import { log, warn } from "./log.js";

const SENTINEL_PROBE_INTERVAL_MS = 30 * 60_000; // 30 min
const TASK_CHECK_INTERVAL_MS = 60_000; // 1 min

let unexpectedDeaths = 0;

export function startScheduler(): void {
  setInterval(sentinelTick, SENTINEL_PROBE_INTERVAL_MS);
  setInterval(taskTick, TASK_CHECK_INTERVAL_MS);
  log("scheduler started");
}

async function sentinelTick(): Promise<void> {
  try {
    await probeAllSentinels();
  } catch (err) {
    warn(`sentinel tick error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function taskTick(): Promise<void> {
  for (const task of getExpired()) {
    log(`task expired (48h): workspace=${task.workspaceId} shard=${task.shardId}`);
    remove(task.id);
  }

  const intervalMs = getActivationIntervalMs();
  const now = Date.now();
  const due = getAll().filter((t) => now - t.lastKeepaliveAt >= intervalMs);

  for (const task of due) {
    await processTask(task);
  }
}

async function processTask(task: KeepaliveTask): Promise<void> {
  try {
    const firstTurnText = task.messages[0]?.content;
    if (!firstTurnText) {
      warn(`task ${task.id} has no messages, removing`);
      remove(task.id);
      return;
    }

    const probeResult = await probe(task.apiKey, task.model, firstTurnText);

    if (probeResult.alive) {
      log(`probe alive: workspace=${task.workspaceId} shard=${task.shardId} hit=${probeResult.hitTokens}`);
      const actResult = await activate(task.apiKey, task.model, task.messages);
      log(`activation sent: workspace=${task.workspaceId} shard=${task.shardId} hit=${actResult.hitTokens}/${actResult.totalTokens}`);
      task.lastKeepaliveAt = Date.now();
    } else {
      const timeSince = Date.now() - task.lastKeepaliveAt;
      warn(`UNEXPECTED DEATH: workspace=${task.workspaceId} shard=${task.shardId} timeSinceLastAlive=${timeSince}ms, task removed`);
      remove(task.id);
      unexpectedDeaths++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`task ${task.id} failed: ${msg}`);
  }
}

export function getUnexpectedDeaths(): number {
  return unexpectedDeaths;
}
