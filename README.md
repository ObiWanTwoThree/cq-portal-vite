# CQ Services Portal (CQ Workplace Portal)

Internal jobs/tasks portal for CQ Services. Built with Vite + React + TypeScript and backed by Supabase (Auth, Postgres, Storage).

## What it does

- **Authentication**: email/password login via Supabase Auth.
- **Role-based dashboards**:
  - **Admin**: view all tasks and create new tasks.
  - **Operative**: view available tasks, self-assign tasks, and manage assigned tasks.
- **Task workflow**:
  - create tasks with category/location/due date/notes
  - upload images/files to Supabase Storage (`task-files`)
  - task details page with updates/chat thread (`task_comments`)
  - export a simple PDF from the task details screen

## Tech stack

- **Frontend**: React, React Router, Zustand, React Hook Form, Zod
- **Styling**: Tailwind
- **Backend**: Supabase (Auth + Database + Storage)
- **PWA**: `vite-plugin-pwa`

## Prerequisites

- Node.js + npm (or pnpm)
- A Supabase project with:
  - tables: `profiles`, `tasks`, `task_comments`, `invites` (see below)
  - storage bucket: `task-files`

## Environment variables

Create `.env.local` in the repo root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Notes:
- These values are read in `src/lib/supabaseClient.ts`.
- **Do not** use the Supabase **service role key** in the browser.

## Install & run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## App routes

- `/login`: sign in
- `/register`: set password for invite/recovery flows
- `/dashboard`: role-based dashboard
- `/dashboard/new-task`: create a task (admin)
- `/task/:id`: task details + updates/chat + file upload + PDF export
- `/users`: user management (admins only) — invite users, resend set-up links, change roles

## Supabase data model (expected)

This is the shape the UI code expects.

### `profiles`

- `id` (uuid, **matches** `auth.users.id`, PK)
- `full_name` (text, optional)
- `role` (text: `'admin' | 'operative'`)

### `tasks`

- `id` (uuid, PK)
- `title` (text)
- `category` (text)
- `location` (text)
- `notes` (text, optional)
- `due_date` (date)
- `status` (text, e.g. `Open`)
- `created_by` (uuid, references user id)
- `assigned_to` (uuid, nullable; operative user id when assigned)
- `image_urls` (text[]; public storage URLs)
- `created_at` (timestamptz)

### `task_comments`

- `id` (uuid, PK)
- `task_id` (uuid, FK to `tasks.id`)
- `user_id` (uuid)
- `user_name` (text; currently set to the user email)
- `content` (text; message text or an image URL)
- `created_at` (timestamptz)

### `invites`

Used by the `/register` flow to mark invites as accepted:

- `email` (text, unique)
- `accepted` (boolean)

## User management (`admin-users` Edge Function)

The `/users` page calls the `admin-users` Supabase Edge Function
(`supabase/functions/admin-users/index.ts`). It runs with the service role key, checks
that the caller's `profiles.role` is `admin`, and then lists users, sends invites, resends
set-up links or changes roles. The service role key never reaches the browser.

Deploy it with the Supabase CLI (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
provided to Edge Functions automatically):

```bash
supabase functions deploy admin-users
```

Invite and set-up emails link back to `<app origin>/register`, so add that URL to
**Auth → URL Configuration → Redirect URLs** in Supabase. Until the function is deployed,
`/users` shows a read-only list from `profiles`.

## Deployment

This repo includes `vercel.json` for SPA rewrites. Set the environment variables above in your hosting provider.
