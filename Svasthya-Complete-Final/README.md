# Svasthya Health Center

Svasthya is a staff-facing health-center operations web application. This package includes a React/Vite interface, Node API, PostgreSQL schema, session-based authentication, role permissions, private lab-report uploads, and Docker Compose setup.

## Included workflows

- Public landing page describing the platform, connected care pathway, staff sign-in entry, and an OpenStreetMap area map for Shantigram, Ahmedabad.
- Staff sign-in, editable personal profile, password change, and administrator-managed staff accounts.
- Patient registration, generated clinic MRNs, search, appointment scheduling, searchable/status-filtered queue management.
- Doctor consultation notes and vital signs.
- Laboratory orders, priority/status tracking, result entry, and private PDF/JPG/PNG report downloads.
- Prescriptions and pharmacy dispensing against non-expired stock batches.
- Medicine inventory, batch expiry, low-stock alerts, admin reports, CSV export, and audit events.
- Shared form checks for required values, email and phone formats, password confirmation, clinical number ranges, appointment dates, and stock/result conditions.
- The dashboard explains the connected patient-care pathway; operational pages are opened from the role-specific navigation.
- Original static HTML screens are retained under `public/legacy` for reference; the live app uses the React interface.
- See [`docs/project-guide.md`](docs/project-guide.md) for the project objectives, module map, role demo, and assessment walkthrough.

## Local development

Prerequisites: Node.js 24 LTS (recommended; Node.js 22.12+ or 20.19+ also satisfies the included Vite toolchain), npm, and Docker Desktop (for PostgreSQL). [Vite runtime requirements](https://vite.dev/guide/) · [Node.js release schedule](https://nodejs.org/en/about/previous-releases)

1. Copy `.env.example` to `.env` (the ZIP intentionally includes only the example file; create your own local secrets).
2. Set `POSTGRES_PASSWORD` to a strong alphanumeric value. Set `SESSION_SECRET` to at least 32 random characters. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; the password must be at least 12 characters. Keep `.env` private.
3. Start the database: `docker compose up -d db`.
4. Set `DATABASE_URL` in `.env` to `postgres://svasthya:<POSTGRES_PASSWORD>@localhost:5432/svasthya`.
5. Install the app packages: `npm install`.
6. Create the schema: `npm run db:migrate`.
7. Create the first administrator: `npm run db:seed`.
8. Start the API and frontend: `npm run dev`.
9. Open `http://localhost:5173` and sign in with the administrator email and password from `.env`.

The Vite development server proxies `/api` to the Node API on port 3000. If changing ports, update `vite.config.js` and the corresponding environment settings.

## Run the containerized app

1. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `SESSION_SECRET`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD` as described above.
2. Build and start the app: `docker compose up --build -d`.
3. Create the first administrator: `docker compose exec app npm run db:seed`.
4. Open `http://localhost:3000`.

The copied `.env.example` uses `NODE_ENV=development` so the local HTTP address works. Set `NODE_ENV=production` in the deployment environment before hosting the app publicly; production mode requires HTTPS and a strong session secret.

Compose runs database migrations on app startup. PostgreSQL data and uploaded lab reports are stored in Docker volumes. Back up both volumes and test restoration before relying on the system.

## Staff roles

The initial roles are `admin`, `registration`, `doctor`, `laboratory`, and `pharmacy`. There is no public sign-up. An administrator creates staff accounts with a temporary password; each new staff member must change it before accessing patient workflows. Access is checked by the API on every request, and disabling an account blocks its next request.

## Production deployment checklist

- Use HTTPS through a maintained reverse proxy or managed platform; do not expose the Node port directly to the public internet.
- Set a unique, strong `SESSION_SECRET`, strong database credentials, and production environment variables using the hosting provider’s secret manager.
- Use a managed PostgreSQL service or a properly monitored database host. Set `PGSSL=true` when required by the database provider.
- Configure durable private storage for `/data/uploads`; uploaded reports are not served as public static files.
- Configure database and upload backups, alerting, log retention, incident response, and a tested restore procedure.
- Have the health center approve staff permissions, privacy notices, retention/deletion processes, operational workflows, and any applicable legal and security requirements before entering real patient data.
- Use a staging environment with synthetic data. Do not use real patient records in development, demo seeds, screenshots, or support tickets.

## Security and clinical-use limitations

This is a deployable software project, not a certification of regulatory compliance or a substitute for clinical governance. The clinic must review the workflows and data fields with qualified clinical, privacy, and security owners. This package does not include patient self-service, telemedicine, payments, ABDM/ABHA integration, email/SMS delivery, external identity verification, or automated medical advice. These require separate product, security, and integration work.

The application includes role checks, secure HTTP-only session cookies, password hashing, basic sign-in rate limiting, input limits, request-origin checks in production, protected report downloads, and audit records. Before live use, perform an independent security review and confirm that infrastructure, backups, log access, retention, and incident procedures are appropriate for the clinic.
