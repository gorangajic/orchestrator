import path from 'path';
import execa from 'execa';
import { OrchestrateConfig } from './config';
import { Task } from './tasks';

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
}

function interpolateEnv(env: Record<string, string>, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, interpolate(value, values)]),
  );
}

export async function runAgent(
  agentName: string,
  worktreePath: string,
  taskPath: string,
  config: OrchestrateConfig,
  task?: Task,
  defaultPrompt?: string,
): Promise<void> {
  const agentConfig = config.agents?.[agentName];
  const command = agentConfig?.command ?? agentName;
  const replacements: Record<string, string> = {
    taskPath,
    taskFile: path.basename(taskPath),
    worktreePath,
    taskId: task ? String(task.id) : '',
    taskTitle: task?.title ?? '',
    taskBranch: task?.branch ?? '',
  };
  const prompt = agentConfig?.prompt ?? defaultPrompt;
  const args = agentConfig?.args
    ? agentConfig.args.map((arg) => interpolate(arg, replacements))
    : prompt
      ? [interpolate(prompt, replacements)]
      : [];
  const env = {
    ...process.env,
    ORCHESTRATE_TASK_PATH: taskPath,
    ...(agentConfig?.env ? interpolateEnv(agentConfig.env, replacements) : {}),
  };
  const cwd = agentConfig?.cwd
    ? path.resolve(worktreePath, interpolate(agentConfig.cwd, replacements))
    : worktreePath;

  await execa(command, args, {
    cwd,
    env,
    shell: agentConfig?.shell ?? false,
    stdio: 'inherit',
  });
}
