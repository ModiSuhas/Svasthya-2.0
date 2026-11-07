import { useEffect, useMemo, useState } from 'react';
import { api, json, putJson } from './api.js';
import Landing from './Landing.jsx';

const roleNames = { admin: 'Administrator', registration: 'Registration', doctor: 'Doctor', laboratory: 'Laboratory', pharmacy: 'Pharmacy' };
const nav = [
  { id: 'dashboard', label: 'Overview', roles: ['admin','registration','doctor','laboratory','pharmacy'], icon: '⌂' },
  { id: 'patients', label: 'Patients', roles: ['admin','registration','doctor'], icon: '♙' },
  { id: 'appointments', label: 'Appointments & queue', roles: ['admin','registration','doctor'], icon: '▦' },
  { id: 'consultations', label: 'Consultations', roles: ['admin','doctor'], icon: '✚' },
  { id: 'laboratory', label: 'Laboratory', roles: ['admin','doctor','laboratory'], icon: '⚗' },
  { id: 'prescriptions', label: 'Prescriptions', roles: ['admin','doctor','pharmacy'], icon: '▤' },
  { id: 'pharmacy', label: 'Pharmacy & stock', roles: ['admin','pharmacy'], icon: '▣' },
  { id: 'reports', label: 'Reports & audit', roles: ['admin'], icon: '◫' },
  { id: 'users', label: 'Staff accounts', roles: ['admin'], icon: '♧' },
];

async function loadOrThrow(path) { return api(path); }
function useRecords(path, key = '') {
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const reload = () => { setBusy(true); loadOrThrow(path).then((value) => { setData(value); setError(''); }).catch((e) => setError(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { let live = true; loadOrThrow(path).then((value) => { if (live) { setData(value); setError(''); } }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [path, key]);
  return { data, error, busy, reload };
}

function useAction() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work, success = 'Saved.') => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage(success); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };
  const alerts = <>{error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}</>;
  return { run, busy, alerts, error, message };
}

function localDateValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function localDateTimeValue() {
  const now = new Date(Date.now() + 60_000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function validateFormSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const fields = [...form.querySelectorAll('input, select, textarea')];
  fields.forEach((field) => field.setCustomValidity(''));

  const fail = (field, message) => {
    field.setCustomValidity(message);
    field.setAttribute('aria-invalid', 'true');
  };
  for (const field of fields) {
    const value = typeof field.value === 'string' ? field.value.trim() : '';
    if (field.required && !value) fail(field, 'Please complete this field.');
    if (field.dataset.validate === 'phone' && value && (!/^\+?[0-9().\s-]{7,24}$/.test(value) || value.replace(/\D/g, '').length < 7 || value.replace(/\D/g, '').length > 15)) {
      fail(field, 'Enter a phone number using 7–15 digits.');
    }
    if (field.dataset.validate === 'blood-pressure' && value && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)) {
      fail(field, 'Enter blood pressure as systolic/diastolic, for example 120/80.');
    }
    if (field.dataset.match) {
      const matchField = form.elements.namedItem(field.dataset.match);
      if (matchField && field.value !== matchField.value) fail(field, 'The values do not match.');
    }
    if (field.dataset.requiredWhen) {
      const [dependencyName, condition] = field.dataset.requiredWhen.split(':');
      const dependency = form.elements.namedItem(dependencyName);
      const active = condition === 'positive' ? Number(dependency?.value) > 0 : Boolean(dependency?.value);
      if (active && !value) fail(field, 'Complete this field when adding stock.');
    }
  }

  if (form.dataset.requiredAny) {
    const requiredAny = form.dataset.requiredAny.split(',').map((name) => form.elements.namedItem(name));
    const hasValue = requiredAny.some((field) => field && (field.type === 'file' ? field.files?.length : field.value.trim()));
    if (!hasValue && requiredAny[0]) fail(requiredAny[0], 'Enter a result or attach a report.');
  }

  if (!form.checkValidity()) {
    event.preventDefault();
    event.stopPropagation();
    form.reportValidity();
  }
}

function markInvalidField(event) {
  if (event.target instanceof HTMLElement) event.target.setAttribute('aria-invalid', 'true');
}

function clearFormErrors(event) {
  const form = event.target.form;
  if (!form) return;
  form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute('aria-invalid');
    field.setCustomValidity('');
  });
}

function FormValidationBoundary({ children }) {
  return <div className="form-validation-boundary" onSubmitCapture={validateFormSubmit} onInvalidCapture={markInvalidField} onInputCapture={clearFormErrors}>
    {children}
  </div>;
}

function TextField({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}
function SelectField({ label, children, ...props }) {
  return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;
}
function PageTitle({ eyebrow, title, children }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children}</div>;
}
function Stat({ label, value, detail, tone = '' }) {
  return <div className={`stat-card ${tone}`}><span>{label}</span><strong>{value ?? '—'}</strong><small>{detail}</small></div>;
}
function LoadingOrError({ busy, error }) {
  if (busy) return <div className="empty">Loading…</div>;
  if (error) return <div className="notice error">{error}</div>;
  return null;
}
function statusChip(status) {
  const label = String(status || '').replaceAll('_', ' ');
  return <span className={`chip ${String(status).includes('urgent') ? 'urgent' : String(status).includes('completed') || status === 'dispensed' ? 'good' : ''}`}>{label || '—'}</span>;
}

function Login({ onLogin, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  async function submit(event) {
    event.preventDefault();
    await action.run(async () => onLogin(await api('/auth/login', json({ email, password }))), 'Signed in.');
  }
  return <main className="login-wrap"><section className="login-card">
    <div className="brand-mark large">S</div><p className="eyebrow">COMMUNITY HEALTH CENTER</p><h1>Welcome to Svasthya</h1>
    <p className="muted">Sign in with the staff account created by your administrator.</p>
    {action.alerts}
    <form onSubmit={submit} className="stack">
      <TextField label="Work email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="button primary full" disabled={action.busy}>{action.busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="login-foot">For access, contact your health center administrator.</p>
    <button type="button" className="login-home-link" onClick={onBack}>← Back to the Svasthya home page</button>
  </section></main>;
}

function Shell({ user, view, setView, onLogout, children }) {
  const menu = nav.filter((item) => item.roles.includes(user.role));
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><strong>Svasthya</strong><small>Health center</small></div></div>
      <div className="facility-label">CARE WORKSPACE</div>
      <nav>{menu.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><span className="live-dot" /> Secure staff workspace</div><button className={`nav-item ${view === 'account' ? 'active' : ''}`} onClick={() => setView('account')}><span className="nav-icon">⚙</span>My account</button></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div><span className="topbar-kicker">SVASTHYA</span><span className="topbar-page">{nav.find((x) => x.id === view)?.label || 'My account'}</span></div><div className="user-actions"><div className="avatar">{user.name.split(/\s+/).map((s) => s[0]).join('').slice(0,2).toUpperCase()}</div><div className="user-name"><strong>{user.name}</strong><small>{roleNames[user.role]}</small></div><button className="button subtle" onClick={onLogout}>Sign out</button></div></header>
      <main className="content">{children}</main>
      <footer className="footer"><span>© Svasthya · Health center operations</span><span>Patient data access is role controlled and audited</span></footer>
    </div>
  </div>;
}

function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setStats).catch((e) => setError(e.message)); }, []);
  const greeting = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), []);
  return <>
    <PageTitle eyebrow={`${roleNames[user.role]} workspace`} title={`Good day, ${user.name.split(' ')[0]}`}><div className="today-pill">{greeting}</div></PageTitle>
    {error && <div className="notice error">{error}</div>}
    <section className="stats-grid">
      <Stat label="Registered patients" value={stats?.patients} detail="Patient directory" />
      <Stat label="Appointments today" value={stats?.appointments?.total} detail={`${stats?.appointments?.waiting ?? '—'} waiting or in progress`} tone="blue" />
      <Stat label="Lab work pending" value={stats?.pendingLabs?.count} detail={`${stats?.pendingLabs?.urgent ?? '—'} urgent`} tone="amber" />
      <Stat label="Low stock items" value={stats?.lowStock} detail="At or below reorder threshold" tone="rose" />
    </section>
    <div className="dashboard-grid">
      <section className="panel journey-panel"><div className="panel-heading"><div><p className="eyebrow">PATIENT CARE PATHWAY</p><h2>One visit, connected steps</h2></div><span className="panel-mark">↗</span></div>
        <p className="muted journey-intro">Svasthya keeps each stage in the same patient record, so the care team can follow a visit from arrival to next steps.</p>
        <div className="journey-track">
          {[['01', 'Register', 'Create a patient record and clinic MRN.'], ['02', 'Coordinate', 'Schedule the visit and manage the queue.'], ['03', 'Care', 'Record consultation notes and orders.'], ['04', 'Follow through', 'Track lab results and dispensing.']].map(([step, title, detail]) => <div className="journey-step" key={step}><span className="journey-number">{step}</span><div><strong>{title}</strong><small>{detail}</small></div></div>)}
        </div>
      </section>
      <aside className="panel focus-panel"><p className="eyebrow">TODAY AT A GLANCE</p><h2>Care, coordinated.</h2><p>Keep each visit moving through registration, consultation, diagnostics, and dispensing.</p>
        <div className="focus-metric"><span>Open prescriptions</span><strong>{stats?.openPrescriptions ?? '—'}</strong></div>
        <div className="role-focus"><span className="live-dot" /><span><strong>{roleNames[user.role]}</strong><small>Your available workspaces are listed in the navigation.</small></span></div>
      </aside>
    </div>
    <div className="demo-notice"><strong>Before live use</strong><span>Review account permissions, privacy notices, backups, and clinic workflows. This project includes no real patient records.</span></div>
  </>;
}

function Patients({ user }) {
  const [query, setQuery] = useState('');
  const [key, setKey] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const { data: patients, error, busy, reload } = useRecords(`/patients?q=${encodeURIComponent(query)}`, key);
  const action = useAction();
  const canCreate = ['admin','registration'].includes(user.role);
  const canEdit = canCreate;
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetail(null); setDetailError('');
    api(`/patients/${selectedId}`).then(setDetail).catch((e) => setDetailError(e.message));
  }, [selectedId]);
  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const ok = await action.run(() => api('/patients', json(values)), 'Patient record created.');
    if (ok) { form.reset(); reload(); }
  }
  async function updatePatient(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const ok = await action.run(async () => { const next = await api(`/patients/${selectedId}`, putJson('PATCH', values)); setDetail((previous) => ({ ...previous, ...next })); }, 'Patient record updated.');
    if (ok) reload();
  }
  return <>
    <PageTitle eyebrow="PATIENT DIRECTORY" title="Patients"><span className="count-pill">{patients.length} records</span></PageTitle>
    {canCreate && <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">NEW RECORD</p><h2>Register a patient</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid">
        <TextField name="name" label="Full name *" required minLength="2" maxLength="160" autoComplete="name" />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" maxLength="30" data-validate="phone" />
        <TextField name="dateOfBirth" label="Date of birth" type="date" max={localDateValue()} />
        <SelectField name="sex" label="Sex"><option>Not specified</option><option>Female</option><option>Male</option><option>Other</option></SelectField>
        <SelectField name="bloodGroup" label="Blood group"><option value="">Not recorded</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-','Other'].map((group) => <option key={group} value={group}>{group}</option>)}</SelectField>
        <TextField name="address" label="Address" maxLength="500" />
        <TextField name="allergies" label="Known allergies" maxLength="2000" />
        <TextField name="notes" label="Registration notes" maxLength="2000" />
        <div className="form-actions"><button className="button primary" disabled={action.busy}>Save patient</button></div>
      </form>
    </section>}
    {selectedId && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PATIENT RECORD</p><h2>{detail?.name || 'Loading record…'}</h2></div><button className="button subtle" onClick={() => setSelectedId('')}>Close</button></div>
      {detailError && <div className="notice error">{detailError}</div>}{detail && <>
        {action.alerts}
        {canEdit ? <form onSubmit={updatePatient} className="form-grid"><div className="record-mrn">Clinic MRN <strong>{detail.mrn}</strong></div><TextField name="name" label="Full name" required minLength="2" maxLength="160" defaultValue={detail.name} /><TextField name="phone" label="Phone" type="tel" data-validate="phone" maxLength="30" defaultValue={detail.phone || ''} /><TextField name="dateOfBirth" label="Date of birth" type="date" max={localDateValue()} defaultValue={detail.date_of_birth ? String(detail.date_of_birth).slice(0,10) : ''} /><SelectField name="sex" label="Sex" defaultValue={detail.sex}><option>Not specified</option><option>Female</option><option>Male</option><option>Other</option></SelectField><SelectField name="bloodGroup" label="Blood group" defaultValue={detail.blood_group || ''}><option value="">Not recorded</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-','Other'].map((group) => <option key={group} value={group}>{group}</option>)}</SelectField><TextField name="address" label="Address" maxLength="500" defaultValue={detail.address || ''} />{user.role === 'admin' && <><TextField name="allergies" label="Known allergies" maxLength="2000" defaultValue={detail.allergies || ''} /><TextField name="notes" label="Registration notes" maxLength="2000" defaultValue={detail.notes || ''} /></>}<div className="form-actions"><button className="button primary" disabled={action.busy}>Save changes</button></div></form> : <div className="record-summary"><span><small>MRN</small><strong>{detail.mrn}</strong></span><span><small>Phone</small><strong>{detail.phone || '—'}</strong></span><span><small>Date of birth</small><strong>{detail.date_of_birth ? String(detail.date_of_birth).slice(0,10) : '—'}</strong></span><span><small>Blood group</small><strong>{detail.blood_group || '—'}</strong></span>{user.role === 'doctor' && <><span><small>Address</small><strong>{detail.address || '—'}</strong></span><span><small>Known allergies</small><strong>{detail.allergies || 'None recorded'}</strong></span></>}</div>}
        <div className="record-columns"><div><p className="eyebrow">APPOINTMENTS</p>{detail.appointments?.length ? detail.appointments.map((a) => <p className="record-line" key={a.id}><strong>{new Date(a.scheduled_at).toLocaleString()}</strong><span>{a.reason} · {a.status.replaceAll('_',' ')}</span></p>) : <p className="muted">No appointment history.</p>}</div>{user.role !== 'registration' && <><div><p className="eyebrow">CONSULTATIONS</p>{detail.consultations?.length ? detail.consultations.map((c) => <p className="record-line" key={c.id}><strong>{new Date(c.created_at).toLocaleString()}</strong><span>{c.chief_complaint}{c.diagnosis ? ` · ${c.diagnosis}` : ''}</span></p>) : <p className="muted">No consultation history.</p>}</div><div><p className="eyebrow">LABORATORY</p>{detail.labOrders?.length ? detail.labOrders.map((l) => <p className="record-line" key={l.id}><strong>{l.test_name} · {l.status.replaceAll('_',' ')}</strong><span>{l.result_text || l.report_name || 'No result entered'}</span></p>) : <p className="muted">No lab history.</p>}</div><div><p className="eyebrow">PRESCRIPTIONS</p>{detail.prescriptions?.length ? detail.prescriptions.map((r) => <p className="record-line" key={r.id}><strong>{r.status}</strong><span>{r.items.map((i) => `${i.medicineName} · ${i.dosage} · ${i.frequency}`).join('; ')}</span></p>) : <p className="muted">No prescription history.</p>}</div></>}</div>
      </>}
    </section>}
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PATIENT RECORDS</p><h2>Directory</h2></div><div className="search-box"><span>⌕</span><input aria-label="Search patients" value={query} onChange={(e) => { setQuery(e.target.value); setKey(String(Date.now())); }} placeholder="Search name, MRN, phone" /></div></div>
      <LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="table-scroll"><table><thead><tr><th>Patient</th><th>MRN</th><th>Contact</th><th>Registered</th><th>Appointments</th><th></th></tr></thead><tbody>{patients.map((p) => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.sex}{p.date_of_birth ? ` · ${new Date(p.date_of_birth).toLocaleDateString()}` : ''}</small></td><td className="mono">{p.mrn}</td><td>{p.phone || '—'}</td><td>{new Date(p.created_at).toLocaleDateString()}</td><td>{p.open_appointments}</td><td><button className="button outline small" onClick={() => setSelectedId(String(p.id))}>Open record</button></td></tr>)}</tbody></table>{!patients.length && <div className="empty">No patient records match this search.</div>}</div>}
    </section>
  </>;
}

function Appointments({ user }) {
  const { data: patients } = useRecords('/patients');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const appointmentParams = new URLSearchParams();
  if (query.trim()) appointmentParams.set('q', query.trim());
  if (statusFilter) appointmentParams.set('status', statusFilter);
  const { data: appointments, error, busy, reload } = useRecords(`/appointments?${appointmentParams}`);
  const action = useAction();
  const canCreate = ['admin','registration'].includes(user.role);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    values.scheduledAt = new Date(values.scheduledAt).toISOString();
    const ok = await action.run(() => api('/appointments', json(values)), 'Appointment added to the queue.');
    if (ok) { form.reset(); reload(); }
  }
  async function setStatus(row, status) {
    const ok = await action.run(() => api(`/appointments/${row.id}`, putJson('PATCH', { status, priority: row.priority })), 'Queue updated.');
    if (ok) reload();
  }
  return <>
    <PageTitle eyebrow="VISIT COORDINATION" title={user.role === 'doctor' ? 'Patient queue' : 'Appointments & queue'}><span className="count-pill">{appointments.filter((a) => ['waiting','in_progress','scheduled'].includes(a.status)).length} open</span></PageTitle>
    {canCreate && <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">SCHEDULE OR CHECK IN</p><h2>New appointment</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid">
        <SelectField name="patientId" label="Patient *" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}</SelectField>
        <TextField name="scheduledAt" label="Date and time *" type="datetime-local" min={localDateTimeValue()} required />
        <TextField name="reason" label="Visit reason *" required minLength="2" maxLength="500" />
        <SelectField name="priority" label="Priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></SelectField>
        <div className="form-actions"><button className="button primary" disabled={action.busy}>Add appointment</button></div>
      </form>
    </section>}
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">VISITS</p><h2>Appointment queue</h2></div><div className="queue-toolbar"><label className="field queue-status"><span>Status</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All visits</option><option value="scheduled">Scheduled</option><option value="waiting">Waiting</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label className="search-box queue-search"><span>⌕</span><input aria-label="Search appointment queue" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find patient or MRN" /></label><button className="button subtle" onClick={reload}>Refresh</button></div></div>{action.alerts}<LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Visit</th><th>Scheduled</th><th>Priority</th><th>Status</th><th>Update</th></tr></thead><tbody>{appointments.map((a) => <tr key={a.id}><td><strong>{a.patient_name}</strong><small className="mono">{a.mrn}</small></td><td>{a.reason}</td><td>{new Date(a.scheduled_at).toLocaleString()}</td><td>{statusChip(a.priority)}</td><td>{statusChip(a.status)}</td><td><select value={a.status} onChange={(e) => setStatus(a, e.target.value)} aria-label={`Update ${a.patient_name} queue status`}><option value="scheduled">Scheduled</option><option value="waiting">Waiting</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>)}</tbody></table>{!appointments.length && <div className="empty">No appointments yet.</div>}</div>}
    </section>
  </>;
}

function Consultations({ user }) {
  const { data: patients } = useRecords('/patients');
  const { data: appointments } = useRecords('/appointments');
  const { data: consultations, error, busy, reload } = useRecords('/consultations');
  const action = useAction();
  const [selectedPatientId, setSelectedPatientId] = useState('');
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const ok = await action.run(() => api('/consultations', json(values)), 'Consultation saved.');
    if (ok) { form.reset(); setSelectedPatientId(''); reload(); }
  }
  return <>
    <PageTitle eyebrow="CLINICAL WORKFLOW" title="Consultations" /><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">CLINICAL NOTE</p><h2>Record a consultation</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid">
        <SelectField name="patientId" label="Patient *" required defaultValue="" onChange={(e) => setSelectedPatientId(e.target.value)}><option value="" disabled>Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}</SelectField>
        <SelectField name="appointmentId" label="Queue visit"><option value="">No linked visit</option>{appointments.filter((a) => String(a.patient_id) === selectedPatientId && ['scheduled','waiting','in_progress'].includes(a.status)).map((a) => <option key={a.id} value={a.id}>{a.patient_name} · {a.reason}</option>)}</SelectField>
        <TextField name="chiefComplaint" label="Chief complaint *" required minLength="2" maxLength="2000" />
        <TextField name="diagnosis" label="Assessment / diagnosis" maxLength="2000" />
        <TextField name="bloodPressure" label="Blood pressure" placeholder="120/80" maxLength="30" data-validate="blood-pressure" />
        <TextField name="temperature" label="Temperature °C" type="number" step="0.1" min="25" max="45" />
        <TextField name="pulse" label="Pulse / min" type="number" min="20" max="250" />
        <TextField name="weight" label="Weight kg" type="number" step="0.1" min="1" max="500" />
        <label className="field full-field"><span>Clinical notes and plan</span><textarea name="notes" rows="4" maxLength="10000" /></label>
        <div className="form-actions"><button className="button primary" disabled={action.busy}>Save consultation</button></div>
      </form>
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECENT RECORDS</p><h2>Consultation history</h2></div></div><LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Doctor</th><th>Complaint</th><th>Assessment</th><th>Date</th></tr></thead><tbody>{consultations.map((c) => <tr key={c.id}><td><strong>{c.patient_name}</strong><small className="mono">{c.mrn}</small></td><td>{c.doctor_name}</td><td>{c.chief_complaint}</td><td>{c.diagnosis || '—'}</td><td>{new Date(c.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!consultations.length && <div className="empty">No consultations recorded.</div>}</div>}
    </section>
  </>;
}

function Laboratory({ user }) {
  const { data: patients } = useRecords('/patients');
  const { data: orders, error, busy, reload } = useRecords('/lab-orders');
  const action = useAction();
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const ok = await action.run(() => api('/lab-orders', json(values)), 'Lab order created.');
    if (ok) { form.reset(); reload(); }
  }
  async function updateStatus(order, status) {
    const ok = await action.run(() => api(`/lab-orders/${order.id}/status`, putJson('PATCH', { status })), 'Lab status updated.');
    if (ok) reload();
  }
  async function submitResult(event, order) {
    event.preventDefault(); const form = event.currentTarget; const body = new FormData(form);
    const ok = await action.run(() => api(`/lab-orders/${order.id}/result`, { method: 'POST', body }), 'Result saved.');
    if (ok) { form.reset(); reload(); }
  }
  const canOrder = ['admin','doctor'].includes(user.role);
  const canProcess = ['admin','laboratory'].includes(user.role);
  return <>
    <PageTitle eyebrow="DIAGNOSTICS" title="Laboratory"><span className="count-pill">{orders.filter((x) => x.status === 'pending' || x.status === 'in_progress').length} pending</span></PageTitle>
    {canOrder && <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">DOCTOR ORDER</p><h2>Request a laboratory test</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid"><SelectField name="patientId" label="Patient *" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}</SelectField><TextField name="testName" label="Test name *" required minLength="2" maxLength="180" /><SelectField name="priority" label="Priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></SelectField><div className="form-actions"><button className="button primary" disabled={action.busy}>Create lab order</button></div></form>
    </section>}
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ORDER TRACKER</p><h2>Pending and completed tests</h2></div><button className="button subtle" onClick={reload}>Refresh</button></div>{action.alerts}<LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="order-list">{orders.map((order) => <article className="order-card" key={order.id}><div className="order-head"><div><strong>{order.test_name}</strong><span>{order.patient_name} · <span className="mono">{order.mrn}</span></span></div><div className="order-tags">{statusChip(order.priority)}{statusChip(order.status)}</div></div>
        {order.result_text && <p className="result-text"><strong>Result:</strong> {order.result_text}</p>}
        {order.report_path && <a className="text-link" href={`/api/lab-orders/${order.id}/report`}>Download {order.report_name || 'report'}</a>}
        {canProcess && order.status !== 'completed' && order.status !== 'cancelled' && <div className="lab-actions"><select value={order.status} aria-label={`Update ${order.test_name} status`} onChange={(e) => updateStatus(order,e.target.value)}><option value="pending">Pending</option><option value="in_progress">In progress</option></select><form onSubmit={(e) => submitResult(e,order)} className="result-form" data-required-any="resultText,report"><input name="resultText" aria-label="Laboratory result" placeholder="Enter result" maxLength="10000" /><input name="report" aria-label="Attach PDF, JPG or PNG report" type="file" accept="application/pdf,image/png,image/jpeg" /><button className="button primary small" disabled={action.busy}>Complete</button></form></div>}
        <small className="muted">Requested {new Date(order.created_at).toLocaleString()}{order.requester_name ? ` by ${order.requester_name}` : ''}</small>
      </article>)}{!orders.length && <div className="empty">No lab orders yet.</div>}</div>}
    </section>
  </>;
}

function Prescriptions({ user }) {
  const { data: patients } = useRecords('/patients');
  const { data: prescriptions, error, busy, reload } = useRecords('/prescriptions');
  const { data: medicines } = useRecords('/medicines');
  const action = useAction();
  const [items, setItems] = useState([{ medicineName: '', dosage: '', frequency: '', duration: '', quantity: '1' }]);
  const canCreate = ['admin','doctor'].includes(user.role);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    values.items = items.map((item) => ({ ...item, quantity: Number(item.quantity) }));
    const ok = await action.run(() => api('/prescriptions', json(values)), 'Prescription created.');
    if (ok) { form.reset(); setItems([{ medicineName: '', dosage: '', frequency: '', duration: '', quantity: '1' }]); reload(); }
  }
  async function dispense(event, prescription, item) {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    const ok = await action.run(() => api(`/prescriptions/${prescription.id}/dispense`, json({ itemId: item.id, batchId: values.batchId, quantity: Number(values.quantity) })), 'Dispensing recorded and stock updated.');
    if (ok) reload();
  }
  return <>
    <PageTitle eyebrow="MEDICATION WORKFLOW" title="Prescriptions"><span className="count-pill">{prescriptions.filter((p) => ['active','partially_dispensed'].includes(p.status)).length} open</span></PageTitle>
    {canCreate && <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">DOCTOR ORDER</p><h2>Write a prescription</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid"><SelectField name="patientId" label="Patient *" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}</SelectField><TextField name="notes" label="Instructions" maxLength="3000" />
        <div className="rx-items full-field"><datalist id="medicine-names">{medicines.map((m) => <option key={m.id} value={m.name} />)}</datalist>{items.map((item,index) => <div className="rx-draft" key={index}><div className="rx-draft-head"><strong>Medicine {index + 1}</strong>{items.length > 1 && <button type="button" className="button subtle small" onClick={() => setItems((old) => old.filter((_,i) => i !== index))}>Remove</button>}</div><div className="rx-draft-fields"><TextField label="Medicine *" required maxLength="160" list="medicine-names" value={item.medicineName} onChange={(e) => setItems((old) => old.map((x,i) => i===index ? {...x,medicineName:e.target.value} : x))} /><TextField label="Dose *" required placeholder="e.g. 500 mg" maxLength="120" value={item.dosage} onChange={(e) => setItems((old) => old.map((x,i) => i===index ? {...x,dosage:e.target.value} : x))} /><TextField label="Frequency *" required placeholder="e.g. twice daily" maxLength="120" value={item.frequency} onChange={(e) => setItems((old) => old.map((x,i) => i===index ? {...x,frequency:e.target.value} : x))} /><TextField label="Duration *" required placeholder="e.g. 5 days" maxLength="120" value={item.duration} onChange={(e) => setItems((old) => old.map((x,i) => i===index ? {...x,duration:e.target.value} : x))} /><TextField label="Quantity *" required type="number" min="1" max="10000" value={item.quantity} onChange={(e) => setItems((old) => old.map((x,i) => i===index ? {...x,quantity:e.target.value} : x))} /></div></div>)}<button type="button" className="button outline small" onClick={() => setItems((old) => [...old,{ medicineName:'',dosage:'',frequency:'',duration:'',quantity:'1' }])}>+ Add another medicine</button></div>
        <div className="form-actions"><button className="button primary" disabled={action.busy}>Save prescription</button></div></form>
    </section>}
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">PRESCRIPTION QUEUE</p><h2>Current and recent prescriptions</h2></div><button className="button subtle" onClick={reload}>Refresh</button></div>{action.alerts}<LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="order-list">{prescriptions.map((p) => <article className="order-card" key={p.id}><div className="order-head"><div><strong>{p.patient_name} <span className="mono">{p.mrn}</span></strong><span>Prescribed by {p.doctor_name} · {new Date(p.created_at).toLocaleString()}</span></div>{statusChip(p.status)}</div>
        {p.items.map((item) => <div className="prescription-item" key={item.id}><div><strong>{item.medicine_name}</strong><span>{item.dosage} · {item.frequency} · {item.duration} · {item.dispensed_quantity}/{item.quantity} dispensed</span></div>
          {user.role === 'pharmacy' && item.dispensed_quantity < item.quantity && <form className="dispense-form" onSubmit={(e) => dispense(e,p,item)}><select name="batchId" required defaultValue=""><option value="" disabled>Choose batch</option>{medicines.filter((m) => m.name.toLowerCase() === item.medicine_name.toLowerCase()).flatMap((m) => m.batches.filter((b) => b.quantity > 0 && String(b.expiry_date).slice(0,10) >= new Date().toISOString().slice(0,10)).map((b) => <option key={b.id} value={b.id}>{b.batch_no} · {b.quantity} left · exp {new Date(b.expiry_date).toLocaleDateString()}</option>))}</select><input name="quantity" type="number" min="1" max={item.quantity - item.dispensed_quantity} defaultValue={item.quantity - item.dispensed_quantity} required /><button className="button primary small" disabled={action.busy}>Dispense</button></form>}
        </div>)}{p.notes && <p className="muted">{p.notes}</p>}</article>)}{!prescriptions.length && <div className="empty">No prescriptions recorded.</div>}</div>}
    </section>
  </>;
}

function Pharmacy({ user }) {
  const { data: medicines, error, busy, reload } = useRecords('/medicines');
  const action = useAction();
  const canEdit = ['admin','pharmacy'].includes(user.role);
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    values.quantity = Number(values.quantity); values.lowStockThreshold = Number(values.lowStockThreshold);
    const ok = await action.run(() => api('/medicines', json(values)), 'Medicine added to inventory.');
    if (ok) { form.reset(); reload(); }
  }
  async function addBatch(event, medicine) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); values.quantity = Number(values.quantity);
    const ok = await action.run(() => api(`/medicines/${medicine.id}/batches`, json(values)), 'Stock batch added.');
    if (ok) { form.reset(); reload(); }
  }
  return <>
    <PageTitle eyebrow="INVENTORY CONTROL" title="Pharmacy & stock"><span className="count-pill">{medicines.filter((m) => m.available <= m.low_stock_threshold).length} stock alerts</span></PageTitle>
    {canEdit && <section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">INVENTORY</p><h2>Add a medicine</h2></div></div>{action.alerts}
      <form onSubmit={create} className="form-grid"><TextField name="name" label="Medicine name *" required minLength="2" maxLength="160" /><TextField name="category" label="Category" maxLength="100" /><TextField name="unit" label="Unit" defaultValue="units" maxLength="30" /><TextField name="lowStockThreshold" label="Reorder threshold" type="number" min="0" max="1000000" step="1" required defaultValue="10" /><TextField name="batchNo" label="Initial batch number" maxLength="80" data-required-when="quantity:positive" /><TextField name="expiryDate" label="Initial batch expiry" type="date" min={localDateValue()} data-required-when="quantity:positive" /><TextField name="quantity" label="Initial quantity" type="number" min="0" max="1000000" step="1" required defaultValue="0" /><div className="form-actions"><button className="button primary" disabled={action.busy}>Add medicine</button></div></form>
    </section>}
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">STOCK POSITION</p><h2>Medicine inventory</h2></div><button className="button subtle" onClick={reload}>Refresh</button></div><LoadingOrError busy={busy} error={error} />
      {!busy && !error && <div className="table-scroll"><table><thead><tr><th>Medicine</th><th>Category</th><th>Available</th><th>Expired</th><th>Threshold</th><th>Stock status</th></tr></thead><tbody>{medicines.map((m) => <tr key={m.id}><td><strong>{m.name}</strong><small>{m.batches.length} batches · {m.unit}</small></td><td>{m.category}</td><td>{m.available}</td><td>{m.expired}</td><td>{m.low_stock_threshold}</td><td>{m.available <= m.low_stock_threshold ? <span className="chip urgent">Reorder</span> : <span className="chip good">In stock</span>}</td></tr>)}</tbody></table>{!medicines.length && <div className="empty">Inventory is empty.</div>}</div>}
    </section>
    {canEdit && medicines.length > 0 && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">RECEIVING</p><h2>Add stock to an existing medicine</h2></div></div><div className="batch-list">{medicines.map((m) => <form className="batch-form" key={m.id} onSubmit={(e) => addBatch(e,m)}><strong>{m.name}</strong><input name="batchNo" aria-label={`Batch number for ${m.name}`} placeholder="Batch number" required minLength="1" maxLength="80" /><input name="expiryDate" aria-label={`Expiry date for ${m.name}`} type="date" min={localDateValue()} required /><input name="quantity" aria-label={`Quantity for ${m.name}`} type="number" min="1" max="1000000" step="1" placeholder="Quantity" required /><button className="button outline small" disabled={action.busy}>Add batch</button></form>)}</div></section>}
  </>;
}

function Reports() {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { Promise.all([api('/reports/summary'),api('/audit-events')]).then(([s,e]) => { setSummary(s); setEvents(e); }).catch((e) => setError(e.message)); }, []);
  return <><PageTitle eyebrow="OPERATIONS" title="Reports & audit"><a className="button outline" href="/api/reports/export.csv">Download patient register CSV</a></PageTitle>
    {error && <div className="notice error">{error}</div>}
    <section className="stats-grid"><Stat label="Total patients" value={summary?.patients} detail="All registered records" /><Stat label="Appointments this month" value={summary?.appointments_this_month} detail="Scheduled visits" tone="blue" /><Stat label="Consultations this month" value={summary?.consultations_this_month} detail="Completed encounters" tone="blue" /><Stat label="Open laboratory orders" value={summary?.lab_pending} detail="Pending or in progress" tone="amber" /><Stat label="Open prescriptions" value={summary?.prescriptions_open} detail="Awaiting dispensing" /><Stat label="Low stock medicines" value={summary?.low_stock} detail="At or below threshold" tone="rose" /></section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">TRACEABILITY</p><h2>Recent staff activity</h2></div><span className="count-pill">Latest 200 events</span></div><div className="table-scroll"><table><thead><tr><th>Time</th><th>Staff member</th><th>Action</th><th>Record type</th><th>Record ID</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.actor_name || 'System'}</td><td>{event.action}</td><td>{event.entity}</td><td className="mono">{event.entity_id || '—'}</td></tr>)}</tbody></table>{!events.length && !error && <div className="empty">No audited actions yet.</div>}</div></section>
  </>;
}

function Users({ currentUser }) {
  const { data: users, error, busy, reload } = useRecords('/users');
  const action = useAction();
  async function create(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const ok = await action.run(() => api('/users', json(values)), 'Staff account created. The user must change the temporary password.');
    if (ok) { form.reset(); reload(); }
  }
  async function toggle(user) {
    const ok = await action.run(() => api(`/users/${user.id}/active`, putJson('PATCH', { active: !user.active })), `Account ${user.active ? 'disabled' : 'enabled'}.`);
    if (ok) reload();
  }
  async function resetPassword(user) {
    if (!window.confirm(`Create a new temporary password for ${user.name}?`)) return;
    let temporaryPassword = '';
    const ok = await action.run(async () => { const response = await api(`/users/${user.id}/reset-password`, { method: 'POST' }); temporaryPassword = response.temporaryPassword; }, 'Temporary password created. Share it with the staff member securely.');
    if (ok) window.alert(`Temporary password for ${user.name}: ${temporaryPassword}`);
    reload();
  }
  return <><PageTitle eyebrow="ACCESS CONTROL" title="Staff accounts" /><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">STAFF ACCESS</p><h2>Create an account</h2></div></div>{action.alerts}<form onSubmit={create} className="form-grid"><TextField name="name" label="Full name *" required minLength="2" maxLength="160" autoComplete="name" /><TextField name="email" label="Work email *" type="email" required maxLength="254" autoComplete="email" /><TextField name="password" label="Temporary password *" type="password" minLength="12" maxLength="128" required autoComplete="new-password" /><SelectField name="role" label="Role *" required><option value="registration">Registration</option><option value="doctor">Doctor</option><option value="laboratory">Laboratory</option><option value="pharmacy">Pharmacy</option><option value="admin">Administrator</option></SelectField><div className="form-actions"><button className="button primary" disabled={action.busy}>Create account</button></div></form></section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ACCESS REVIEW</p><h2>Health center staff</h2></div></div><LoadingOrError busy={busy} error={error} />{!busy && !error && <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Account</th></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td><strong>{u.name}</strong>{u.must_change_password && <small>Temporary password pending change</small>}</td><td>{u.email}</td><td>{roleNames[u.role]}</td><td>{u.active ? <span className="chip good">Active</span> : <span className="chip">Disabled</span>}</td><td>{new Date(u.created_at).toLocaleDateString()}</td><td><div className="row-actions">{u.id !== currentUser.id && <><button className="button outline small" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button><button className="button subtle small" onClick={() => resetPassword(u)}>Reset password</button></>}</div></td></tr>)}</tbody></table></div>}</section>
  </>;
}

function Account({ user, onUser }) {
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const profileAction = useAction();
  const action = useAction();
  async function updateProfile(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const ok = await profileAction.run(async () => {
      const result = await api('/auth/profile', putJson('PATCH', values));
      setProfile({ name: result.user.name, email: result.user.email });
      onUser(result.user);
    }, 'Profile updated.');
  }
  async function change(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    if (values.newPassword !== values.confirmPassword) { await action.run(async () => { throw new Error('The new passwords do not match.'); }); return; }
    const ok = await action.run(async () => { const result = await api('/auth/change-password', json(values)); onUser(result.user); }, 'Password updated.');
    if (ok) form.reset();
  }
  return <><PageTitle eyebrow="ACCOUNT SETTINGS" title="My account" /><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">PERSONAL PROFILE</p><h2>Contact details</h2></div><span className="chip good">{roleNames[user.role]}</span></div><p className="muted">Keep the name and work email used for staff communication up to date. Your role is managed by an administrator.</p>{profileAction.alerts}<form className="form-grid profile-form" onSubmit={updateProfile}><TextField name="name" label="Full name *" required minLength="2" maxLength="160" autoComplete="name" value={profile.name} onChange={(e) => setProfile((current) => ({ ...current, name: e.target.value }))} /><TextField name="email" label="Work email *" type="email" required maxLength="254" autoComplete="email" value={profile.email} onChange={(e) => setProfile((current) => ({ ...current, email: e.target.value }))} /><div className="form-actions"><button className="button primary" disabled={profileAction.busy}>{profileAction.busy ? 'Saving profile…' : 'Save profile'}</button></div></form></section><section className="panel form-panel"><div className="panel-heading"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Change your password</h2></div></div>{action.alerts}<form className="form-grid" onSubmit={change}><TextField name="currentPassword" label="Current password *" type="password" required autoComplete="current-password" /><TextField name="newPassword" label="New password *" type="password" required minLength="12" autoComplete="new-password" /><TextField name="confirmPassword" label="Confirm new password *" type="password" required minLength="12" autoComplete="new-password" data-match="newPassword" /><div className="form-actions"><button className="button primary" disabled={action.busy}>{action.busy ? 'Updating password…' : 'Update password'}</button></div></form></section></>;
}

function View({ view, user, onUser }) {
  if (view === 'patients') return <Patients user={user} />;
  if (view === 'appointments') return <Appointments user={user} />;
  if (view === 'consultations') return <Consultations user={user} />;
  if (view === 'laboratory') return <Laboratory user={user} />;
  if (view === 'prescriptions') return <Prescriptions user={user} />;
  if (view === 'pharmacy') return <Pharmacy user={user} />;
  if (view === 'reports') return <Reports />;
  if (view === 'users') return <Users currentUser={user} />;
  if (view === 'account') return <Account user={user} onUser={onUser} />;
  return <Dashboard user={user} />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  useEffect(() => { api('/auth/me').then((result) => setUser(result.user)).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (user?.must_change_password) setView('account'); }, [user?.must_change_password]);
  async function login(result) { setUser(result.user); setShowSignIn(false); setView(result.user.must_change_password ? 'account' : 'dashboard'); }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); setView('dashboard'); setShowSignIn(false); } }
  if (loading) return <FormValidationBoundary><div className="splash">Svasthya</div></FormValidationBoundary>;
  if (!user) return <FormValidationBoundary>{showSignIn ? <Login onLogin={login} onBack={() => setShowSignIn(false)} /> : <Landing onSignIn={() => setShowSignIn(true)} />}</FormValidationBoundary>;
  const allowed = nav.some((item) => item.id === view && item.roles.includes(user.role));
  const safeView = view === 'account' || allowed ? view : 'dashboard';
  return <FormValidationBoundary><Shell user={user} view={safeView} setView={setView} onLogout={logout}><View key={safeView} view={safeView} user={user} onUser={setUser} /></Shell></FormValidationBoundary>;
}
