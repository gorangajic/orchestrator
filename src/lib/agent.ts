import fs from 'fs';
import fsPromises from 'fs/promises';
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

export interface AgentInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  shell: boolean;
}

export interface AgentStartResult {
  pid: number;
  startedAt: string;
  logPath: string;
  runId: string;
  command: string;
  args: string[];
  cwd: string;
}

function buildAgentInvocation(
  agentName: string,
  worktreePath: string,
  taskPath: string,
  config: OrchestrateConfig,
  task?: Task,
  defaultPrompt?: string,
  extraEnv: Record<string, string> = {},
): AgentInvocation {
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
    ...extraEnv,
  };
  const cwd = agentConfig?.cwd
    ? path.resolve(worktreePath, interpolate(agentConfig.cwd, replacements))
    : worktreePath;
  const shell = agentConfig?.shell ?? false;

  return { command, args, env, cwd, shell };
}

export async function runAgent(
  agentName: string,
  worktreePath: string,
  taskPath: string,
  config: OrchestrateConfig,
  task?: Task,
  defaultPrompt?: string,
): Promise<void> {
  const invocation = buildAgentInvocation(
    agentName,
    worktreePath,
    taskPath,
    config,
    task,
    defaultPrompt,
  );

  await execa(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    shell: invocation.shell,
    stdio: 'inherit',
  });
}

export async function startAgentInBackground(
  agentName: string,
  worktreePath: string,
  taskPath: string,
  config: OrchestrateConfig,
  runId: string,
  logPath: string,
  task?: Task,
  defaultPrompt?: string,
): Promise<AgentStartResult> {
  const startedAt = new Date().toISOString();
  const invocation = buildAgentInvocation(
    agentName,
    worktreePath,
    taskPath,
    config,
    task,
    defaultPrompt,
    {
      ORCHESTRATE_RUN_ID: runId,
      ORCHESTRATE_LOG_PATH: logPath,
      ORCHESTRATE_AGENT_NAME: agentName,
      ORCHESTRATE_WORKTREE_PATH: worktreePath,
    },
  );

  await fsPromises.mkdir(path.dirname(logPath), { recursive: true });
  const header = `[${startedAt}] start ${invocation.command} ${invocation.args.join(' ')}\n`;
  await fsPromises.appendFile(logPath, header, 'utf8');

  const logFd = fs.openSync(logPath, 'a');
  try {
    const child = execa(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: invocation.shell,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    child.catch(() => undefined);

    if (!child.pid) {
      throw new Error('Failed to start background agent.');
    }

    return {
      pid: child.pid,
      startedAt,
      logPath,
      runId,
      command: invocation.command,
      args: invocation.args,
      cwd: invocation.cwd,
    };
  } finally {
    fs.closeSync(logFd);
  }
}
