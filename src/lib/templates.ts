import { Task, TasksFile } from './tasks';

export const DEFAULT_PLAN = `# Orchestrate Plan

## Objective
- Define the high-level goals for this repo.

## Rules for Agents
- Read this plan before starting work.
- Update task status in orchestrate/state when work is complete.
- Keep changes scoped to the assigned task.
`;

export function renderTaskMarkdown(task: Task, plan: string, tasksFile: TasksFile): string {
  const deps = task.deps ?? [];
  const depLines = deps.length
    ? deps.map((depId) => {
        const dep = tasksFile.tasks.find((item) => item.id === depId);
        const status = dep?.status ?? 'unknown';
        const title = dep?.title ? `: ${dep.title}` : '';
        return `- ${depId}${title} (${status})`;
      })
    : ['- none'];

  const description = task.description?.trim() || 'No description provided.';

  return `# Task ${task.id}: ${task.title}

## Objective
${description}

## Dependencies
${depLines.join('\n')}

## Acceptance Criteria
- [ ] Define acceptance criteria for this task.

## Instructions
- Read the plan below before starting.
- Keep work scoped to this task.
- When finished, mark this task as done in orchestrate/state.

---

${plan.trim()}
`;
}
