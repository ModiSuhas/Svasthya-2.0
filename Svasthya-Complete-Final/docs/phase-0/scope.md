# Phase 0 — Scope and assumptions

## Purpose

Svasthya is a web application for a community health center to coordinate patient registration, appointments, consultations, laboratory work, prescriptions, pharmacy stock, and operational reporting.

## Baseline roles inferred from the supplied prototype

- Registration staff: create patient records and appointments, manage the waiting queue.
- Doctor: review assigned patients, record consultations, order laboratory tests, and issue prescriptions.
- Laboratory staff: process orders, record results, and attach reports.
- Pharmacy staff: manage medicines and stock, review prescriptions, and record dispensing.
- Administrator: manage staff accounts and review operational summaries.

## Initial launch assumptions to confirm

- One health center; facility identifiers are included in the schema so a multi-facility deployment can be added deliberately.
- Staff-only accounts. Patient self-service, payments, telemedicine, and ABDM integration are out of the initial build unless separately approved.
- The supplied screen content is demo content. Do not import it as real patient data.
- No medical decision support or automated clinical recommendations are in scope.
- The organization must approve the privacy notice, data retention schedule, and incident response plan before real patient data is entered.

## Out of scope for this package

- Legal or regulatory certification.
- Production cloud account setup, domain purchase, SMS/email provider, or ABDM production credentials.
- Migration of real patient information.

## Decisions required before live use

| Decision | Current default | Owner/status |
| --- | --- | --- |
| Launch facility and country | One facility in India | Confirm |
| Patient login | Not enabled | Confirm |
| ABDM / ABHA integration | Not enabled | Confirm |
| Hosting region and operator | Not selected | Confirm |
| Record retention and deletion | Must be approved by clinic/legal adviser | Pending |
| Emergency/critical-result escalation contact | Clinic-defined | Pending |
