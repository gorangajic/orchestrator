import fs from 'fs';
import path from 'path';
import execa from 'execa';
import { SetupConfig } from './config';

export async function runSetup(
  setup: SetupConfig,
  worktreePath: string,
  logsDir: string,
  taskId: number,
): Promise<void> {
  const logPath = path.join(logsDir, `task-${taskId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const commands = Array.isArray(setup.command) ? setup.command : [setup.command];
  const cwd = setup.cwd ? path.resolve(worktreePath, setup.cwd) : worktreePath;
  const env = { ...process.env, ...(setup.env ?? {}) };
  const timeout = setup.timeoutSeconds ? setup.timeoutSeconds * 1000 : undefined;

  const runCommand = async (command: string) => {
    logStream.write(`\n$ ${command}\n`);
    const child = execa.command(command, {
      cwd,
      env,
      timeout,
      shell: setup.shell ?? false,
    });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    await child;
  };

  try {
    for (const command of commands) {
      await runCommand(command);
    }
  } finally {
    logStream.end();
  }
}
