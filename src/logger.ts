export function info(msg: string): void {
  process.stderr.write(`[flashlight] ${msg}\n`);
}

export function warn(msg: string): void {
  process.stderr.write(`[flashlight] WARN: ${msg}\n`);
}

export function error(msg: string): void {
  process.stderr.write(`[flashlight] ERROR: ${msg}\n`);
}

export function logCacheResult(opts: {
  type: "probe" | "query" | "activation";
  totalTokens: number;
  predictedHit: number;
  actualHit: number;
}): void {
  const match = opts.predictedHit === opts.actualHit;
  const msg = `cache ${opts.type}: total=${opts.totalTokens} predicted_hit=${opts.predictedHit} actual_hit=${opts.actualHit}`;
  if (match) {
    info(msg);
  } else {
    warn(msg + " MISMATCH");
  }
}
