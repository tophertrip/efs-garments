# EFS Garments — Production Tracker (MVP)

An in-house web app for **EFS Garments Manufacturing** (Philippines) that replaces
manual Google-Sheets tracking and gives the owner live visibility into every job order as
it moves through the production pipeline.

Categories handled: **Sportswear · Activewear · Corporate Uniforms · School Uniforms**.

---

## Tech stack

| Layer    | Choice |
|----------|--------|
| Frontend | React 18 + Vite + Tailwind CSS (navy/gold theme, mobile-friendly) |
| Backend  | Node.js + Express REST API |
| Database | SQLite via `better-sqlite3` (file-based — `server/efs.db`, no setup) |
| Auth     | Simple PIN login, role-based views |

---

## Running it

> **Note:** Node.js is installed locally at `~/.local/node`. Each command below sets it on
> `PATH` automatically (or run `export PATH="$HOME/.local/node/bin:$PATH"` once per terminal).

### Quick start (single port — recommended for the owner)

```bash
cd efs-garments
./start.sh
```

Then open **http://localhost:4000**. This builds the frontend, seeds the database on first
run, and serves the whole app from one port.

### Development mode (hot reload, two terminals)

```bash
# Terminal 1 — API on :4000
export PATH="$HOME/.local/node/bin:$PATH"
cd efs-garments/server && npm install && npm run seed && npm start

# Terminal 2 — Vite dev server on :5173 (proxies /api to :4000)
export PATH="$HOME/.local/node/bin:$PATH"
cd efs-garments/client && npm install && npm run dev
```

Open **http://localhost:5173**.

To reset all data back to the sample set: `cd server && npm run seed`.

---



---

## Status flow & stage owners

`📋 Inquiry → 💬 Quotation → ✅ Confirmed → 🛒 Purchasing → 🖨️ Printing →
✂️ Cutting & Sewing → 🔍 Quality Check → 📦 Ready → 🎉 Delivered`

| Stage | Owner role |
|-------|------------|
| inquiry, quotation, confirmed, ready, delivered | admin |
| purchasing | purchasing |
| printing | printing |
| cutting_sewing | cutting & sewing |
| qa | qa |

When a project advances, a **task is auto-created** for the team that owns the new stage,
carrying the job-order details and target date.

---

## Features

- **PIN login** with role-based home (admin → Dashboard, team → "My Work").
- **Dashboard**: summary cards (Active / Due This Week / Overdue / Completed This Month) and
  a horizontal **kanban pipeline** across all nine stages. Overdue items flagged red.
- **Project detail**: full specs & pricing, status **timeline** with timestamps, big
  **Advance to Next Stage** button, **✏️ Edit** button (admin) to update any field after
  creation, **🗑 Delete** (admin, with confirmation), **activity log** (who moved it & when),
  and per-project tasks.
- **New project form**: pick/inline-create customer, pick/**inline-create category**, qty,
  unit price → auto total,
  target date, priority, design notes, **remarks**, design-file link. **Job-order number auto-generated**
  (`EFS-YYYY-NNN`).
- **Team view**: each role sees only the projects in their stage with a one-click
  "Done → move to next stage", plus their assigned tasks.
- **Projects list**: filterable/searchable table with **CSV export**.
- **Customers**: cards with project counts, add form, and **delete** (admin) — blocked with a
  clear message while the customer still has job orders, to prevent orphaned projects.
- **Reports** (admin): analytics grouped **by month / week / year**, **by product category**,
  **per customer**, **by stage**, or **by priority**. KPI cards (orders, units, revenue, avg
  order value), a bar chart (toggle revenue/orders/units), a breakdown table with % of revenue,
  date-range + status filters, and CSV export.
- **Reminders**: all tasks, filterable; admin can assign to any team member.

---

## API reference

All routes are under `/api` and (except login) require an `Authorization: Bearer <token>` header.

```
POST   /api/auth/login              PIN login → { token, user }
GET    /api/stages                  Stage definitions

GET    /api/projects                List (filters: status, category, from, to, search)
POST   /api/projects                Create (auto job-order #) 
GET    /api/projects/:id            Single project + logs + tasks
PUT    /api/projects/:id            Update details
PUT    /api/projects/:id/status     Advance to next stage (or {status} to jump)
DELETE /api/projects/:id            Delete a project (+ its logs & tasks)

GET    /api/customers               List with project counts
POST   /api/customers               Create
DELETE /api/customers/:id           Delete (blocked if they still have projects)

GET    /api/categories              List product categories (public)
POST   /api/categories              Add a new category (slug auto-generated)

GET    /api/users                   Team members (for assignment)
GET    /api/tasks                   List (filters: assigned_to, project_id, done)
POST   /api/tasks                   Create task/reminder
PUT    /api/tasks/:id/done          Toggle complete ({is_done:0|1})

GET    /api/dashboard               Summary stats + counts by stage
GET    /api/reports                 Aggregated analytics (admin)
                                       ?groupBy=year|month|week|category|customer|status|priority
                                       &dateField=created|target &from=&to=&status=all|active|delivered
                                       → { summary:{orders,units,revenue,avgOrderValue}, rows:[…] }
```

---

## Project layout

```
efs-garments/
├── start.sh                # one-command launcher (build + serve on :4000)
├── server/
│   ├── index.js            # Express API + serves built client in prod
│   ├── db.js               # SQLite schema/init
│   ├── stages.js           # status-flow definitions (shared)
│   ├── seed.js             # sample users / customers / projects
│   └── efs.db              # SQLite file (created on seed)
└── client/
    ├── src/
    │   ├── App.jsx         # routes + role-based home
    │   ├── Layout.jsx      # sidebar nav + mobile drawer
    │   ├── auth.jsx        # auth context
    │   ├── api.js          # fetch wrapper
    │   ├── constants.js    # stages, categories, date/peso helpers
    │   ├── components.jsx  # shared UI (badges, buttons, modal, …)
    │   ├── ProjectForm.jsx # new-project modal
    │   └── pages/          # Login, Dashboard, TeamView, ProjectsList,
    │                       #   ProjectDetail, Customers, Tasks
    └── vite.config.js      # dev proxy /api → :4000
```

## Notes / next steps (post-MVP)

- Auth tokens are simple base64 payloads — fine for an internal LAN tool, but add real
  signing/expiry before exposing to the internet.
- Notifications are in-app only (auto-created tasks). Email/SMS can be layered on later.
- File uploads are URL links (Google Drive / Canva) for now.
