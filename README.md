# Svasthya React

This is the React version of the Svasthya healthcare interface. It keeps every original screen under one React application and adds browser-enforced form validation.

## Run it

1. Install Node.js (LTS) from https://nodejs.org if it is not already installed.
2. Open this **Svasthya-React** folder in VS Code.
3. Open the VS Code terminal: **Terminal → New Terminal**.
4. Run `npm install` once to download the project packages.
5. Run `npm run dev`.
6. Ctrl+click the local address shown in the terminal (normally `http://localhost:5173`).
7. To stop the app, click the terminal and press `Ctrl + C`.

## Validation included

- Required fields cannot be submitted empty.
- Email, password length (at least 8 characters), password confirmation, and 10-digit Indian phone number validation are included.
- Age, stock, height, and weight use sensible number ranges.
- Expiry dates cannot be in the past.
- Required clinical, patient, medicine, lab, and appointment fields are checked before saving.

This is a front-end prototype: successful submits show confirmation and reset the form; no patient information is saved to a database.
