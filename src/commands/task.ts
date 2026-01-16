import { Args, Command } from '@oclif/core';

export default class Task extends Command {
  static description = 'Task operations (add)';

  static args = {
    action: Args.string({ required: false, description: 'Subcommand to run' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Task);
    if (!args.action) {
      this.log('Specify a subcommand. Example: orchestrate task add "Title"');
      return;
    }

    if (args.action !== 'add') {
      throw new Error(`Unknown subcommand: ${args.action}`);
    }

    await this.config.runCommand('task:add', this.argv.slice(1));
  }
}
