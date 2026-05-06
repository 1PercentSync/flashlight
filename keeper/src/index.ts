import http from "node:http";
import { register, remove, getAll } from "./store.js";
import { probe, activate } from "./probe.js";
import { startScheduler, getUnexpectedDeaths } from "./scheduler.js";
import { getSentinelStatus } from "./sentinel.js";
import { loadTtlEstimate, getTtlState } from "./ttl.js";
import { log, warn } from "./log.js";

const PORT = parseInt(process.env.PORT ?? "3100", 10);
const ENABLE_REFRESH = process.env.ENABLE_REFRESH === "true";

interface RequestBody {
  workspaceId: string;
  shardId: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
}

function parseBody(req: http.IncomingMessage): Promise<RequestBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "POST" && path === "/register") {
      const body = await parseBody(req);
      const created = register(body);
      log(`task registered: workspace=${body.workspaceId} shard=${body.shardId}`);
      json(res, created ? 201 : 200, { ok: true, created });
      return;
    }

    if (req.method === "POST" && path === "/refresh") {
      if (!ENABLE_REFRESH) {
        json(res, 404, { error: "refresh endpoint disabled" });
        return;
      }

      const body = await parseBody(req);
      const logs: string[] = [];
      logs.push(`refresh start: workspace=${body.workspaceId} shard=${body.shardId}`);

      const firstTurnText = body.messages[0]?.content;
      if (!firstTurnText) {
        logs.push("error: no messages provided");
        json(res, 400, { logs });
        return;
      }

      logs.push("probing cache...");
      const probeResult = await probe(body.apiKey, body.model, firstTurnText);
      logs.push(`probe result: alive=${probeResult.alive} hitTokens=${probeResult.hitTokens} totalTokens=${probeResult.totalTokens}`);

      if (probeResult.alive) {
        logs.push("sending activation...");
        const actResult = await activate(body.apiKey, body.model, body.messages);
        logs.push(`activation done: hitTokens=${actResult.hitTokens} totalTokens=${actResult.totalTokens}`);
      } else {
        logs.push("cache dead, skipping activation");
      }

      logs.push("refresh complete");
      json(res, 200, { logs });
      return;
    }

    if (req.method === "GET" && path === "/status") {
      const tasks = getAll().map((t) => ({
        id: t.id,
        workspaceId: t.workspaceId,
        shardId: t.shardId,
        apiKey: `...${t.apiKey.slice(-4)}`,
        model: t.model,
        registeredAt: t.registeredAt,
        lastQueryAt: t.lastQueryAt,
        lastKeepaliveAt: t.lastKeepaliveAt,
      }));

      json(res, 200, {
        tasks,
        totalTasks: tasks.length,
        ttlEstimate: getTtlState(),
        sentinels: getSentinelStatus(),
        unexpectedDeaths: getUnexpectedDeaths(),
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      });
      return;
    }

    if (req.method === "DELETE" && path.startsWith("/tasks/")) {
      const parts = path.slice(7).split("/");
      const workspaceId = decodeURIComponent(parts[0]);
      const shardId = parts[1] ? decodeURIComponent(parts[1]) : undefined;

      if (shardId) {
        remove(`${workspaceId}:${shardId}`);
        log(`task removed: workspace=${workspaceId} shard=${shardId}`);
      } else {
        for (const task of getAll()) {
          if (task.workspaceId === workspaceId) {
            remove(task.id);
            log(`task removed: workspace=${workspaceId} shard=${task.shardId}`);
          }
        }
      }
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`request error: ${msg}`);
    json(res, 500, { error: msg });
  }
});

loadTtlEstimate();

server.listen(PORT, "0.0.0.0", () => {
  log(`keeper listening on 0.0.0.0:${PORT}`);
  log(`refresh endpoint: ${ENABLE_REFRESH ? "enabled" : "disabled"}`);
  startScheduler();
});
