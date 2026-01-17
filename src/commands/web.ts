import http from 'http';
import { Command, Flags } from '@oclif/core';
import { findProjectRoot, getProjectPaths, ensureProjectDirs } from '../lib/paths';
import { readConfig } from '../lib/config';
import { readState } from '../lib/state-store';
import { AgentRunStatus, getLatestRunForTask, listAgentRuns, readLogTail } from '../lib/agent-runs';
import { Task } from '../lib/tasks';

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Orchestrate Monitor</title>
    <style>
      :root {
        --bg: #f6efe4;
        --bg-2: #efe0c6;
        --ink: #1e1a14;
        --muted: #5f5648;
        --accent: #d1562e;
        --accent-2: #2e8b75;
        --card: rgba(255, 255, 255, 0.78);
        --line: rgba(30, 20, 10, 0.14);
        --shadow: 0 20px 45px rgba(30, 20, 10, 0.18);
        --glow: 0 0 0 2px rgba(46, 139, 117, 0.14), 0 14px 32px rgba(46, 139, 117, 0.28);
        --display: "Fraunces", "Georgia", serif;
        --body: "Space Grotesk", "Trebuchet MS", sans-serif;
        --mono: "IBM Plex Mono", "Courier New", monospace;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--body);
        color: var(--ink);
        background:
          radial-gradient(circle at 15% 10%, rgba(239, 194, 137, 0.4), transparent 45%),
          radial-gradient(circle at 80% 0%, rgba(209, 86, 46, 0.2), transparent 40%),
          linear-gradient(130deg, var(--bg) 0%, var(--bg-2) 60%, #f2f4e8 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          radial-gradient(rgba(30, 20, 10, 0.07) 1px, transparent 1px);
        background-size: 18px 18px;
        opacity: 0.35;
        pointer-events: none;
      }

      main {
        position: relative;
        max-width: 1100px;
        margin: 0 auto;
        padding: 32px 20px 60px;
      }

      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 24px;
      }

      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.22em;
        font-size: 0.7rem;
        color: var(--muted);
      }

      h1 {
        margin: 8px 0 6px;
        font-family: var(--display);
        font-weight: 600;
        font-size: clamp(2rem, 3.2vw, 3rem);
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 0.9rem;
        color: var(--muted);
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 14px;
        background: rgba(255, 255, 255, 0.65);
        font-size: 0.85rem;
        cursor: pointer;
        transition: transform 0.2s ease;
      }

      .pill:hover {
        transform: translateY(-1px);
      }

      .toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        color: var(--muted);
      }

      .toggle input {
        accent-color: var(--accent);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }

      .card {
        position: relative;
        padding: 18px;
        border-radius: 18px;
        background: var(--card);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
        backdrop-filter: blur(6px);
        animation: rise 0.6s ease both;
        overflow: hidden;
      }

      .card::after {
        content: "";
        position: absolute;
        top: -35%;
        right: -35%;
        width: 140px;
        height: 140px;
        background: radial-gradient(circle, rgba(209, 86, 46, 0.26), transparent 70%);
        opacity: 0.6;
      }

      .card.running {
        border-color: rgba(46, 139, 117, 0.4);
        animation: rise 0.6s ease both, pulse 2.6s ease-in-out infinite;
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .badge {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.7rem;
        color: var(--muted);
      }

      .status {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.2em;
      }

      .status.running {
        color: var(--accent-2);
      }

      .status.idle {
        color: var(--accent);
      }

      .title {
        font-family: var(--display);
        font-size: 1.2rem;
        margin: 0 0 10px;
      }

      .meta-line {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.85rem;
        color: var(--muted);
        padding: 3px 0;
      }

      .meta-line span:last-child {
        color: var(--ink);
        font-weight: 500;
        text-align: right;
      }

      pre {
        margin: 12px 0 0;
        padding: 12px;
        border-radius: 12px;
        background: rgba(30, 20, 10, 0.08);
        font-family: var(--mono);
        font-size: 0.78rem;
        line-height: 1.4;
        max-height: 220px;
        overflow: auto;
        white-space: pre-wrap;
      }

      .empty {
        border: 1px dashed var(--line);
        border-radius: 18px;
        padding: 40px;
        text-align: center;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.55);
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(18px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes pulse {
        0%, 100% {
          box-shadow: var(--glow);
        }
        50% {
          box-shadow: 0 12px 28px rgba(46, 139, 117, 0.24);
        }
      }

      @media (max-width: 720px) {
        header {
          flex-direction: column;
          align-items: flex-start;
        }

        .controls {
          width: 100%;
          justify-content: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .card,
        .card.running {
          animation: none;
        }

        .pill {
          transition: none;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <div class="eyebrow">Live Orchestrate</div>
          <h1>In-Progress Tasks</h1>
          <div class="meta">
            <span id="workspace">-</span>
            <span>|</span>
            <span>Updated</span>
            <span id="stamp">-</span>
            <span>|</span>
            <span id="count">0</span>
            <span>tasks</span>
          </div>
        </div>
        <div class="controls">
          <button class="pill" id="refresh">Refresh now</button>
          <label class="toggle">
            Auto
            <input type="checkbox" id="auto" checked>
          </label>
        </div>
      </header>
      <section class="grid" id="grid"></section>
      <div class="empty" id="empty" hidden>
        No tasks are currently marked in progress.
      </div>
    </main>
    <script>
      const grid = document.getElementById('grid');
      const empty = document.getElementById('empty');
      const workspace = document.getElementById('workspace');
      const stamp = document.getElementById('stamp');
      const count = document.getElementById('count');
      const refreshButton = document.getElementById('refresh');
      const autoToggle = document.getElementById('auto');
      let timer = null;

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setHeader(data) {
        workspace.textContent = data.workspace || '-';
        if (data.generatedAt) {
          stamp.textContent = new Date(data.generatedAt).toLocaleTimeString();
        } else {
          stamp.textContent = '-';
        }
        count.textContent = String((data.tasks || []).length);
      }

      function renderCard(item, index) {
        const task = item.task || {};
        const run = item.run;
        const statusText = run ? (run.running ? 'running' : 'stopped') : 'no local run';
        const statusClass = run && run.running ? 'running' : 'idle';
        const agentText = run ? (run.agent + ' pid:' + run.pid) : 'n/a';
        const logText = run && run.logTail ? run.logTail : 'No log output yet.';
        const logPath = run && run.logPath ? run.logPath : '';

        const card = document.createElement('article');
        card.className = 'card' + (run && run.running ? ' running' : '');
        card.style.animationDelay = (index * 60) + 'ms';
        card.innerHTML =
          '<div class="card-head">' +
            '<div class="badge">Task ' + escapeHtml(task.id) + '</div>' +
            '<div class="status ' + statusClass + '">' + escapeHtml(statusText) + '</div>' +
          '</div>' +
          '<div class="title">' + escapeHtml(task.title || 'Untitled task') + '</div>' +
          '<div class="meta-line"><span>Owner</span><span>' + escapeHtml(task.owner || 'unassigned') + '</span></div>' +
          '<div class="meta-line"><span>Branch</span><span>' + escapeHtml(task.branch || 'n/a') + '</span></div>' +
          '<div class="meta-line"><span>Worktree</span><span>' + escapeHtml(task.worktree || 'n/a') + '</span></div>' +
          '<div class="meta-line"><span>Started</span><span>' + escapeHtml(task.startedAt || 'n/a') + '</span></div>' +
          '<div class="meta-line"><span>Agent</span><span>' + escapeHtml(agentText) + '</span></div>' +
          (logPath ? '<div class="meta-line"><span>Log</span><span>' + escapeHtml(logPath) + '</span></div>' : '') +
          '<pre>' + escapeHtml(logText) + '</pre>';
        return card;
      }

      function render(data) {
        const items = data.tasks || [];
        grid.innerHTML = '';
        if (items.length === 0) {
          empty.hidden = false;
          return;
        }
        empty.hidden = true;
        items.forEach(function (item, index) {
          grid.appendChild(renderCard(item, index));
        });
      }

      async function load() {
        try {
          const response = await fetch('/api/overview');
          const data = await response.json();
          setHeader(data);
          render(data);
        } catch (error) {
          empty.textContent = 'Failed to load data.';
          empty.hidden = false;
        }
      }

      function schedule() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (autoToggle.checked) {
          timer = setInterval(load, 5000);
        }
      }

      refreshButton.addEventListener('click', function () {
        load();
      });
      autoToggle.addEventListener('change', schedule);

      load();
      schedule();
    </script>
  </body>
</html>`;

function pickLines(value: string | null): number {
  if (!value) {
    return 120;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 120;
  }
  return Math.max(10, Math.min(parsed, 300));
}

async function buildOverview(paths: ReturnType<typeof getProjectPaths>, stateBranch: string, lines: number) {
  const state = await readState(paths, stateBranch);
  const tasks = state.tasks.tasks.filter((task) => task.status === 'in_progress');
  const runs = await listAgentRuns(paths);
  const items: Array<{ task: Task; run: (AgentRunStatus & { logTail: string }) | null }> = [];
  for (const task of tasks) {
    const run = getLatestRunForTask(runs, task.id);
    const logTail = run ? await readLogTail(run.logPath, lines) : '';
    items.push({
      task,
      run: run ? { ...run, logTail } : null,
    });
  }
  return {
    workspace: paths.root,
    generatedAt: new Date().toISOString(),
    tasks: items,
  };
}

export default class Web extends Command {
  static description = 'Start the web UI for in-progress tasks';

  static flags = {
    port: Flags.integer({ description: 'Port to bind the web UI', default: 3000 }),
    host: Flags.string({ description: 'Host to bind the web UI', default: '127.0.0.1' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Web);
    const root = findProjectRoot(process.cwd());
    if (!root) {
      throw new Error('No orchestrate workspace found.');
    }
    const paths = getProjectPaths(root);
    ensureProjectDirs(paths);
    const config = await readConfig(paths.configPath);

    const server = http.createServer((req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', `http://${flags.host}:${flags.port}`);
        if (url.pathname === '/api/overview') {
          const lines = pickLines(url.searchParams.get('lines'));
          const data = await buildOverview(paths, config.stateBranch, lines);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        }

        if (url.pathname !== '/') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(INDEX_HTML);
      })().catch((error: any) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server error: ${error?.message ?? 'unknown error'}`);
      });
    });

    server.listen(flags.port, flags.host, () => {
      this.log(`Web UI running at http://${flags.host}:${flags.port}`);
    });
  }
}
