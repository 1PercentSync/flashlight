export interface KeepaliveTask {
  id: string;
  workspaceId: string;
  shardId: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  registeredAt: number;
  lastQueryAt: number;
  lastKeepaliveAt: number;
}

const MAX_LIFETIME_MS = parseInt(process.env.MAX_LIFETIME_MS ?? "172800000", 10);

const tasks = new Map<string, KeepaliveTask>();

export function register(input: Omit<KeepaliveTask, "id" | "registeredAt" | "lastQueryAt" | "lastKeepaliveAt">): boolean {
  const id = `${input.workspaceId}:${input.shardId}`;
  const existing = tasks.get(id);
  const now = Date.now();

  if (existing) {
    existing.apiKey = input.apiKey;
    existing.model = input.model;
    existing.messages = input.messages;
    existing.lastQueryAt = now;
    return false;
  }

  tasks.set(id, {
    ...input,
    id,
    registeredAt: now,
    lastQueryAt: now,
    lastKeepaliveAt: now,
  });
  return true;
}

export function remove(id: string): void {
  tasks.delete(id);
}

export function getAll(): KeepaliveTask[] {
  return [...tasks.values()];
}

export function getExpired(): KeepaliveTask[] {
  const now = Date.now();
  return [...tasks.values()].filter(
    (t) => now - t.registeredAt > MAX_LIFETIME_MS,
  );
}
