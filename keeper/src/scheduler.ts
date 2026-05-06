import { getAll, getExpired, remove, type KeepaliveTask } from "./store.js";
import { probe, activate } from "./probe.js";
import { reconcileSentinels, checkDueSentinels } from "./sentinel.js";
import { getActivationIntervalMs } from "./ttl.js";
import { log, warn } from "./log.js";

const TICK_INTERVAL_MS = 60_000;

let unexpectedDeaths = 0;

export function startScheduler(): void {
  scheduleNext();
  log("scheduler started");
}

function scheduleNext(): void {
  setTimeout(async () => {
    await tick();
    scheduleNext();
  }, TICK_INTERVAL_MS);
}

async function tick(): Promise<void> {
  try {
    // Collect active (model → apiKeys) from tasks
    const activeModels = new Map<string, string[]>();
    for (const task of getAll()) {
      if (!activeModels.has(task.model)) activeModels.set(task.model, []);
      const keys = activeModels.get(task.model)!;
      if (!keys.includes(task.apiKey)) keys.push(task.apiKey);
    }

    await reconcileSentinels(activeModels);
    await checkDueSentinels();
  } catch (err) {
    warn(`sentinel error: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const task of getExpired()) {
    log(`task expired (48h): workspace=${task.workspaceId} shard=${task.shardId}`);
    remove(task.id);
  }

  const now = Date.now();
  for (const task of getAll()) {
    const intervalMs = getActivationIntervalMs(task.model);
    if (now - task.lastKeepaliveAt >= intervalMs) {
      await processTask(task);
    }
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
