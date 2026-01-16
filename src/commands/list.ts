import { Command } from '@oclif/core';
import { findProjectRoot, getProjectPaths } from '../lib/paths';
import { readConfig } from '../lib/config';
import { readState } from '../lib/state-store';
import { isTaskReady, sortTasksForList } from '../lib/tasks';

export default class List extends Command {
  static description = 'List orchestrate tasks';

  async run(): Promise<void> {
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const config = await readConfig(paths.configPath);
    const state = await readState(paths, config.stateBranch);

    const tasks = sortTasksForList(state.tasks);
    if (tasks.length === 0) {
      this.log('No tasks yet.');
      return;
    }

    for (const task of tasks) {
      const meta: string[] = [];
      if (task.status === 'todo') {
        meta.push(isTaskReady(task, state.tasks) ? 'ready' : 'waiting');
      }
      if (task.deps?.length) {
        meta.push(`deps:${task.deps.join(',')}`);
      }
      if (task.owner) {
        meta.push(`owner:${task.owner}`);
      }
      const metaText = meta.length ? ` ${meta.join(' ')}` : '';
      this.log(`[${task.id}] ${task.status} p${task.priority} ${task.title}${metaText}`);
    }
  }
}
