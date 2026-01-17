# Orchestrate

Orchestrate is a CLI that coordinates multiple coding-agent sessions on the same repo using Git worktrees. It stores coordination state in an orphan branch (`orchestrate/state`) with only `Plan.md` and `tasks.json`.

## Quick start

```bash
orchestrate init https://github.com/your/repo.git --dir project
cd project
orchestrate task add "First task" --desc "Describe the task"
orchestrate list
orchestrate next --agent codex --run
orchestrate agent list
orchestrate web --port 3000
```

## Workspace layout

- `.bare/`: bare clone of the repo
- `.orchestrate/`: configuration, locks, logs, temp worktrees
- `.orchestrate/agent-runs.json`: local background agent run metadata
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

## Monitoring

- `orchestrate next --agent codex --run` starts the agent in the background and logs output to `.orchestrate/logs/task-<id>.agent.log`.
- `orchestrate next --agent codex --run --foreground` keeps the agent attached to the current terminal.
- `orchestrate agent list` shows local agent runs and their status.
- `orchestrate agent logs <taskId>` tails recent output for the latest run of a task.
- `orchestrate web --port 3000` starts the local web UI (binds to 127.0.0.1 by default).
