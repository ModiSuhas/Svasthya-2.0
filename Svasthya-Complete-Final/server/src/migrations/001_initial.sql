CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','registration','doctor','laboratory','pharmacy')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);

CREATE SEQUENCE IF NOT EXISTS patient_mrn_seq START 1001;

CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  mrn TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  date_of_birth DATE,
  sex TEXT NOT NULL DEFAULT 'Not specified',
  phone TEXT,
  address TEXT,
  blood_group TEXT,
  allergies TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patients_name_idx ON patients (LOWER(name));
CREATE INDEX IF NOT EXISTS patients_phone_idx ON patients (phone);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','waiting','in_progress','completed','cancelled')),
  doctor_id BIGINT REFERENCES users(id),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS appointments_schedule_idx ON appointments (scheduled_at DESC);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status);

CREATE TABLE IF NOT EXISTS consultations (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  appointment_id BIGINT REFERENCES appointments(id),
  doctor_id BIGINT NOT NULL REFERENCES users(id),
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  blood_pressure TEXT NOT NULL DEFAULT '',
  temperature NUMERIC(5,2),
  pulse INTEGER,
  weight NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultations_patient_idx ON consultations (patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lab_orders (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  consultation_id BIGINT REFERENCES consultations(id),
  test_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  result_text TEXT NOT NULL DEFAULT '',
  report_path TEXT,
  report_name TEXT,
  requested_by BIGINT NOT NULL REFERENCES users(id),
  completed_by BIGINT REFERENCES users(id),
  result_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lab_orders_status_idx ON lab_orders (status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS prescriptions (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  consultation_id BIGINT REFERENCES consultations(id),
  doctor_id BIGINT NOT NULL REFERENCES users(id),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','partially_dispensed','dispensed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS prescription_items (
  id BIGSERIAL PRIMARY KEY,
  prescription_id BIGINT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  dispensed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (dispensed_quantity >= 0)
);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS medicines (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'General',
  unit TEXT NOT NULL DEFAULT 'units',
  low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_batches (
  id BIGSERIAL PRIMARY KEY,
  medicine_id BIGINT NOT NULL REFERENCES medicines(id),
  batch_no TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (medicine_id, batch_no)
);
CREATE INDEX IF NOT EXISTS stock_expiry_idx ON stock_batches (expiry_date);
CREATE TABLE IF NOT EXISTS dispensing (
  id BIGSERIAL PRIMARY KEY,
  prescription_item_id BIGINT NOT NULL REFERENCES prescription_items(id),
  stock_batch_id BIGINT NOT NULL REFERENCES stock_batches(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  dispensed_by BIGINT NOT NULL REFERENCES users(id),
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events (created_at DESC);
