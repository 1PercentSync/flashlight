export function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [INFO] ${msg}`);
}

export function warn(msg: string): void {
  console.log(`[${new Date().toISOString()}] [WARN] ${msg}`);
}
