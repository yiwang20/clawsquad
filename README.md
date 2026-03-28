# ClawSquad

ClawSquad is a web-based tool for assembling and running squads of AI agents. Pick roles, describe the mission, and watch your squad work in real-time from a single browser window — a visual team builder for Claude Code.

## Prerequisites

- Node.js 22+
- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed and authenticated

## Quick Start

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Screenshot

<!-- TODO: add screenshot -->

## Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Frontend  | React 18, Vite, Zustand |
| Backend   | Node.js, Express        |
| Database  | SQLite (better-sqlite3) |
| Realtime  | WebSocket (ws)          |
| Language  | TypeScript              |
