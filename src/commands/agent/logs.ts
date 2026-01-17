import { Args, Command, Flags } from '@oclif/core';
import { findProjectRoot, getProjectPaths } from '../../lib/paths';
import { getLatestRunForTask, listAgentRuns, readLogTail } from '../../lib/agent-runs';

export default class AgentLogs extends Command {
  static description = 'Show recent log output for a task run';

  static args = {
    taskId: Args.integer({ required: true, description: 'Task ID' }),
  };

  static flags = {
    lines: Flags.integer({ description: 'Number of log lines to show', default: 120 }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AgentLogs);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    const runs = await listAgentRuns(paths);
    const run = getLatestRunForTask(runs, args.taskId);

    if (!run) {
      this.log(`No runs found for task ${args.taskId}.`);
      return;
    }

    const tail = await readLogTail(run.logPath, flags.lines);
    if (!tail) {
      this.log('No log output yet.');
      return;
    }

    this.log(tail);
  }
}
