# Cursor SDK Kanban Board Agent

This example uses the Cursor Agent SDK to run a local coding agent that
scaffolds a Kanban board app in a target directory. It demonstrates a focused
"builder agent" workflow: collect a destination, create an SDK agent in that
workspace, send a structured product prompt, and stream the agent's progress.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Set an API key:

```bash
export CURSOR_API_KEY="crsr_..."
```

Create a Kanban board app in `./kanban-board`:

```bash
pnpm dev
```

Choose a different output directory:

```bash
pnpm dev -- --output ../my-kanban-board
```

Add extra product requirements after `--`:

```bash
pnpm dev -- --output ../my-kanban-board -- "Add swimlanes for priority and a dark mode toggle."
```

## Options

- `--output, -o <dir>`: target workspace for the generated app
  (default: `./kanban-board`).
- `--model, -m <id>`: Cursor model ID (default: `CURSOR_MODEL` or
  `composer-2`).
- `--force`: allow a non-empty output directory and pass local force mode to the
  SDK run.
- `--help, -h`: print usage information.

The generated app prompt asks the agent to use Vite, React, and TypeScript; add
card CRUD; move cards between columns; persist state in `localStorage`; and
include its own README and validation scripts.
