import { z } from 'zod';

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done', 'blocked']);

export const TaskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional(),
  deps: z.array(z.number().int().positive()).default([]),
  priority: z.number().int().default(0),
  status: TaskStatusSchema,
  owner: z.string().optional(),
  branch: z.string().optional(),
  worktree: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const TasksFileSchema = z.object({
  lastId: z.number().int().nonnegative(),
  tasks: z.array(TaskSchema),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TasksFile = z.infer<typeof TasksFileSchema>;

export function createEmptyTasksFile(): TasksFile {
  return { lastId: 0, tasks: [] };
}

export function createTask(
  tasksFile: TasksFile,
  input: { title: string; description?: string; deps?: number[]; priority?: number },
): Task {
  const now = new Date().toISOString();
  const nextId = tasksFile.lastId + 1;
  return {
    id: nextId,
    title: input.title,
    description: input.description,
    deps: input.deps ?? [],
    priority: input.priority ?? 0,
    status: 'todo',
    createdAt: now,
    updatedAt: now,
  };
}

export function isTaskReady(task: Task, tasksFile: TasksFile): boolean {
  if (task.status !== 'todo') {
    return false;
  }
  if (!task.deps || task.deps.length === 0) {
    return true;
  }
  const tasksById = new Map(tasksFile.tasks.map((item) => [item.id, item]));
  return task.deps.every((depId) => tasksById.get(depId)?.status === 'done');
}

export function selectNextTask(tasksFile: TasksFile): Task | null {
  const candidates = tasksFile.tasks.filter((task) => isTaskReady(task, tasksFile));
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.id - b.id;
  });
  return candidates[0] ?? null;
}

export function sortTasksForList(tasksFile: TasksFile): Task[] {
  const statusRank: Record<TaskStatus, number> = {
    in_progress: 0,
    todo: 1,
    blocked: 2,
    done: 3,
  };

  return [...tasksFile.tasks].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    if (a.status === 'todo' && b.status === 'todo') {
      const readyA = isTaskReady(a, tasksFile) ? 0 : 1;
      const readyB = isTaskReady(b, tasksFile) ? 0 : 1;
      if (readyA !== readyB) {
        return readyA - readyB;
      }
    }
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.id - b.id;
  });
}

export function taskSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task';
}
