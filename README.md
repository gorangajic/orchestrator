# Orchestrate

Orchestrate is a CLI that coordinates multiple coding-agent sessions on the same repo using Git worktrees. It stores coordination state in an orphan branch (`orchestrate/state`) with only `Plan.md` and `tasks.json`.

## Quick start

```bash
orchestrate init https://github.com/your/repo.git --dir project
cd project
orchestrate task add "First task" --desc "Describe the task"
orchestrate list
orchestrate next --agent codex --run
```

## Workspace layout

- `.bare/`: bare clone of the repo
- `.orchestrate/`: configuration, locks, logs, temp worktrees
- `task-<id>/`: per-task worktrees created by `orchestrate next`

## Config

`project/.orchestrate/config.json`:

```json
{
  "remote": "https://github.com/your/repo.git",
  "defaultBranch": "main",
  "stateBranch": "orchestrate/state",
  "setup": {
    "command": "npm install",
    "shell": true,
    "cwd": "."
  },
  "agents": {
    "codex": {
      "command": "codex",
      "prompt": "Look into {taskFile}, please complete it and mark the status as done when completed."
    }
  }
}
```

Setup commands are disabled by default unless configured. Use `orchestrate init --trust` to write a default setup command.

Agent placeholders available in `prompt`, `args`, `env`, and `cwd`: `{taskPath}`, `{taskFile}`, `{taskId}`, `{taskTitle}`, `{taskBranch}`, `{worktreePath}`.
