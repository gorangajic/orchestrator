import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const SetupSchema = z.object({
  command: z.union([z.string(), z.array(z.string())]),
  shell: z.boolean().optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});

const AgentSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  shell: z.boolean().optional(),
});

const ConfigSchema = z.object({
  remote: z.string(),
  defaultBranch: z.string(),
  stateBranch: z.string(),
  setup: SetupSchema.optional(),
  agents: z.record(AgentSchema).optional(),
});

export type SetupConfig = z.infer<typeof SetupSchema>;
export type AgentConfig = z.infer<typeof AgentSchema>;
export type OrchestrateConfig = z.infer<typeof ConfigSchema>;

export async function readConfig(configPath: string): Promise<OrchestrateConfig> {
  const content = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(content);
  return ConfigSchema.parse(parsed);
}

export async function writeConfig(configPath: string, config: OrchestrateConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const formatted = JSON.stringify(config, null, 2);
  await fs.writeFile(configPath, `${formatted}\n`, 'utf8');
}
