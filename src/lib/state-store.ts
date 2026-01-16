import fs from 'fs/promises';
import path from 'path';
import { withLock } from './lock';
import { git, gitStdout } from './git';
import { TasksFile, TasksFileSchema } from './tasks';
import { ProjectPaths } from './paths';

export interface State {
  plan: string;
  tasks: TasksFile;
}

export interface UpdateResult {
  state: State;
  changed: boolean;
}

const MAX_UPDATE_ATTEMPTS = 5;

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

async function ensureLocalBranch(paths: ProjectPaths, stateBranch: string): Promise<void> {
  const localRef = `refs/heads/${stateBranch}`;
  const remoteRef = `refs/remotes/origin/${stateBranch}`;
  const localExists = await refExists(paths.bareDir, localRef);
  if (localExists) {
    return;
  }
  const remoteExists = await refExists(paths.bareDir, remoteRef);
  if (!remoteExists) {
    throw new Error(`State branch ${stateBranch} not found on origin`);
  }
  await git(['branch', stateBranch, `origin/${stateBranch}`], { gitDir: paths.bareDir });
}

async function createTempWorktree(paths: ProjectPaths, stateBranch: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const tempBase = path.join(paths.tmpDir, 'state-');
  await fs.mkdir(paths.tmpDir, { recursive: true });
  const dir = await fs.mkdtemp(tempBase);
  await git(['worktree', 'add', dir, stateBranch], { gitDir: paths.bareDir });
  const cleanup = async () => {
    try {
      await git(['worktree', 'remove', '--force', dir], { gitDir: paths.bareDir });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
  return { dir, cleanup };
}

async function readStateFromWorktree(worktree: string): Promise<State> {
  const planPath = path.join(worktree, 'Plan.md');
  const tasksPath = path.join(worktree, 'tasks.json');
  const plan = await fs.readFile(planPath, 'utf8');
  const tasksRaw = await fs.readFile(tasksPath, 'utf8');
  const parsed = TasksFileSchema.parse(JSON.parse(tasksRaw));
  return { plan, tasks: parsed };
}

async function writeStateToWorktree(worktree: string, state: State): Promise<void> {
  const planPath = path.join(worktree, 'Plan.md');
  const tasksPath = path.join(worktree, 'tasks.json');
  await fs.writeFile(planPath, state.plan, 'utf8');
  const formatted = JSON.stringify(state.tasks, null, 2);
  await fs.writeFile(tasksPath, `${formatted}\n`, 'utf8');
}

export async function readState(paths: ProjectPaths, stateBranch: string): Promise<State> {
  await ensureLocalBranch(paths, stateBranch);
  const { dir, cleanup } = await createTempWorktree(paths, stateBranch);
  try {
    return await readStateFromWorktree(dir);
  } finally {
    await cleanup();
  }
}

function isNonFastForward(error: any): boolean {
  const stderr = error?.stderr ?? '';
  return typeof stderr === 'string' && stderr.includes('non-fast-forward');
}

export async function updateState(
  paths: ProjectPaths,
  stateBranch: string,
  message: string,
  mutate: (state: State) => Promise<State> | State,
): Promise<UpdateResult> {
  return withLock(paths.lockPath, async () => {
    await ensureLocalBranch(paths, stateBranch);
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      await git(['fetch', 'origin', stateBranch], { gitDir: paths.bareDir });
      const { dir, cleanup } = await createTempWorktree(paths, stateBranch);
      try {
        await git(['-C', dir, 'reset', '--hard', `origin/${stateBranch}`]);
        const state = await readStateFromWorktree(dir);
        const next = await mutate(state);
        await writeStateToWorktree(dir, next);
        const status = await gitStdout(['-C', dir, 'status', '--porcelain']);
        if (!status) {
          return { state: next, changed: false };
        }
        await git(['-C', dir, 'add', 'Plan.md', 'tasks.json']);
        await git(['-C', dir, 'commit', '-m', message]);
        try {
          await git(['-C', dir, 'push', 'origin', `HEAD:${stateBranch}`]);
          return { state: next, changed: true };
        } catch (error: any) {
          if (isNonFastForward(error) && attempt < MAX_UPDATE_ATTEMPTS - 1) {
            continue;
          }
          throw error;
        }
      } finally {
        await cleanup();
      }
    }
    throw new Error('Failed to update state after retries');
  });
}
