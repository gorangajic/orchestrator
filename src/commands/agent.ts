import { Command } from '@oclif/core';

export default class Agent extends Command {
  static description = 'Monitor local agent runs (list, logs)';
  static strict = false;

  async run(): Promise<void> {
    const [action, ...rest] = this.argv;
    if (!action) {
      this.log('Specify a subcommand. Example: orchestrate agent list');
      return;
    }

    if (action === 'list') {
      await this.config.runCommand('agent:list', rest);
      return;
    }

    if (action === 'logs') {
      await this.config.runCommand('agent:logs', rest);
      return;
    }

    throw new Error(`Unknown subcommand: ${action}`);
  }
}
