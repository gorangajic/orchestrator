import fs from 'fs/promises';

export interface LockOptions {
  retries?: number;
  delayMs?: number;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withLock<T>(lockPath: string, fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const retries = options.retries ?? 50;
  const delayMs = options.delayMs ?? 200;
  let handle: fs.FileHandle | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      break;
    } catch (error: any) {
      if (error?.code !== 'EEXIST' || attempt === retries) {
        throw error;
      }
      await sleep(delayMs);
    }
  }

  if (!handle) {
    throw new Error('Failed to acquire lock');
  }

  try {
    return await fn();
  } finally {
    await handle.close();
    await fs.rm(lockPath, { force: true });
  }
}
