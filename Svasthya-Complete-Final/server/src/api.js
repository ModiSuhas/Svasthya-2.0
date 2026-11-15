import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { requireAuth, requireRole } from './auth.js';

export const authRouter = Router();
export const apiRouter = Router();

const roles = ['admin', 'registration', 'doctor', 'laboratory', 'pharmacy'];
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Wait a while and try again.' } });
const text = (value, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const idParam = (value) => /^\d+$/.test(String(value)) ? Number(value) : 0;
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const validPhone = (value) => !value || (/^\+?[0-9().\s-]{7,24}$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15);
const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Other'];
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (message) => Object.assign(new Error(message), { status: 400 });
const notFound = (message = 'Record not found.') => Object.assign(new Error(message), { status: 404 });
const audit = (client, actor, action, entity, entityId, details = {}) => client.query(
  'INSERT INTO audit_events(actor_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',
  [actor?.id || null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details)],
);

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'storage/uploads');
mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDir),
  filename: (_req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    const allowed = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowed[file.mimetype] !== extension && !(file.mimetype === 'image/jpeg' && extension === '.jpeg')) return done(bad('Only PDF, JPG, and PNG reports are accepted.'));
    done(null, true);
  },
});

authRouter.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = text(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) throw bad('Enter your email and password.');
  const found = await pool.query(
    'SELECT id,name,email,password_hash,role,active,must_change_password FROM users WHERE email=$1',
    [email],
  );
  if (!found.rowCount || !found.rows[0].active || !(await bcrypt.compare(password, found.rows[0].password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const user = found.rows[0];
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.user = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    must_change_password: user.must_change_password,
  };
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
  await audit(pool, req.session.user, 'login', 'user', user.id);
  res.json({ user: req.session.user });
}));

authRouter.post('/logout', asyncRoute(async (req, res) => {
  const user = req.session.user;
  if (user) await audit(pool, user, 'logout', 'user', user.id);
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('svasthya.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
}));

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.session.user }));
authRouter.patch('/profile', requireAuth, asyncRoute(async (req, res) => {
  const name = text(req.body?.name, 160);
  const email = text(req.body?.email, 254).toLowerCase();
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw bad('Enter a name with at least 2 characters and a valid work email.');
  }
  const duplicate = await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [email, req.session.user.id]);
  if (duplicate.rowCount) throw Object.assign(bad('That work email is already used by another staff account.'), { status: 409 });
  const result = await pool.query(
    'UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING id,name,email,role,must_change_password',
    [name, email, req.session.user.id],
  );
  if (!result.rowCount) throw Object.assign(bad('Your account could not be updated. Sign in again and retry.'), { status: 401 });
  req.session.user = result.rows[0];
  await audit(pool, req.session.user, 'profile_update', 'user', req.session.user.id, { fields: ['name', 'email'] });
  res.json({ user: req.session.user });
}));
authRouter.post('/change-password', requireAuth, asyncRoute(async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword.length < 12) throw bad('New passwords must be at least 12 characters.');
  const found = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.session.user.id]);
  if (!found.rowCount || !(await bcrypt.compare(currentPassword, found.rows[0].password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  await pool.query('UPDATE users SET password_hash=$1,must_change_password=FALSE WHERE id=$2', [await bcrypt.hash(newPassword, 12), req.session.user.id]);
  req.session.user.must_change_password = false;
  await audit(pool, req.session.user, 'change_password', 'user', req.session.user.id);
  res.json({ ok: true, user: req.session.user });
}));

apiRouter.use(requireAuth);
apiRouter.use((req, res, next) => {
  if (req.session.user.must_change_password) return res.status(403).json({ error: 'Change your temporary password before using the workspace.' });
  next();
});

apiRouter.get('/dashboard', asyncRoute(async (req, res) => {
  const [patients, appointments, pendingLabs, lowStock, openPrescriptions] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM patients'),
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='completed')::int AS completed, COUNT(*) FILTER (WHERE status IN ('waiting','in_progress'))::int AS waiting FROM appointments WHERE scheduled_at::date=CURRENT_DATE"),
    pool.query("SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE priority='urgent')::int AS urgent FROM lab_orders WHERE status IN ('pending','in_progress')"),
    pool.query('SELECT COUNT(*)::int AS count FROM (SELECT m.id FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id=m.id AND b.expiry_date>=CURRENT_DATE GROUP BY m.id,m.low_stock_threshold HAVING COALESCE(SUM(b.quantity),0)<=m.low_stock_threshold) x'),
    pool.query("SELECT COUNT(*)::int AS count FROM prescriptions WHERE status IN ('active','partially_dispensed')"),
  ]);
  res.json({ patients: patients.rows[0].count, appointments: appointments.rows[0], pendingLabs: pendingLabs.rows[0], lowStock: lowStock.rows[0].count, openPrescriptions: openPrescriptions.rows[0].count });
}));

apiRouter.get('/patients', requireRole(...roles), asyncRoute(async (req, res) => {
  const q = `%${text(req.query.q, 100)}%`;
  const role = req.session.user.role;
  const fields = ['admin','doctor'].includes(role)
    ? 'p.*,(SELECT COUNT(*)::int FROM appointments a WHERE a.patient_id=p.id AND a.status IN (\'scheduled\',\'waiting\',\'in_progress\')) AS open_appointments'
    : role === 'registration'
      ? 'p.id,p.mrn,p.name,p.date_of_birth,p.sex,p.phone,p.address,p.blood_group,p.created_at,(SELECT COUNT(*)::int FROM appointments a WHERE a.patient_id=p.id AND a.status IN (\'scheduled\',\'waiting\',\'in_progress\')) AS open_appointments'
      : 'p.id,p.mrn,p.name,p.created_at,0::int AS open_appointments';
  const search = ['admin','doctor','registration'].includes(role) ? "($1='%%' OR p.mrn ILIKE $1 OR p.name ILIKE $1 OR COALESCE(p.phone,'') ILIKE $1)" : "($1='%%' OR p.mrn ILIKE $1 OR p.name ILIKE $1)";
  const scope = role === 'laboratory'
    ? 'AND EXISTS (SELECT 1 FROM lab_orders l WHERE l.patient_id=p.id)'
    : role === 'pharmacy'
      ? 'AND EXISTS (SELECT 1 FROM prescriptions r WHERE r.patient_id=p.id)'
      : '';
  const result = await pool.query(
    `SELECT ${fields}
     FROM patients p WHERE ${search} ${scope}
     ORDER BY p.created_at DESC LIMIT 250`, [q],
  );
  await audit(pool, req.session.user, 'view_list', 'patient_directory', null, { count: result.rowCount });
  res.json(result.rows);
}));

apiRouter.post('/patients', requireRole('admin','registration'), asyncRoute(async (req, res) => {
  const name = text(req.body?.name, 160);
  const phone = text(req.body?.phone, 30);
  const dateOfBirth = text(req.body?.dateOfBirth, 10);
  const sex = text(req.body?.sex, 40) || 'Not specified';
  const bloodGroup = text(req.body?.bloodGroup, 20);
  if (name.length < 2 || !validPhone(phone) || (dateOfBirth && (!validDate(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) || !['Not specified','Female','Male','Other'].includes(sex) || !bloodGroups.includes(bloodGroup)) {
    throw bad('Check the patient name, phone number, date of birth, sex, and blood group.');
  }
  const result = await pool.query(
    `INSERT INTO patients(mrn,name,date_of_birth,sex,phone,address,blood_group,allergies,notes,created_by)
     VALUES('CHC-'||to_char(CURRENT_DATE,'YY')||'-'||lpad(nextval('patient_mrn_seq')::text,5,'0'),$1,NULLIF($2,'')::date,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name, dateOfBirth, sex, phone, text(req.body?.address, 500), bloodGroup, text(req.body?.allergies, 2000), text(req.body?.notes, 2000), req.session.user.id],
  );
  await audit(pool, req.session.user, 'create', 'patient', result.rows[0].id, { mrn: result.rows[0].mrn });
  res.status(201).json(result.rows[0]);
}));

apiRouter.patch('/patients/:id', requireRole('admin','registration'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw notFound();
  const current = await pool.query('SELECT * FROM patients WHERE id=$1', [id]);
  if (!current.rowCount) throw notFound('Patient not found.');
  const old = current.rows[0];
  const value = (key, fallback = '') => Object.prototype.hasOwnProperty.call(req.body || {}, key) ? text(req.body[key], key === 'notes' || key === 'allergies' ? 2000 : 500) : fallback;
  const admin = req.session.user.role === 'admin';
  const name = value('name', old.name);
  const phone = value('phone', old.phone || '');
  const dateOfBirth = value('dateOfBirth', old.date_of_birth ? String(old.date_of_birth).slice(0,10) : '');
  const sex = value('sex', old.sex);
  const bloodGroup = value('bloodGroup', old.blood_group || '');
  if (name.length < 2 || !validPhone(phone) || (dateOfBirth && (!validDate(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) || !['Not specified','Female','Male','Other'].includes(sex) || !bloodGroups.includes(bloodGroup)) {
    throw bad('Check the patient name, phone number, date of birth, sex, and blood group.');
  }
  const updated = await pool.query(
    `UPDATE patients SET name=$1,date_of_birth=NULLIF($2,'')::date,sex=$3,phone=$4,address=$5,blood_group=$6,allergies=$7,notes=$8,updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [name, dateOfBirth, sex, phone, value('address', old.address || ''), bloodGroup, admin ? value('allergies', old.allergies) : old.allergies, admin ? value('notes', old.notes) : old.notes, id],
  );
  await audit(pool, req.session.user, 'update', 'patient', id, { fields: ['name','dateOfBirth','sex','phone','address','bloodGroup',...(admin ? ['allergies','notes'] : [])] });
  res.json(updated.rows[0]);
}));

apiRouter.get('/patients/:id', requireRole('admin','registration','doctor'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw notFound();
  const fields = req.session.user.role === 'registration'
    ? 'id,mrn,name,date_of_birth,sex,phone,address,blood_group,created_at,updated_at'
    : '*';
  const canReadClinical = req.session.user.role !== 'registration';
  const [patient, appointments, consultations, labOrders, prescriptions] = await Promise.all([
    pool.query(`SELECT ${fields} FROM patients WHERE id=$1`, [id]),
    pool.query('SELECT a.*,u.name AS doctor_name FROM appointments a LEFT JOIN users u ON u.id=a.doctor_id WHERE a.patient_id=$1 ORDER BY a.scheduled_at DESC LIMIT 30', [id]),
    !canReadClinical
      ? Promise.resolve({ rows: [] })
      : pool.query('SELECT c.*,u.name AS doctor_name FROM consultations c JOIN users u ON u.id=c.doctor_id WHERE c.patient_id=$1 ORDER BY c.created_at DESC LIMIT 30', [id]),
    !canReadClinical
      ? Promise.resolve({ rows: [] })
      : pool.query('SELECT id,test_name,priority,status,result_text,report_name,result_at,created_at FROM lab_orders WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 30', [id]),
    !canReadClinical
      ? Promise.resolve({ rows: [] })
      : pool.query(`SELECT r.id,r.status,r.notes,r.created_at,
          COALESCE(json_agg(json_build_object('medicineName',i.medicine_name,'dosage',i.dosage,'frequency',i.frequency,'duration',i.duration,'quantity',i.quantity)) FILTER(WHERE i.id IS NOT NULL),'[]') AS items
        FROM prescriptions r LEFT JOIN prescription_items i ON i.prescription_id=r.id WHERE r.patient_id=$1 GROUP BY r.id ORDER BY r.created_at DESC LIMIT 30`, [id]),
  ]);
  if (!patient.rowCount) throw notFound('Patient not found.');
  await audit(pool, req.session.user, 'view', 'patient', id);
  res.json({ ...patient.rows[0], appointments: appointments.rows, consultations: consultations.rows, labOrders: labOrders.rows, prescriptions: prescriptions.rows });
}));

apiRouter.get('/appointments', requireRole('admin','registration','doctor'), asyncRoute(async (req, res) => {
  const status = text(req.query.status, 30);
  const q = `%${text(req.query.q, 100)}%`;
  const result = await pool.query(
    `SELECT a.*,p.mrn,p.name AS patient_name,p.phone,u.name AS doctor_name
     FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN users u ON u.id=a.doctor_id
     WHERE ($1='' OR a.status=$1) AND ($2='%%' OR p.name ILIKE $2 OR p.mrn ILIKE $2)
       AND ($3<>'doctor' OR a.doctor_id IS NULL OR a.doctor_id=$4)
     ORDER BY CASE WHEN a.priority='urgent' THEN 0 ELSE 1 END,a.scheduled_at DESC LIMIT 300`, [status, q, req.session.user.role, req.session.user.id],
  );
  await audit(pool, req.session.user, 'view_list', 'appointment_queue', null, { count: result.rowCount });
  res.json(result.rows);
}));

apiRouter.post('/appointments', requireRole('admin','registration'), asyncRoute(async (req, res) => {
  const patientId = idParam(req.body?.patientId);
  const reason = text(req.body?.reason, 500);
  const scheduledAt = text(req.body?.scheduledAt, 40);
  if (!patientId || reason.length < 2 || !scheduledAt || Number.isNaN(Date.parse(scheduledAt)) || Date.parse(scheduledAt) < Date.now() - 60_000) throw bad('Choose a patient, a future appointment time, and a visit reason.');
  const result = await pool.query(
    `INSERT INTO appointments(patient_id,scheduled_at,reason,priority,status,doctor_id,created_by)
     VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::bigint,$7) RETURNING *`,
    [patientId, scheduledAt, reason, req.body?.priority === 'urgent' ? 'urgent' : 'normal', 'scheduled', text(req.body?.doctorId, 20), req.session.user.id],
  );
  await audit(pool, req.session.user, 'create', 'appointment', result.rows[0].id);
  res.status(201).json(result.rows[0]);
}));

apiRouter.patch('/appointments/:id', requireRole('admin','registration','doctor'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  const status = text(req.body?.status, 30);
  const priority = text(req.body?.priority, 30);
  if (!id || !['scheduled','waiting','in_progress','completed','cancelled'].includes(status) || !['normal','urgent'].includes(priority || 'normal')) throw bad('Invalid appointment update.');
  const result = await pool.query('UPDATE appointments SET status=$1,priority=$2,updated_at=NOW() WHERE id=$3 RETURNING *', [status, priority || 'normal', id]);
  if (!result.rowCount) throw notFound('Appointment not found.');
  await audit(pool, req.session.user, 'update', 'appointment', id, { status, priority: priority || 'normal' });
  res.json(result.rows[0]);
}));

apiRouter.get('/consultations', requireRole('admin','doctor'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT c.*,p.name AS patient_name,p.mrn,u.name AS doctor_name FROM consultations c
     JOIN patients p ON p.id=c.patient_id JOIN users u ON u.id=c.doctor_id ORDER BY c.created_at DESC LIMIT 250`,
  );
  await audit(pool, req.session.user, 'view_list', 'consultations', null, { count: result.rowCount });
  res.json(result.rows);
}));

apiRouter.post('/consultations', requireRole('admin','doctor'), asyncRoute(async (req, res) => {
  const patientId = idParam(req.body?.patientId);
  const chief = text(req.body?.chiefComplaint, 2000);
  if (!patientId || !chief) throw bad('Choose a patient and enter the chief complaint.');
  const bloodPressure = text(req.body?.bloodPressure, 30);
  const temperature = text(req.body?.temperature, 20);
  const pulse = text(req.body?.pulse, 10);
  const weight = text(req.body?.weight, 20);
  const appointmentId = text(req.body?.appointmentId, 20);
  const within = (value, min, max) => !value || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max);
  if ((bloodPressure && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(bloodPressure)) || !within(temperature, 25, 45) || !within(pulse, 20, 250) || !within(weight, 1, 500)) {
    throw bad('Check blood pressure, temperature, pulse, and weight values.');
  }
  if (appointmentId) {
    const parsedAppointmentId = idParam(appointmentId);
    if (!parsedAppointmentId) throw bad('Choose a valid queue visit.');
    const linkedVisit = await pool.query("SELECT id FROM appointments WHERE id=$1 AND patient_id=$2 AND status IN ('scheduled','waiting','in_progress')", [parsedAppointmentId, patientId]);
    if (!linkedVisit.rowCount) throw bad('The queue visit must be open and belong to the selected patient.');
  }
  const consultation = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO consultations(patient_id,appointment_id,doctor_id,chief_complaint,diagnosis,notes,blood_pressure,temperature,pulse,weight,status)
       VALUES($1,NULLIF($2,'')::bigint,$3,$4,$5,$6,$7,NULLIF($8,'')::numeric,NULLIF($9,'')::int,NULLIF($10,'')::numeric,'completed') RETURNING *`,
      [patientId, appointmentId, req.session.user.id, chief, text(req.body?.diagnosis, 2000), text(req.body?.notes, 10000), bloodPressure, temperature, pulse, weight],
    );
    if (result.rows[0].appointment_id) await client.query("UPDATE appointments SET status='completed',updated_at=NOW() WHERE id=$1", [result.rows[0].appointment_id]);
    await audit(client, req.session.user, 'create', 'consultation', result.rows[0].id);
    return result.rows[0];
  });
  res.status(201).json(consultation);
}));

apiRouter.get('/lab-orders', requireRole('admin','doctor','laboratory'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT l.*,p.name AS patient_name,p.mrn,u.name AS requester_name,c.name AS completer_name
     FROM lab_orders l JOIN patients p ON p.id=l.patient_id JOIN users u ON u.id=l.requested_by
     LEFT JOIN users c ON c.id=l.completed_by ORDER BY CASE WHEN l.priority='urgent' THEN 0 ELSE 1 END,l.created_at DESC LIMIT 300`,
  );
  await audit(pool, req.session.user, 'view_list', 'lab_orders', null, { count: result.rowCount });
  res.json(result.rows);
}));

apiRouter.post('/lab-orders', requireRole('admin','doctor'), asyncRoute(async (req, res) => {
  const patientId = idParam(req.body?.patientId);
  const testName = text(req.body?.testName, 180);
  if (!patientId || !testName) throw bad('Choose a patient and enter a test name.');
  const result = await pool.query(
    `INSERT INTO lab_orders(patient_id,consultation_id,test_name,priority,requested_by)
     VALUES($1,NULLIF($2,'')::bigint,$3,$4,$5) RETURNING *`,
    [patientId, text(req.body?.consultationId, 20), testName, req.body?.priority === 'urgent' ? 'urgent' : 'normal', req.session.user.id],
  );
  await audit(pool, req.session.user, 'create', 'lab_order', result.rows[0].id);
  res.status(201).json(result.rows[0]);
}));

apiRouter.patch('/lab-orders/:id/status', requireRole('admin','laboratory'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  const status = text(req.body?.status, 20);
  if (!id || !['pending','in_progress','cancelled'].includes(status)) throw bad('Invalid laboratory status.');
  const result = await pool.query("UPDATE lab_orders SET status=$1 WHERE id=$2 AND status<>'completed' RETURNING *", [status, id]);
  if (!result.rowCount) throw notFound('Open lab order not found.');
  await audit(pool, req.session.user, 'update', 'lab_order', id, { status });
  res.json(result.rows[0]);
}));

apiRouter.post('/lab-orders/:id/result', requireRole('admin','laboratory'), upload.single('report'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw notFound();
  const resultText = text(req.body?.resultText, 10000);
  if (!resultText && !req.file) throw bad('Enter a result or attach a report.');
  const existing = await pool.query('SELECT status FROM lab_orders WHERE id=$1', [id]);
  if (!existing.rowCount) { if (req.file) await unlink(req.file.path).catch(() => {}); throw notFound('Lab order not found.'); }
  if (existing.rows[0].status === 'completed' || existing.rows[0].status === 'cancelled') {
    if (req.file) await unlink(req.file.path).catch(() => {});
    throw Object.assign(bad('This lab order is already closed.'), { status: 409 });
  }
  if (req.file) {
    const handle = await open(req.file.path, 'r');
    const signature = Buffer.alloc(8);
    try { await handle.read(signature, 0, 8, 0); } finally { await handle.close(); }
    const isPdf = signature.subarray(0,5).toString() === '%PDF-';
    const isPng = signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
    if (!(isPdf || isPng || isJpeg)) { await unlink(req.file.path).catch(() => {}); throw bad('Report content must be a valid PDF, JPG, or PNG file.'); }
  }
  const result = await pool.query(
    `UPDATE lab_orders SET result_text=$1,report_path=COALESCE($2,report_path),report_name=COALESCE($3,report_name),status='completed',completed_by=$4,result_at=NOW()
     WHERE id=$5 AND status IN ('pending','in_progress') RETURNING *`,
    [resultText, req.file?.filename || null, req.file ? req.file.originalname.replace(/[\\/]/g, '_').replace(/[^A-Za-z0-9_. -]/g, '_').slice(0, 180) : null, req.session.user.id, id],
  );
  if (!result.rowCount) { if (req.file) await unlink(req.file.path).catch(() => {}); throw Object.assign(bad('This lab order is already closed.'), { status: 409 }); }
  await audit(pool, req.session.user, 'complete', 'lab_order', id, { hasReport: Boolean(req.file) });
  res.json(result.rows[0]);
}));

apiRouter.get('/lab-orders/:id/report', requireRole('admin','doctor','laboratory'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  const result = await pool.query('SELECT report_path,report_name FROM lab_orders WHERE id=$1', [id]);
  if (!result.rowCount || !result.rows[0].report_path) throw notFound('Report file not found.');
  await audit(pool, req.session.user, 'download', 'lab_report', id);
  const storedName = path.basename(result.rows[0].report_path);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(path.join(uploadDir, storedName), result.rows[0].report_name || 'lab-report');
}));

apiRouter.get('/prescriptions', requireRole('admin','doctor','pharmacy'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT r.*,p.name AS patient_name,p.mrn,u.name AS doctor_name,
      COALESCE(json_agg(json_build_object('id',i.id,'medicineName',i.medicine_name,'dosage',i.dosage,'frequency',i.frequency,'duration',i.duration,'quantity',i.quantity,'dispensedQuantity',i.dispensed_quantity)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items
     FROM prescriptions r JOIN patients p ON p.id=r.patient_id JOIN users u ON u.id=r.doctor_id
     LEFT JOIN prescription_items i ON i.prescription_id=r.id GROUP BY r.id,p.name,p.mrn,u.name ORDER BY r.created_at DESC LIMIT 250`,
  );
  await audit(pool, req.session.user, 'view_list', 'prescriptions', null, { count: result.rowCount });
  res.json(result.rows);
}));

apiRouter.post('/prescriptions', requireRole('admin','doctor'), asyncRoute(async (req, res) => {
  const patientId = idParam(req.body?.patientId);
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
  if (!patientId || !items.length) throw bad('Choose a patient and add at least one prescription item.');
  for (const item of items) {
    if (!text(item.medicineName, 160) || !text(item.dosage, 120) || !text(item.frequency, 120) || !text(item.duration, 120) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) throw bad('Each item needs a medicine, directions, duration, and positive quantity.');
  }
  const prescription = await transaction(async (client) => {
    const created = await client.query(
      'INSERT INTO prescriptions(patient_id,consultation_id,doctor_id,notes) VALUES($1,NULLIF($2,\'\')::bigint,$3,$4) RETURNING *',
      [patientId, text(req.body?.consultationId, 20), req.session.user.id, text(req.body?.notes, 3000)],
    );
    for (const item of items) await client.query(
      'INSERT INTO prescription_items(prescription_id,medicine_name,dosage,frequency,duration,quantity) VALUES($1,$2,$3,$4,$5,$6)',
      [created.rows[0].id, text(item.medicineName, 160), text(item.dosage, 120), text(item.frequency, 120), text(item.duration, 120), Number(item.quantity)],
    );
    await audit(client, req.session.user, 'create', 'prescription', created.rows[0].id);
    return created.rows[0];
  });
  res.status(201).json(prescription);
}));

apiRouter.post('/prescriptions/:id/dispense', requireRole('admin','pharmacy'), asyncRoute(async (req, res) => {
  const prescriptionId = idParam(req.params.id);
  const itemId = idParam(req.body?.itemId);
  const batchId = idParam(req.body?.batchId);
  const quantity = Number(req.body?.quantity);
  if (!prescriptionId || !itemId || !batchId || !Number.isInteger(quantity) || quantity < 1) throw bad('Choose a stock batch and a positive quantity to dispense.');
  const result = await transaction(async (client) => {
    const item = await client.query(
      `SELECT i.*,r.status AS prescription_status FROM prescription_items i JOIN prescriptions r ON r.id=i.prescription_id
       WHERE i.id=$1 AND r.id=$2 FOR UPDATE OF i,r`, [itemId, prescriptionId],
    );
    if (!item.rowCount || ['dispensed','cancelled'].includes(item.rows[0].prescription_status)) throw bad('This prescription item is not open for dispensing.');
    const row = item.rows[0];
    if (quantity > row.quantity - row.dispensed_quantity) throw bad('Dispense quantity exceeds the remaining prescription quantity.');
    const batch = await client.query(
      `SELECT b.*,m.name AS medicine_name FROM stock_batches b JOIN medicines m ON m.id=b.medicine_id
       WHERE b.id=$1 AND lower(m.name)=lower($2) AND b.expiry_date>=CURRENT_DATE FOR UPDATE OF b`, [batchId, row.medicine_name],
    );
    if (!batch.rowCount || batch.rows[0].quantity < quantity) throw bad('Selected batch is expired, unavailable, or has insufficient stock.');
    await client.query('UPDATE stock_batches SET quantity=quantity-$1 WHERE id=$2', [quantity, batchId]);
    const updated = await client.query('UPDATE prescription_items SET dispensed_quantity=dispensed_quantity+$1 WHERE id=$2 RETURNING *', [quantity, itemId]);
    await client.query('INSERT INTO dispensing(prescription_item_id,stock_batch_id,quantity,dispensed_by) VALUES($1,$2,$3,$4)', [itemId, batchId, quantity, req.session.user.id]);
    const remaining = await client.query('SELECT BOOL_AND(dispensed_quantity>=quantity) AS all_done FROM prescription_items WHERE prescription_id=$1', [prescriptionId]);
    const status = remaining.rows[0].all_done ? 'dispensed' : 'partially_dispensed';
    await client.query('UPDATE prescriptions SET status=$1 WHERE id=$2', [status, prescriptionId]);
    await audit(client, req.session.user, 'dispense', 'prescription_item', itemId, { quantity, batchId });
    return { item: updated.rows[0], status };
  });
  res.json(result);
}));

apiRouter.get('/medicines', requireRole('admin','pharmacy','doctor'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT m.id,m.name,m.category,m.unit,m.low_stock_threshold,COALESCE(SUM(b.quantity) FILTER(WHERE b.expiry_date>=CURRENT_DATE),0)::int AS available,
      COALESCE(SUM(b.quantity) FILTER(WHERE b.expiry_date<CURRENT_DATE),0)::int AS expired,
      COALESCE(json_agg(json_build_object('id',b.id,'batchNo',b.batch_no,'expiryDate',b.expiry_date,'quantity',b.quantity) ORDER BY b.expiry_date) FILTER(WHERE b.id IS NOT NULL),'[]') AS batches
     FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id=m.id GROUP BY m.id ORDER BY m.name`,
  );
  const rows = req.session.user.role === 'doctor' ? result.rows.map(({ batches, ...m }) => m) : result.rows;
  res.json(rows);
}));

apiRouter.post('/medicines', requireRole('admin','pharmacy'), asyncRoute(async (req, res) => {
  const name = text(req.body?.name, 160);
  const quantity = Number(req.body?.quantity || 0);
  const lowStockThreshold = Number(req.body?.lowStockThreshold);
  const batchNo = text(req.body?.batchNo, 80);
  const expiryDate = text(req.body?.expiryDate, 10);
  if (name.length < 2 || !Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 1_000_000 || (quantity > 0 && (!batchNo || !validDate(expiryDate) || expiryDate < new Date().toISOString().slice(0, 10)))) throw bad('Enter a medicine name, valid reorder threshold, and complete batch details for any initial stock.');
  const medicine = await transaction(async (client) => {
    const created = await client.query('INSERT INTO medicines(name,category,unit,low_stock_threshold) VALUES($1,$2,$3,$4) RETURNING *', [name, text(req.body?.category, 100) || 'General', text(req.body?.unit, 30) || 'units', lowStockThreshold]);
    if (quantity > 0) await client.query('INSERT INTO stock_batches(medicine_id,batch_no,expiry_date,quantity) VALUES($1,$2,$3,$4)', [created.rows[0].id, batchNo, expiryDate, quantity]);
    await audit(client, req.session.user, 'create', 'medicine', created.rows[0].id);
    return created.rows[0];
  });
  res.status(201).json(medicine);
}));

apiRouter.post('/medicines/:id/batches', requireRole('admin','pharmacy'), asyncRoute(async (req, res) => {
  const medicineId = idParam(req.params.id);
  const batchNo = text(req.body?.batchNo, 80);
  const expiryDate = text(req.body?.expiryDate, 10);
  const quantity = Number(req.body?.quantity);
  if (!medicineId || !batchNo || !validDate(expiryDate) || expiryDate < new Date().toISOString().slice(0, 10) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw bad('Enter a batch number, a current or future expiry date, and positive quantity.');
  const result = await pool.query('INSERT INTO stock_batches(medicine_id,batch_no,expiry_date,quantity) VALUES($1,$2,$3,$4) RETURNING *', [medicineId, batchNo, expiryDate, quantity]);
  await audit(pool, req.session.user, 'add_stock', 'medicine', medicineId, { batchNo, quantity });
  res.status(201).json(result.rows[0]);
}));

apiRouter.get('/users', requireRole('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT id,name,email,role,active,must_change_password,created_at FROM users ORDER BY name');
  res.json(result.rows);
}));

apiRouter.post('/users', requireRole('admin'), asyncRoute(async (req, res) => {
  const name = text(req.body?.name, 160);
  const email = text(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = text(req.body?.role, 30);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || !roles.includes(role)) throw bad('Enter a name, valid email, 12-character temporary password, and supported role.');
  const result = await pool.query(
    'INSERT INTO users(name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,TRUE) RETURNING id,name,email,role,active,must_change_password,created_at',
    [name, email, await bcrypt.hash(password, 12), role],
  );
  await audit(pool, req.session.user, 'create', 'user', result.rows[0].id, { role });
  res.status(201).json(result.rows[0]);
}));

apiRouter.post('/users/:id/reset-password', requireRole('admin'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id || id === Number(req.session.user.id)) throw bad('Use My account to change your own password.');
  const temporaryPassword = randomBytes(18).toString('base64url');
  const result = await pool.query(
    'UPDATE users SET password_hash=$1,must_change_password=TRUE WHERE id=$2 RETURNING id',
    [await bcrypt.hash(temporaryPassword, 12), id],
  );
  if (!result.rowCount) throw notFound('User not found.');
  await audit(pool, req.session.user, 'reset_password', 'user', id);
  res.json({ temporaryPassword });
}));

apiRouter.patch('/users/:id/active', requireRole('admin'), asyncRoute(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id || id === Number(req.session.user.id)) throw bad('You cannot deactivate your own account.');
  const active = req.body?.active === true;
  const result = await pool.query('UPDATE users SET active=$1 WHERE id=$2 RETURNING id,name,email,role,active', [active, id]);
  if (!result.rowCount) throw notFound('User not found.');
  await audit(pool, req.session.user, active ? 'activate' : 'deactivate', 'user', id);
  res.json(result.rows[0]);
}));

apiRouter.get('/reports/summary', requireRole('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM patients) AS patients,
       (SELECT COUNT(*)::int FROM appointments WHERE scheduled_at>=date_trunc('month',CURRENT_DATE) AND scheduled_at<date_trunc('month',CURRENT_DATE)+INTERVAL '1 month') AS appointments_this_month,
       (SELECT COUNT(*)::int FROM consultations WHERE created_at>=date_trunc('month',CURRENT_DATE)) AS consultations_this_month,
       (SELECT COUNT(*)::int FROM lab_orders WHERE status IN ('pending','in_progress')) AS lab_pending,
       (SELECT COUNT(*)::int FROM prescriptions WHERE status IN ('active','partially_dispensed')) AS prescriptions_open,
       (SELECT COUNT(*)::int FROM (SELECT m.id FROM medicines m LEFT JOIN stock_batches b ON b.medicine_id=m.id AND b.expiry_date>=CURRENT_DATE GROUP BY m.id,m.low_stock_threshold HAVING COALESCE(SUM(b.quantity),0)<=m.low_stock_threshold) s) AS low_stock`,
  );
  res.json(result.rows[0]);
}));

apiRouter.get('/reports/export.csv', requireRole('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT mrn,name,date_of_birth,sex,phone,blood_group,created_at FROM patients ORDER BY created_at DESC');
  await audit(pool, _req.session.user, 'export', 'patient_register', null, { count: result.rowCount });
  const safe = (value) => {
    let cell = value == null ? '' : value instanceof Date ? value.toISOString().slice(0,10) : String(value);
    if (/^[=+@-]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"','""')}"`;
  };
  const rows = [['MRN','Name','Date of birth','Sex','Phone','Blood group','Registered']].concat(result.rows.map((row) => [row.mrn,row.name,row.date_of_birth,row.sex,row.phone,row.blood_group,row.created_at]));
  res.type('text/csv').attachment('svasthya-patient-register.csv').send(rows.map((row) => row.map(safe).join(',')).join('\r\n'));
}));

apiRouter.get('/audit-events', requireRole('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT a.id,a.action,a.entity,a.entity_id,a.details,a.created_at,u.name AS actor_name,u.email AS actor_email
     FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200`,
  );
  res.json(result.rows);
}));
