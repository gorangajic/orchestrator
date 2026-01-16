import fs from 'fs/promises';
import path from 'path';
import { Args, Command, Flags } from '@oclif/core';
import { git, gitStdout } from '../lib/git';
import { createEmptyTasksFile } from '../lib/tasks';
import { DEFAULT_PLAN } from '../lib/templates';
import { ensureProjectDirs, getProjectPaths } from '../lib/paths';
import { writeConfig, OrchestrateConfig } from '../lib/config';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureEmptyDir(dir: string): Promise<void> {
  if (!(await pathExists(dir))) {
    await fs.mkdir(dir, { recursive: true });
    return;
  }
  const entries = await fs.readdir(dir);
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${dir}`);
  }
}

function defaultDirFromRepo(repoUrl: string): string {
  const cleaned = repoUrl.replace(/\/$/, '');
  const base = path.basename(cleaned);
  return base.replace(/\.git$/i, '') || 'project';
}

async function refExists(gitDir: string, ref: string): Promise<boolean> {
  try {
    await git(['show-ref', '--verify', '--quiet', ref], { gitDir });
    return true;
  } catch (error: any) {
    if (error?.exitCode === 1) {
      return false;
    }
    throw error;
  }
}

async function initStateBranch(
  paths: ReturnType<typeof getProjectPaths>,
  stateBranch: string,
  defaultBranch: string,
): Promise<void> {
  const localRef = `refs/heads/${stateBranch}`;
  const remoteRef = `refs/remotes/origin/${stateBranch}`;

  const localExists = await refExists(paths.bareDir, localRef);
  if (localExists) {
    return;
  }

  const remoteExists = await refExists(paths.bareDir, remoteRef);
  if (remoteExists) {
    await git(['branch', stateBranch, `origin/${stateBranch}`], { gitDir: paths.bareDir });
    return;
  }

  const tempBase = path.join(paths.tmpDir, 'init-state-');
  const tempDir = await fs.mkdtemp(tempBase);
  let worktreeAdded = false;
  try {
    const normalizedDefault = defaultBranch.startsWith('origin/')
      ? defaultBranch.slice('origin/'.length)
      : defaultBranch;
    const hasLocalDefault = await refExists(paths.bareDir, `refs/heads/${normalizedDefault}`);
    const hasRemoteDefault = await refExists(paths.bareDir, `refs/remotes/origin/${normalizedDefault}`);
    const startPoint = hasLocalDefault
      ? normalizedDefault
      : hasRemoteDefault
        ? `origin/${normalizedDefault}`
        : normalizedDefault;
    await git(['worktree', 'add', tempDir, startPoint], { gitDir: paths.bareDir });
    worktreeAdded = true;
    await git(['-C', tempDir, 'checkout', '--orphan', stateBranch]);
    await git(['-C', tempDir, 'clean', '-fdx']);
    const tasksPath = path.join(tempDir, 'tasks.json');
    const planPath = path.join(tempDir, 'Plan.md');
    const tasksFile = createEmptyTasksFile();
    await fs.writeFile(tasksPath, `${JSON.stringify(tasksFile, null, 2)}\n`, 'utf8');
    await fs.writeFile(planPath, DEFAULT_PLAN, 'utf8');
    await git(['-C', tempDir, 'add', 'Plan.md', 'tasks.json']);
    await git(['-C', tempDir, 'commit', '-m', 'Initialize orchestrate state']);
    await git(['-C', tempDir, 'push', 'origin', stateBranch]);
  } finally {
    if (worktreeAdded) {
      try {
        await git(['worktree', 'remove', '--force', tempDir], { gitDir: paths.bareDir });
      } catch {
        // Ignore cleanup failures; surface the original error instead.
      }
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function detectDefaultBranch(bareDir: string): Promise<string> {
  if (await refExists(bareDir, 'refs/heads/main')) {
    return 'main';
  }
  if (await refExists(bareDir, 'refs/heads/master')) {
    return 'master';
  }

  try {
    const output = await gitStdout(['symbolic-ref', 'refs/remotes/origin/HEAD'], { gitDir: bareDir });
    const parts = output.split('/');
    const branch = parts[parts.length - 1];
    if (branch) {
      return branch;
    }
  } catch {
    // Fall back to probing common branch names below.
  }

  if (await refExists(bareDir, 'refs/remotes/origin/main')) {
    return 'main';
  }
  if (await refExists(bareDir, 'refs/remotes/origin/master')) {
    return 'master';
  }

  try {
    const output = await gitStdout(['for-each-ref', '--format=%(refname:strip=2)', 'refs/heads'], {
      gitDir: bareDir,
    });
    const branches = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (branches.length > 0) {
      return branches[0];
    }
  } catch {
    // Ignore and fall back to remote branches.
  }

  try {
    const output = await gitStdout(
      ['for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/origin'],
      { gitDir: bareDir },
    );
    const branches = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line !== 'HEAD');
    if (branches.length > 0) {
      return branches[0];
    }
  } catch {
    // Ignore and fall back to main.
  }

  return 'main';
}

export default class Init extends Command {
  static args = {
    repo: Args.string({ required: true, description: 'Repository URL or path' }),
  };

  static flags = {
    dir: Flags.string({ char: 'd', description: 'Target directory for the orchestration workspace' }),
    trust: Flags.boolean({ description: 'Enable default setup command in config (npm install)' }),
    setup: Flags.string({ description: 'Setup command to run for each worktree (requires --trust)' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Init);
    const repoUrl = args.repo;
    const targetDir = path.resolve(flags.dir ?? defaultDirFromRepo(repoUrl));

    if (flags.setup && !flags.trust) {
      throw new Error('Use --trust to enable setup commands.');
    }

    await ensureEmptyDir(targetDir);

    const paths = getProjectPaths(targetDir);
    await ensureProjectDirs(paths);

    await git(['clone', '--bare', repoUrl, paths.bareDir]);

    const defaultBranch = await detectDefaultBranch(paths.bareDir);
    const stateBranch = 'orchestrate/state';

    await initStateBranch(paths, stateBranch, defaultBranch);

    const setupCommand = flags.setup ?? (flags.trust ? 'npm install' : undefined);
    const config: OrchestrateConfig = {
      remote: repoUrl,
      defaultBranch,
      stateBranch,
      ...(setupCommand
        ? {
            setup: {
              command: setupCommand,
              shell: true,
              cwd: '.',
            },
          }
        : {}),
    };

    await writeConfig(paths.configPath, config);

    this.log(`Initialized orchestrate workspace in ${targetDir}`);
  }
}
