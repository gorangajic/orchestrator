import { Command } from '@oclif/core';
import { findProjectRoot, getProjectPaths } from '../../lib/paths';
import { readConfig } from '../../lib/config';
import { readState } from '../../lib/state-store';
import { listAgentRuns } from '../../lib/agent-runs';

export default class AgentList extends Command {
  static description = 'List local agent runs';

  async run(): Promise<void> {
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const config = await readConfig(paths.configPath);
    const state = await readState(paths, config.stateBranch);
    const runs = await listAgentRuns(paths);

    if (runs.length === 0) {
      this.log('No agent runs recorded.');
      return;
    }

    const tasksById = new Map(state.tasks.tasks.map((task) => [task.id, task]));
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    for (const run of runs) {
      const task = tasksById.get(run.taskId);
      const title = task?.title ?? 'Unknown task';
      const status = run.running ? 'running' : 'stopped';
      this.log(
        `[${run.taskId}] ${status} ${run.agent} pid:${run.pid} started:${run.startedAt} ${title} log:${run.logPath}`,
      );
    }
  }
}
