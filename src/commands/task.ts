import { Command } from '@oclif/core';

export default class Task extends Command {
  static description = 'Task operations (add)';
  static strict = false;

  async run(): Promise<void> {
    const [action, ...rest] = this.argv;
    if (!action) {
      this.log('Specify a subcommand. Example: orchestrate task add "Title"');
      return;
    }

    if (action !== 'add') {
      throw new Error(`Unknown subcommand: ${action}`);
    }

    await this.config.runCommand('task:add', rest);
  }
}
