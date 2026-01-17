import path from 'path';
import { Args, Command } from '@oclif/core';
import { findProjectRoot, getProjectPaths } from '../../lib/paths';
import { readConfig } from '../../lib/config';
import { updateState } from '../../lib/state-store';
import { git } from '../../lib/git';

function resolveWorktreePath(root: string, worktree: string): string {
  const rootPath = path.resolve(root);
  const worktreePath = path.resolve(root, worktree);
  if (worktreePath === rootPath || !worktreePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Refusing to remove worktree outside workspace: ${worktree}`);
  }
  return worktreePath;
}

export default class TaskRemove extends Command {
  static description = 'Remove a task worktree without deleting the task';

  static args = {
    id: Args.integer({ required: true, description: 'Task ID' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TaskRemove);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const config = await readConfig(paths.configPath);

    let worktreeName: string | null = null;
    let taskTitle: string | null = null;

    const result = await updateState(paths, config.stateBranch, 'Remove task worktree', (state) => {
      const task = state.tasks.tasks.find((item) => item.id === args.id);
      if (!task) {
        throw new Error(`Task ${args.id} not found.`);
      }
      if (!task.worktree) {
        throw new Error(`Task ${args.id} has no worktree to remove.`);
      }

      worktreeName = task.worktree;
      taskTitle = task.title;
      const now = new Date().toISOString();

      return {
        ...state,
        tasks: {
          ...state.tasks,
          tasks: state.tasks.tasks.map((item) => {
            if (item.id !== args.id) {
              return item;
            }
            return {
              ...item,
              worktree: undefined,
              updatedAt: now,
            };
          }),
        },
      };
    });

    if (!result.changed) {
      this.log(`Task ${args.id} has no worktree to remove.`);
      return;
    }

    if (!worktreeName) {
      throw new Error('Failed to identify worktree for removal.');
    }

    const worktreePath = resolveWorktreePath(paths.root, worktreeName);
    await git(['worktree', 'remove', '--force', worktreePath], { gitDir: paths.bareDir });

    const titleSuffix = taskTitle ? `: ${taskTitle}` : '';
    this.log(`Removed worktree for task ${args.id}${titleSuffix}`);
  }
}
