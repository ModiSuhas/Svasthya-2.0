# Svasthya

A responsive React and Express healthcare workflow portal. It models a fictional primary health centre in Ahmedabad, Gujarat, India. All sample staff, patients, visits, and medicines are fictional. Do not enter real patient information.

## What is included

- **Admin:** create staff accounts and assign portal roles; browse staff and system records.
- **Registration:** register patients with height, weight, blood pressure, and pulse; search existing records and start repeat visits.
- **Doctor / MO:** work from the care queue; record symptoms, examination, diagnosis, notes, and follow-up; request lab tests, prescribe medicines, file presumptive case records, or complete a visit.
- **Laboratory:** track requests from sample collection through testing and result verification; send verified results back for doctor review.
- **Pharmacy:** dispense prescriptions, manage stock batches and adjustments, and review low-stock and near-expiry alerts. Expired and insufficient stock cannot be dispensed.
- **Reports:** filter presumptive case reports and a disease-wise laboratory summary by date; export CSV or print. The lab summary includes the disease categories and age/sex breakdown shown in the supplied reference.
- **Shared tools:** role-focused dashboards, actionable task counts, patient search, account settings, password changes, sign out, recent account activity, and Help & About.

Portals use the six supplied color families with stronger accents for key actions and status. Layouts adapt to desktop and mobile screens.

## Stack

React 19 and Vite (web interface), Node.js and Express (API), PostgreSQL (database), Prisma (database schema/client), and Docker Compose (local setup).

## Run with Docker Desktop

1. Install and open Docker Desktop. Wait until it shows that Docker is running.
2. Open a terminal in the extracted `Svasthya` folder (the folder containing `docker-compose.yml`).
3. Start the app and database:

   ```bash
   docker compose up -d --build
   ```

4. Open [http://localhost:4000](http://localhost:4000). The first startup downloads the base images and dependencies, creates the database tables, and adds sample records; it may take several minutes on a slow connection.
5. To inspect startup messages, run `docker compose logs -f app`. Press `Ctrl+C` to leave the log view; the containers keep running.
6. Stop the containers with `docker compose down`. The database volume remains. `docker compose down -v` permanently removes the local database.

If another copy of Svasthya is already running, use the same Compose project name that started it so Docker reuses those containers. Otherwise stop the old copy before starting this one, because local ports 4000 and 5433 can only be used once.

## Sample staff accounts

All sample accounts use **`Demo@12345`**. Use these credentials to access the included sample staff accounts.

| Portal | Email |
| --- | --- |
| Admin | `admin@svasthya.local` |
| Registration | `registration@svasthya.local` |
| Doctor / MO | `doctor@svasthya.local` |
| Laboratory | `lab@svasthya.local` |
| Pharmacy | `pharmacy@svasthya.local` |

Each staff member can update their display name and change their own password in Account settings. A password change requires the current password and signs that user out. Admin manages staff role and email; Admin cannot reset another staff member’s password.

## Local development without Docker for the app

Install Node.js 20 or newer and Docker Desktop for PostgreSQL. From the project folder:

```powershell
Copy-Item .env.example .env
docker compose up -d db
npm ci
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite forwards `/api` requests to Express on port 4000. PostgreSQL is available locally on port 5433. On macOS/Linux, use `cp .env.example .env` for the first command.

## Project structure

```text
src/                 React pages, components, and styles
server/src/          Express API, authentication, permissions, and workflows
prisma/schema.prisma PostgreSQL data model
prisma/seed.ts       Sample accounts, patients, and medicines
docker-compose.yml   Local PostgreSQL and app containers
```

## Useful commands

```bash
npm run dev          # React and Express development servers
npm run build        # Build frontend assets
npm run db:generate  # Regenerate Prisma client
npx prisma db push   # Apply schema to the local database
npm run db:seed      # Add/refresh sample records
npm run db:studio    # Open a local database browser
```

## Security and privacy

The API includes password hashing, HTTP-only session cookies, same-site cookie policy, CSRF protection for state-changing requests, role checks, request validation, Helmet security headers, sign-in rate limiting, and audit records. Secrets are supplied through environment variables; never commit `.env`.

This is an educational prototype, not a clinically validated or production-ready health-record system. Before using real patient information, it would need professional security and privacy review, backup/restore procedures, deployment hardening, accessibility review, and validation against applicable health and reporting requirements. Clinical decisions remain the responsibility of qualified health professionals.


