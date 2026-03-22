# Jira Dashboard

A custom Jira dashboard for tracking team issues, built with React + TypeScript + Tailwind CSS. Deployed at [jira.yinyi.dev](https://jira.yinyi.dev).

## Features

- **Kanban Board** — Dynamic columns based on actual issue statuses, with drag-and-drop to transition issues (optimistic updates)
- **Table View** — Sortable issue list with pagination
- **Team Filtering** — Avatar-based member filtering with shared team configs
- **Filters** — Project, status, priority, type dropdowns + preset queries
- **Column Controls** — Show/hide columns, per-column date filters
- **Issue Detail Modal** — View and edit all issue fields inline:
  - Summary, description, status, priority, assignee, labels, type
  - Time tracking (estimated, logged, remaining)
  - Start date, due date
  - Child work items with progress bar
  - Linked issues (view, create, delete)
  - Activity tabs: All, Comments, History, Work log
- **Due Dates** — Displayed on Kanban cards with overdue/due-soon color indicators
- **Authentication** — Google OAuth 2.0 with email allowlisting, or username/password login
- **Settings** — Manage custom teams (create, rename, add/remove Jira users)

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite, dnd-kit
- **Backend:** Express.js proxy server (authenticates with Jira Cloud REST API v3)
- **Secrets:** Managed via [Doppler](https://www.doppler.com/) — no `.env` files

## Getting Started

### Prerequisites

- Node.js 18+
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) configured with project secrets

### Required Secrets (via Doppler)

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | Jira Cloud instance URL (e.g. `https://yourorg.atlassian.net`) |
| `JIRA_EMAIL` | Jira account email |
| `JIRA_API_TOKEN` | Jira API token |
| `DASHBOARD_USER` | Dashboard login username (optional if using Google OAuth) |
| `DASHBOARD_PASS` | Dashboard login password (optional if using Google OAuth) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret (optional) |
| `ALLOWED_EMAILS` | Comma-separated email allowlist for Google OAuth (optional) |
| `FRONTEND_URL` | Frontend URL for OAuth redirects in dev (e.g. `http://localhost:5175`) |

### Development

```bash
# Install dependencies
npm install

# Start backend proxy server (port 3001)
npm run server

# Start frontend dev server (port 5173)
npm run dev
```

Or run both together:

```bash
npm start
```

### Build

```bash
npm run build
```

## Project Structure

```
├── server.js                  # Express proxy server (Jira API + auth + teams)
├── src/
│   ├── App.tsx                # Main app (filters, layout, routing)
│   ├── api.ts                 # Frontend API client
│   └── components/
│       ├── KanbanBoard.tsx    # Kanban board with dynamic columns
│       ├── KanbanColumn.tsx   # Droppable column
│       ├── KanbanCard.tsx     # Draggable issue card
│       ├── IssueTable.tsx     # Table view
│       ├── IssueDetailPanel.tsx # Issue detail modal
│       ├── LoginPage.tsx      # Login page (Google OAuth + password)
│       ├── StatusBadge.tsx    # Status badge component
│       └── SettingsPanel.tsx  # Team management settings
├── teams.json                 # Shared team configs (server-managed)
└── CLAUDE.md                  # Project rules for Claude Code
```
