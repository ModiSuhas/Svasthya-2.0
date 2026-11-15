# Phase 0 — Core workflows

## Registration and appointment

1. Staff search for an existing patient using the clinic MRN, name, or phone number.
2. If no match exists, staff create a patient record and receive a clinic-generated MRN.
3. Staff schedule an appointment or add the patient to the walk-in queue, set a reason and priority, and optionally assign a doctor.
4. The queue records arrival, in-progress, completed, or cancelled status changes.

## Consultation

1. A doctor opens a queued patient and reviews the minimum necessary patient information.
2. The doctor records the complaint, observations/vitals, assessment, and plan.
3. The doctor saves or completes the consultation and may create a lab order or prescription.
4. Changes to a completed note must be traceable; the system must not silently overwrite its audit history.

## Laboratory

1. A doctor creates a lab order with test name and priority.
2. Lab staff process the order and enter a result, optionally attaching a report.
3. The order status and result are visible to authorized staff; urgent or critical results follow a clinic-approved escalation process.

## Pharmacy

1. Pharmacy staff review an active prescription and the available stock.
2. Staff record the quantity dispensed; the operation reduces stock and is linked to the prescription and user.
3. Stock alerts identify low or expired stock. Expired stock must not be dispensed.

## Administration

1. An administrator creates, disables, or changes staff role assignments.
2. Dashboard and report totals come from saved records and show their date range.
3. Exports and sensitive record access are restricted to authorized roles and recorded in the audit trail.
