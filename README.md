# Construction CRM

Portfolio CRM for a construction & property-services company: a role-based
calendar, tickets with admin-built workflows and custom fields, team
directory, developments with blocks and units, and a What's New changelog.
All data is fictional.

- **Frontend:** React 19, Vite, TanStack Router, Tailwind v4, Radix UI
- **Backend:** Node.js serverless function on Vercel (`api/index.ts`)
- **Database:** Supabase (Postgres), with a local JSON fallback for development

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The API runs inside the Vite dev server, so no
second process is needed. Without Supabase variables, data is stored in
`.data/*.json` and seeded with the demo data on the first request. Delete the
`.data` folder to start over.

Use the user card at the bottom of the menu (**Sign in as**) to switch between
an administrator, a service technician and a broker.

## Roles

| Role | Calendar | Team, developments, settings |
| --- | --- | --- |
| Administrator | Sees and manages everyone's appointments | Full access |
| Service technician | Only their own appointments | Read-only |
| Real estate broker | Only their own appointments | Read-only |

The API enforces these rules; the UI just hides what you can't use.

> Sign-in is a demo: the app sends the chosen user id in the `x-user-id`
> header. Before real use, replace `server/lib/session.ts` with Supabase Auth
> (verify the JWT and look the user up by its id).

## Tickets and workflows

Admins open **Tickets > Workflows & fields** to design how each kind of
request is handled:

- **Workflows** hold their own statuses (name, color and a category: To do,
  In progress, Waiting, Done or Cancelled) and the **transitions** between
  them. Each transition is a button on the ticket with a label, the roles
  allowed to use it, whether it needs a comment, and which custom fields must
  be filled first. "From any status" transitions work for things like Cancel.
  A live diagram shows the flow while you edit it.
- **Ticket types** (Warranty claim, Water leak, Maintenance request, Sales
  inquiry...) pick a workflow, a default priority, an SLA in hours, and their
  **custom fields**: short/long text, number, amount, date, dropdown or
  checkbox, optionally required when the ticket is opened.

On a ticket, people only see the steps their role may take from the current
status; if a step needs fields or a comment, a small form asks for them. The
board view lets you drag tickets between statuses of one type, following the
same rules. Every change is recorded in the ticket's activity.

The API enforces all of this: invalid workflows are rejected, statuses that
still hold tickets can't be removed, and employees only see and work on
tickets assigned to them.

## Deploy to Vercel with Supabase

1. **Create the database.** In [Supabase](https://supabase.com), create a
   project, open **SQL Editor**, and run every file in `supabase/migrations/`
   in order, from `0001_init.sql` to the last one (one at a time).
2. **Get the keys.** In Supabase, open **Project Settings > API** and copy the
   **Project URL** and the **service_role** key.
3. **Import the project.** Push this folder to GitHub, then in
   [Vercel](https://vercel.com/new) import the repository. If the repository
   root isn't this folder, set **Root Directory** to it. The framework preset
   is detected from `vercel.json`.
4. **Add environment variables** (Project > Settings > Environment Variables):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service_role key

   Or add the official **Supabase integration** from the Vercel marketplace,
   which sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for you.
5. **Deploy.** Open `https://<your-app>.vercel.app/api/health`. It should show
   `"storage": "supabase"`. The first request seeds the demo data.

To use Supabase locally too, copy `.env.example` to `.env.local` and fill in
the same two variables.

Without the variables, the deployed app still works, but it falls back to
temporary files in `/tmp` that are wiped whenever Vercel restarts the function
(`/api/health` then shows `"persistent": false`).

## Project layout

```
api/index.ts          Vercel function: forwards every /api/* request to the router
server/router.ts      All API routes
server/handlers/      Users, developments/blocks/units, calendar, tickets, settings, releases
server/repos/         Storage: Supabase (Postgres) or local JSON files
server/seed/          Fictional release notes
shared/               Types and demo data used by both frontend and backend
src/routes/           Pages: calendar, tickets, team, developments, whats-new
supabase/migrations/  Database schema
```

## API

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/health` | anyone |
| GET | `/api/users` | anyone (for the sign-in menu) |
| POST, PUT, DELETE | `/api/users[/:id]` | admin |
| GET | `/api/me` | signed in |
| GET | `/api/clients`, `/api/developments[/:id]` | signed in |
| POST, PUT, DELETE | `/api/developments`, `/api/blocks`, `/api/units` | admin |
| GET, POST | `/api/calendar/events` | signed in (employees: own only) |
| PUT, DELETE | `/api/calendar/events/:id` | owner or admin |
| GET / PUT | `/api/settings/calendar` | signed in / admin |
| GET | `/api/ticket-config` (workflows + types) | signed in |
| POST, PUT, DELETE | `/api/workflows[/:id]`, `/api/ticket-types[/:id]` | admin |
| GET, POST | `/api/tickets` | signed in (employees: assigned to them) |
| GET, PUT | `/api/tickets/:id` | assignee or admin |
| POST | `/api/tickets/:id/transition`, `/api/tickets/:id/comments` | assignee or admin |
| DELETE | `/api/tickets/:id` | admin |
| GET / POST | `/api/releases` (release notes) | anyone / admin |
