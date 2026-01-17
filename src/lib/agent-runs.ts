import fs from 'fs/promises';
import path from 'path';
import { withLock } from './lock';
import { ProjectPaths } from './paths';

export interface AgentRunRecord {
  id: string;
  taskId: number;
  agent: string;
  pid: number;
  startedAt: string;
  worktreePath: string;
  taskPath: string;
  logPath: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface AgentRunStatus extends AgentRunRecord {
  running: boolean;
}

const RUNS_FILE = 'agent-runs.json';
const RUNS_LOCK = 'agent-runs.lock';

function runsPath(paths: ProjectPaths): string {
  return path.join(paths.orchestrateDir, RUNS_FILE);
}

function runsLockPath(paths: ProjectPaths): string {
  return path.join(paths.orchestrateDir, RUNS_LOCK);
}

export function createRunId(taskId: number): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${taskId}-${stamp}${rand}`;
}

async function readRunsFile(paths: ProjectPaths): Promise<AgentRunRecord[]> {
  try {
    const raw = await fs.readFile(runsPath(paths), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.runs)) {
      return [];
    }
    return parsed.runs as AgentRunRecord[];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeRunsFile(paths: ProjectPaths, runs: AgentRunRecord[]): Promise<void> {
  await fs.mkdir(paths.orchestrateDir, { recursive: true });
  const formatted = JSON.stringify({ runs }, null, 2);
  await fs.writeFile(runsPath(paths), `${formatted}\n`, 'utf8');
}

export async function registerAgentRun(paths: ProjectPaths, run: AgentRunRecord): Promise<void> {
  await withLock(runsLockPath(paths), async () => {
    const runs = await readRunsFile(paths);
    runs.push(run);
    await writeRunsFile(paths, runs);
  });
}

export async function listAgentRuns(paths: ProjectPaths): Promise<AgentRunStatus[]> {
  const runs = await readRunsFile(paths);
  return runs.map((run) => ({ ...run, running: isPidRunning(run.pid) }));
}

export function getLatestRunForTask(runs: AgentRunStatus[], taskId: number): AgentRunStatus | null {
  const matches = runs.filter((run) => run.taskId === taskId);
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return matches[matches.length - 1];
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error?.code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

export async function readLogTail(logPath: string, maxLines = 120): Promise<string> {
  const safeLines = Math.max(1, Math.min(maxLines, 500));
  try {
    const content = await fs.readFile(logPath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-safeLines).join('\n').trimEnd();
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}
