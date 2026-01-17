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

export default class TaskDelete extends Command {
  static description = 'Delete a task and remove its worktree';

  static args = {
    id: Args.integer({ required: true, description: 'Task ID' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(TaskDelete);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const config = await readConfig(paths.configPath);

    let worktreeName: string | null = null;
    let taskTitle: string | null = null;

    const result = await updateState(paths, config.stateBranch, 'Delete task', (state) => {
      const task = state.tasks.tasks.find((item) => item.id === args.id);
      if (!task) {
        throw new Error(`Task ${args.id} not found.`);
      }

      const dependents = state.tasks.tasks.filter((item) => item.deps?.includes(args.id));
      if (dependents.length) {
        const ids = dependents.map((item) => item.id).join(', ');
        throw new Error(`Task ${args.id} is required by tasks: ${ids}`);
      }

      worktreeName = task.worktree ?? null;
      taskTitle = task.title;

      return {
        ...state,
        tasks: {
          ...state.tasks,
          tasks: state.tasks.tasks.filter((item) => item.id !== args.id),
        },
      };
    });

    if (!result.changed) {
      this.log(`Task ${args.id} was already deleted.`);
      return;
    }

    if (worktreeName) {
      const worktreePath = resolveWorktreePath(paths.root, worktreeName);
      await git(['worktree', 'remove', '--force', worktreePath], { gitDir: paths.bareDir });
    }

    const titleSuffix = taskTitle ? `: ${taskTitle}` : '';
    this.log(`Deleted task ${args.id}${titleSuffix}`);
  }
}
