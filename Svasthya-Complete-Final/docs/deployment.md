# Deployment notes

The Docker Compose file is intended for a small, single-host deployment or evaluation environment. For a public production deployment, put the app behind HTTPS and use managed/monitored PostgreSQL and durable private file storage. Do not treat Docker volumes on one machine as a complete backup strategy.

## Required production values

- `SESSION_SECRET`: unique random secret, at least 32 characters.
- `DATABASE_URL`: restricted database account and TLS settings as required by the provider.
- `UPLOAD_DIR`: private durable storage path, mounted only to the application.
- `NODE_ENV=production`.
- HTTPS termination must forward the original host and protocol to the app; production cookie and request-origin checks depend on those headers.

Do not commit `.env`, patient data, report files, backups, or live credentials to source control. Do not expose PostgreSQL or the report directory publicly.

## Go-live gate

Before entering real health information, the operating organization should approve the privacy notice and lawful basis, retention and correction/deletion procedures, user access matrix, clinical workflow, incident response contacts, backup/restore runbook, and the applicable jurisdiction-specific obligations. Arrange independent security review and a limited staff pilot using synthetic data first.
