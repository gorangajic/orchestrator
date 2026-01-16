import execa from 'execa';

export interface GitOptions {
  cwd?: string;
  gitDir?: string;
}

export async function git(args: string[], options: GitOptions = {}) {
  const finalArgs = options.gitDir ? [`--git-dir=${options.gitDir}`, ...args] : args;
  return execa('git', finalArgs, {
    cwd: options.cwd,
  });
}

export async function gitStdout(args: string[], options: GitOptions = {}): Promise<string> {
  const result = await git(args, options);
  return result.stdout.trim();
}
