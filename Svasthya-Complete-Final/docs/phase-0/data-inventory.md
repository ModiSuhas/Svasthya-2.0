# Phase 0 — Data inventory and handling

This is a planning inventory, not legal approval. The health center must confirm every field, purpose, access rule, retention period, and deletion/correction process before production use.

| Data group | Examples | Purpose | Default access |
| --- | --- | --- | --- |
| Patient identity/contact | Name, MRN, date of birth, phone, address | Identify and contact the patient for care | Registration; care-team roles as needed |
| Clinical record | Complaint, vitals, assessment, plan, allergies | Support the care episode and continuity | Doctor; limited role-based views for lab/pharmacy |
| Appointment/queue | Time, reason, priority, status, assigned doctor | Coordinate clinic visits | Registration, doctor, admin |
| Lab record | Test, priority, result, report file, status | Perform and communicate diagnostic work | Doctor and lab; patient-related view only where needed |
| Prescription/dispensing | Medicine, directions, quantities, dispense history | Provide and track prescribed treatment | Doctor and pharmacy |
| Inventory | Medicine, batch, expiry, quantity, threshold | Control pharmacy stock | Pharmacy and admin |
| Security/audit | Actor, action, entity, time, request metadata | Trace access and changes, investigate incidents | Restricted admin/security access |

Never use real patient data in local development, screenshots, demo seed data, or issue reports. Retention, backups, access review, and incident handling must be approved by the organization.
