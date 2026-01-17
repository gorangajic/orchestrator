import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Command, Flags } from '@oclif/core';
import { ensureProjectDirs, findProjectRoot, getProjectPaths } from '../lib/paths';
import { readConfig } from '../lib/config';
import { updateState } from '../lib/state-store';
import { isTaskReady, selectNextTask, taskSlug, Task } from '../lib/tasks';
import { git } from '../lib/git';
import { renderTaskMarkdown } from '../lib/templates';
import { runSetup } from '../lib/setup';
import { runAgent, startAgentInBackground } from '../lib/agent';
import { createRunId, registerAgentRun } from '../lib/agent-runs';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function refExists(gitDir: string, ref: string): Promise<boolean> {
  try {
    await git(['show-ref', '--verify', '--quiet', ref], { gitDir });
    return true;
  } catch (error: any) {
    if (error?.exitCode === 1) {
      return false;
    }
    throw error;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOriginWithRetry(gitDir: string, attempts = 3, delayMs = 500): Promise<void> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await git(['fetch', '--prune', 'origin'], { gitDir });
      return;
    } catch (error: any) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
      }
    }
  }
  const details = typeof lastError?.stderr === 'string' && lastError.stderr.trim()
    ? lastError.stderr.trim().split('\n').slice(-1)[0]
    : lastError?.message;
  const suffix = details ? ` (${details})` : '';
  throw new Error(`Failed to fetch origin after ${attempts} attempts${suffix}`);
}

export default class Next extends Command {
  static description = 'Claim the next eligible task and prepare a worktree';

  static flags = {
    agent: Flags.string({ description: 'Agent runner to launch (codex|claude|opencode)' }),
    run: Flags.boolean({ description: 'Run the selected agent after setup (background by default)' }),
    foreground: Flags.boolean({ description: 'Run the selected agent in the foreground' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Next);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    ensureProjectDirs(paths);
    const config = await readConfig(paths.configPath);

    if (flags.run && !flags.agent) {
      throw new Error('Use --agent with --run to launch an agent.');
    }
    if (flags.foreground && !flags.run) {
      throw new Error('Use --run with --foreground to launch an agent.');
    }

    let claimedId: number | null = null;

    const result = await updateState(paths, config.stateBranch, 'Claim task', (state) => {
      const candidate = selectNextTask(state.tasks);
      if (!candidate) {
        return state;
      }
      if (!isTaskReady(candidate, state.tasks)) {
        return state;
      }

      claimedId = candidate.id;
      const slug = taskSlug(candidate.title);
      const branch = `task/${candidate.id}-${slug}`;
      const worktreeName = `task-${candidate.id}`;

      return {
        ...state,
        tasks: {
          ...state.tasks,
          tasks: state.tasks.tasks.map((task) => {
            if (task.id !== candidate.id) {
              return task;
            }
            const now = new Date().toISOString();
            const owner = `${os.userInfo().username}@${os.hostname()}`;
            return {
              ...task,
              status: 'in_progress',
              owner,
              branch,
              worktree: worktreeName,
              updatedAt: now,
              startedAt: now,
            };
          }),
        },
      };
    });

    if (!result.changed) {
      this.log('No eligible tasks to claim.');
      return;
    }

    const state = result.state;
    const task = claimedId
      ? state.tasks.tasks.find((item) => item.id === claimedId) ?? null
      : null;
    if (!task) {
      throw new Error('Failed to identify claimed task.');
    }

    if (!task.branch || !task.worktree) {
      throw new Error('Claimed task is missing branch/worktree metadata.');
    }

    const worktreePath = path.join(paths.root, task.worktree);
    const branchRef = `refs/heads/${task.branch}`;

    if (await pathExists(worktreePath)) {
      throw new Error(`Worktree already exists at ${worktreePath}`);
    }
    if (await refExists(paths.bareDir, branchRef)) {
      throw new Error(`Branch already exists: ${task.branch}`);
    }

    await fetchOriginWithRetry(paths.bareDir);
    const normalizedDefault = config.defaultBranch.startsWith('origin/')
      ? config.defaultBranch.slice('origin/'.length)
      : config.defaultBranch;
    const hasRemoteDefault = await refExists(paths.bareDir, `refs/remotes/origin/${normalizedDefault}`);
    const hasLocalDefault = await refExists(paths.bareDir, `refs/heads/${normalizedDefault}`);
    const startPoint = hasRemoteDefault
      ? `origin/${normalizedDefault}`
      : hasLocalDefault
        ? normalizedDefault
        : normalizedDefault;
    await git(
      ['worktree', 'add', '-b', task.branch, worktreePath, startPoint],
      { gitDir: paths.bareDir },
    );

    const taskPath = path.join(worktreePath, 'TASK.md');
    const taskMarkdown = renderTaskMarkdown(task, state.plan, state.tasks);
    await fs.writeFile(taskPath, taskMarkdown, 'utf8');

    if (config.setup) {
      await runSetup(config.setup, worktreePath, paths.logsDir, task.id);
    }

    if (flags.run && flags.agent) {
      const defaultPrompt =
        flags.agent === 'codex'
          ? 'Look into {taskFile}, please complete it and mark the status as done when completed.'
          : undefined;

      if (flags.foreground) {
        await runAgent(flags.agent, worktreePath, taskPath, config, task, defaultPrompt);
      } else {
        const runId = createRunId(task.id);
        const logPath = path.join(paths.logsDir, `task-${task.id}.agent.log`);
        const run = await startAgentInBackground(
          flags.agent,
          worktreePath,
          taskPath,
          config,
          runId,
          logPath,
          task,
          defaultPrompt,
        );
        await registerAgentRun(paths, {
          id: runId,
          taskId: task.id,
          agent: flags.agent,
          pid: run.pid,
          startedAt: run.startedAt,
          worktreePath,
          taskPath,
          logPath,
          command: run.command,
          args: run.args,
          cwd: run.cwd,
        });
        this.log(`Started ${flags.agent} in background (pid ${run.pid}). Logs: ${logPath}`);
      }
    }

    this.log(`Claimed task ${task.id} in ${task.worktree}`);
  }
}
