import fs from 'fs';
import path from 'path';

export const ORCHESTRATE_DIR = '.orchestrate';
export const BARE_DIR = '.bare';

export interface ProjectPaths {
  root: string;
  bareDir: string;
  orchestrateDir: string;
  configPath: string;
  lockPath: string;
  tmpDir: string;
  logsDir: string;
}

export function getProjectPaths(root: string): ProjectPaths {
  const orchestrateDir = path.join(root, ORCHESTRATE_DIR);
  return {
    root,
    bareDir: path.join(root, BARE_DIR),
    orchestrateDir,
    configPath: path.join(orchestrateDir, 'config.json'),
    lockPath: path.join(orchestrateDir, 'lock'),
    tmpDir: path.join(orchestrateDir, 'tmp'),
    logsDir: path.join(orchestrateDir, 'logs'),
  };
}

export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  // Stop at filesystem root.
  while (true) {
    const orchestrateDir = path.join(current, ORCHESTRATE_DIR);
    const bareDir = path.join(current, BARE_DIR);
    if (fs.existsSync(orchestrateDir) && fs.existsSync(bareDir)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function ensureProjectDirs(paths: ProjectPaths): void {
  fs.mkdirSync(paths.orchestrateDir, { recursive: true });
  fs.mkdirSync(paths.tmpDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
}
