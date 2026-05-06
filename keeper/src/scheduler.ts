import { getDue, getExpired, remove, degradeInterval, type KeepaliveTask } from "./store.js";
import { probe, activate } from "./probe.js";
import { log, warn } from "./log.js";

const CHECK_INTERVAL_MS = 60_000;

export function startScheduler(): void {
  setInterval(tick, CHECK_INTERVAL_MS);
  log("scheduler started");
}

async function tick(): Promise<void> {
  for (const task of getExpired()) {
    log(`task expired (48h): workspace=${task.workspaceId} shard=${task.shardId}`);
    remove(task.id);
  }

  const due = getDue();
  if (due.length === 0) return;

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
      log(`probe alive: workspace=${task.workspaceId} shard=${task.shardId} hitTokens=${probeResult.hitTokens}`);
      const actResult = await activate(task.apiKey, task.model, task.messages);
      log(`activation sent: workspace=${task.workspaceId} shard=${task.shardId} hit=${actResult.hitTokens}/${actResult.totalTokens}`);
      task.lastKeepaliveAt = Date.now();
    } else {
      const timeSinceLastAlive = Date.now() - task.lastKeepaliveAt;
      warn(`UNEXPECTED DEATH: workspace=${task.workspaceId} shard=${task.shardId} timeSinceLastAlive=${timeSinceLastAlive}ms, task removed, global interval → 3h`);
      remove(task.id);
      degradeInterval();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`task ${task.id} failed: ${msg}`);
  }
}
