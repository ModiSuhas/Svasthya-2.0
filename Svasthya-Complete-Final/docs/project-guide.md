# Svasthya project guide

## Project idea

Svasthya is a health-center operations system that connects patient registration, appointments, consultation notes, laboratory work, prescriptions, and medicine stock in one staff workspace. Its main goal is to reduce repeated data entry and help each authorized team member see the next step in a visit.

## Main modules

| Module | What it supports |
| --- | --- |
| Overview | Daily patient, appointment, laboratory, stock, and prescription counts; explains the care pathway. |
| Patients | Registration, generated clinic MRN, search, editable demographic details, and a visit history. |
| Appointments & queue | Scheduling, patient/MRN search, status filtering, urgency, and visit progression. |
| Consultations | Chief complaint, assessment, notes, and validated vital signs. |
| Laboratory | Test requests, priority, status, results, and private report downloads. |
| Prescriptions | Multiple medicine instructions per prescription and pharmacy dispensing. |
| Pharmacy & stock | Medicine catalogue, dated stock batches, expiry checks, and low-stock thresholds. |
| Reports & audit | Operational totals, patient register export, and recent staff activity (administrator only). |
| My account | Editable staff name and email plus password change. |

## Role-based access

- **Administrator:** all workflows, staff access, reports, and audit history.
- **Registration:** patient records and appointment scheduling/queue updates.
- **Doctor:** patient history, appointments, consultations, laboratory requests, and prescriptions.
- **Laboratory:** assigned lab workflow, result entry, and report upload.
- **Pharmacy:** prescriptions, dispensing, and medicine stock.

The interface hides pages that do not belong to a role, and the API checks permissions on each request. New accounts receive a temporary password and must change it before opening patient workflows.

## Data quality and validation

Forms use required fields, length and number limits, email and phone checks, future appointment dates, non-future patient birth dates, matching password confirmation, and conditional checks for lab results and medicine batches. The API repeats critical checks before database writes, so browser validation is not the only safeguard.

## Suggested classroom demonstration

Use synthetic data and an administrator-created set of demo staff accounts.

1. Sign in as registration staff, register a patient, and show the generated MRN.
2. Schedule an appointment and filter the queue by patient or visit status.
3. Sign in as a doctor, open the patient record, save a consultation with sample vitals, and create a lab request and prescription.
4. Sign in as laboratory staff, enter a sample result, and optionally attach a non-sensitive sample PDF.
5. Sign in as pharmacy staff, add a dated medicine batch, then dispense the prescription.
6. Return as administrator to review reports and the audit trail, then open My account to update the demo profile.

## Technical structure

- **Frontend:** React 19 and Vite.
- **Backend:** Node.js and Express API with session-based staff authentication.
- **Database:** PostgreSQL schema and migration scripts.
- **Files:** lab reports are stored outside the public static directory and served through an authorized API route.
- **Deployment:** Docker Compose configures the app and database for a local demonstration.

This is an academic/demo project with synthetic records. Review clinical, privacy, and security requirements before using it with real patient information. Setup and deployment steps are in [`../README.md`](../README.md).
