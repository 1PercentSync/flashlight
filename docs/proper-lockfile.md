# proper-lockfile

Version: ^4.1.2

Inter-process lockfile utility using `mkdir` strategy (works on network FS). Used to protect `.flashlight/` directory access.

---

## Lock and Release

```typescript
import lockfile from "proper-lockfile";

const release = await lockfile.lock("some/file-or-dir", {
  retries: { retries: 3, minTimeout: 100 },
});

try {
  // Do work while locked
} finally {
  await release();
}
```

---

## Unlock by Path

When you can't keep the `release` reference:

```typescript
import lockfile from "proper-lockfile";

await lockfile.lock("some/file");
// ... later
await lockfile.unlock("some/file");
```

---

## Check Lock Status

```typescript
const isLocked = await lockfile.check("some/file");
```

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `stale` | `10000` | ms before lock considered stale (min: 5000) |
| `update` | `stale/2` | ms between mtime updates (min: 1000) |
| `retries` | `0` | Retry count or `retry` options object |
| `realpath` | `true` | Resolve symlinks (file must exist if true) |
| `lockfilePath` | auto | Custom lockfile path (e.g. `dir/dir.lock`) |
| `onCompromised` | throws | Called if lock gets compromised |

---

## Locking a Directory

To lock a directory and place the lockfile inside it:

```typescript
await lockfile.lock(".flashlight", {
  lockfilePath: ".flashlight/dir.lock",
  stale: 10000,
  retries: { retries: 5, minTimeout: 200 },
});
```

---

## Key Points

- Uses `mkdir` atomically — safe on NFS and network FS
- Auto-removes locks on graceful process exit
- Does NOT survive SIGKILL or VM fatal errors
- Lock is a `.lock` suffixed directory by default
- ESM import: this package is CJS, use `import lockfile from "proper-lockfile"` with `esModuleInterop: true`
