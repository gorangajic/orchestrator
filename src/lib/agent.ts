import path from 'path';
import execa from 'execa';
import { OrchestrateConfig } from './config';

export async function runAgent(
  agentName: string,
  worktreePath: string,
  taskPath: string,
  config: OrchestrateConfig,
): Promise<void> {
  const agentConfig = config.agents?.[agentName];
  const command = agentConfig?.command ?? agentName;
  const args = agentConfig?.args ?? [];
  const env = {
    ...process.env,
    ORCHESTRATE_TASK_PATH: taskPath,
    ...(agentConfig?.env ?? {}),
  };
  const cwd = agentConfig?.cwd ? path.resolve(worktreePath, agentConfig.cwd) : worktreePath;

  await execa(command, args, {
    cwd,
    env,
    shell: agentConfig?.shell ?? false,
    stdio: 'inherit',
  });
}
