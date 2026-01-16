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
import { runAgent } from '../lib/agent';

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

export default class Next extends Command {
  static description = 'Claim the next eligible task and prepare a worktree';

  static flags = {
    agent: Flags.string({ description: 'Agent runner to launch (codex|claude|opencode)' }),
    run: Flags.boolean({ description: 'Run the selected agent after setup' }),
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

    const normalizedDefault = config.defaultBranch.startsWith('origin/')
      ? config.defaultBranch.slice('origin/'.length)
      : config.defaultBranch;
    const hasLocalDefault = await refExists(paths.bareDir, `refs/heads/${normalizedDefault}`);
    const hasRemoteDefault = await refExists(paths.bareDir, `refs/remotes/origin/${normalizedDefault}`);
    const startPoint = hasLocalDefault
      ? normalizedDefault
      : hasRemoteDefault
        ? `origin/${normalizedDefault}`
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
      await runAgent(flags.agent, worktreePath, taskPath, config, task, defaultPrompt);
    }

    this.log(`Claimed task ${task.id} in ${task.worktree}`);
  }
}
