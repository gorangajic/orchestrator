import { Args, Command, Flags } from '@oclif/core';
import { findProjectRoot, getProjectPaths } from '../../lib/paths';
import { readConfig } from '../../lib/config';
import { updateState } from '../../lib/state-store';
import { createTask } from '../../lib/tasks';

function parseDeps(input?: string): number[] {
  if (!input) {
    return [];
  }
  return input
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export default class TaskAdd extends Command {
  static description = 'Add a new task to the queue';

  static args = {
    title: Args.string({ required: true, description: 'Task title' }),
  };

  static flags = {
    desc: Flags.string({ description: 'Task description' }),
    deps: Flags.string({ description: 'Comma-separated dependency task IDs' }),
    priority: Flags.integer({ description: 'Task priority (higher runs first)', default: 0 }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskAdd);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const config = await readConfig(paths.configPath);

    const deps = parseDeps(flags.deps);

    const result = await updateState(paths, config.stateBranch, 'Add task', (state) => {
      if (deps.length) {
        const knownIds = new Set(state.tasks.tasks.map((task) => task.id));
        const missing = deps.filter((depId) => !knownIds.has(depId));
        if (missing.length) {
          throw new Error(`Unknown dependency task IDs: ${missing.join(', ')}`);
        }
      }

      const task = createTask(state.tasks, {
        title: args.title,
        description: flags.desc,
        deps,
        priority: flags.priority,
      });

      const nextTasks = {
        lastId: task.id,
        tasks: [...state.tasks.tasks, task],
      };

      return {
        ...state,
        tasks: nextTasks,
      };
    });

    const newTask = result.state.tasks.tasks[result.state.tasks.tasks.length - 1];
    this.log(`Added task ${newTask.id}: ${newTask.title}`);
  }
}
