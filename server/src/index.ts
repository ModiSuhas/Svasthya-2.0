import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();
const production = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, cb) => { if (!production) return cb(null, origin || true); return cb(null, origin === (process.env.CLIENT_ORIGIN || 'http://localhost:5173')); }, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const token = randomBytes(24).toString('hex');
  res.cookie('csrf', token, { httpOnly: false, secure: production, sameSite: 'strict', path: '/' });
  next();
});
type SessionRequest = express.Request & { user?: { id: string; role: Role; email: string } };
const roles = (...allowed: Role[]) => (req: SessionRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    req.user = jwt.verify(token, secret!) as { id: string; role: Role; email: string };
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Your portal role cannot perform this action.' });
    const csrfCookie = req.cookies.csrf;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && (!csrfCookie || csrfCookie !== req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token expired. Refresh and try again.' });
    next();
  } catch { return res.status(401).json({ error: 'Your session expired. Please sign in again.' }); }
};
const anyRole = Object.values(Role);
const audit = (userId: string, action: string, entity: string, entityId?: string) => prisma.auditEvent.create({ data: { userId, action, entity, entityId } }).catch(() => undefined);
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Svasthya' }));
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  if (!req.cookies.csrf || req.cookies.csrf !== req.get('x-csrf-token')) return res.status(403).json({ error: 'Security token expired. Refresh and try again.' });
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, secret!, { expiresIn: '8h' });
  res.cookie('session', token, { httpOnly: true, secure: production, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/' });
  await audit(user.id, 'SIGN_IN', 'User', user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
app.post('/api/auth/logout', roles(...anyRole), async (req: SessionRequest, res) => { await audit(req.user!.id, 'SIGN_OUT', 'User', req.user!.id); res.clearCookie('session', { path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', roles(...anyRole), async (req: SessionRequest, res) => { const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, name: true, email: true, role: true } }); res.json({ user: u }); });
app.patch('/api/account/profile', roles(...anyRole), async (req: SessionRequest, res) => {
  const p=z.object({name:z.string().trim().min(2).max(80)}).safeParse(req.body); if(!p.success)return res.status(400).json({error:'Enter a name between 2 and 80 characters.'});
  const user=await prisma.user.update({where:{id:req.user!.id},data:{name:p.data.name}}); await audit(user.id,'UPDATE_PROFILE','User',user.id); res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role}});
});
app.post('/api/account/password', roles(...anyRole), async (req: SessionRequest, res) => {
  const p=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(10).max(100).regex(/[a-z]/,'Use a lowercase letter.').regex(/[A-Z]/,'Use an uppercase letter.').regex(/[0-9]/,'Use a number.')}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'New password must be 10–100 characters and include uppercase, lowercase, and a number.'});
  const user=await prisma.user.findUnique({where:{id:req.user!.id}}); if(!user||!(await bcrypt.compare(p.data.currentPassword,user.passwordHash)))return res.status(400).json({error:'Current password is incorrect.'});
  if(p.data.currentPassword===p.data.newPassword)return res.status(400).json({error:'Choose a password different from your current one.'});
  await prisma.user.update({where:{id:user.id},data:{passwordHash:await bcrypt.hash(p.data.newPassword,12)}}); await audit(user.id,'CHANGE_PASSWORD','User',user.id); res.clearCookie('session',{path:'/'}); res.json({ok:true,requiresSignIn:true});
});
app.get('/api/account/activity', roles(...anyRole), async (req: SessionRequest,res)=>res.json(await prisma.auditEvent.findMany({where:{userId:req.user!.id},orderBy:{createdAt:'desc'},take:12,select:{id:true,action:true,entity:true,createdAt:true}})));
app.get('/api/dashboard', roles(...anyRole), async (req: SessionRequest, res) => {
  const now=new Date(), soon=new Date(now.getTime()+60*24*60*60*1000);
  const [patients, waiting, labToCollect, labToVerify, prescriptions, stockBatches, expiring, recent] = await Promise.all([
    prisma.patient.count(),
    prisma.visit.count({ where: { status: { in: ['WAITING','REVIEW'] } } }),
    prisma.labRequest.count({ where: { status: 'REQUESTED' } }),
    prisma.labRequest.count({ where: { status: { in: ['SAMPLE_COLLECTED','PROCESSING'] } } }),
    prisma.prescription.count({where:{dispensedAt:null}}),
    prisma.medicineBatch.findMany({select:{quantity:true,reorderLevel:true}}),
    prisma.medicineBatch.count({where:{expiryDate:{gte:now,lte:soon},quantity:{gt:0}}}),
    prisma.visit.findMany({ take: 8, orderBy: { createdAt: 'desc' }, include: { patient: true } })
  ]);
  const lowStock=stockBatches.filter((batch:any)=>batch.quantity<=batch.reorderLevel).length;
  res.json({ role:req.user!.role,patients,waiting,labToCollect,labToVerify,prescriptions,lowStock,expiring,recent });
});
app.get('/api/patients', roles(Role.ADMIN, Role.REGISTRATION, Role.DOCTOR, Role.LAB), async (req, res) => { const q = String(req.query.q || '').trim(); const rows = await prisma.patient.findMany({ where: q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { patientNumber: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : undefined, orderBy: { createdAt: 'desc' }, take: 100, include: { visits: { orderBy: { createdAt: 'desc' }, take: 1 } } }); res.json(rows); });
app.post('/api/patients', roles(Role.ADMIN, Role.REGISTRATION), async (req: SessionRequest, res) => {
  const schema = z.object({ firstName: z.string().min(1), middleName: z.string().optional(), lastName: z.string().min(1), age: z.coerce.number().int().min(0).max(130), gender: z.string().min(1), phone: z.string().min(7), idType: z.string().optional(), idNumber: z.string().optional(), village: z.string().optional(), address: z.string().optional(), heightCm: z.coerce.number().positive().optional(), weightKg: z.coerce.number().positive().optional(), bloodPressure: z.string().optional(), pulseBpm: z.coerce.number().int().positive().optional(), reason: z.string().optional() });
  const p = schema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Check the required patient details.' });
  const { reason, ...patientData } = p.data; const patient = await prisma.patient.create({ data: { ...patientData, firstName: patientData.firstName!, lastName: patientData.lastName!, age: patientData.age!, gender: patientData.gender!, phone: patientData.phone!, patientNumber: `SV-${Date.now().toString().slice(-8)}`, visits: { create: { visitNumber: `V-${Date.now().toString().slice(-8)}`, reason, status: 'WAITING' } } } });
  await audit(req.user!.id, 'CREATE', 'Patient', patient.id); res.status(201).json(patient);
});
app.post('/api/patients/:id/visits', roles(Role.ADMIN,Role.REGISTRATION), async (req:SessionRequest,res)=>{const p=z.object({reason:z.string().trim().min(2).max(240)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enter a short reason for the visit.'});const patientId=String(req.params.id);const patient=await prisma.patient.findUnique({where:{id:patientId},select:{id:true}});if(!patient)return res.status(404).json({error:'Patient not found.'});const visit=await prisma.visit.create({data:{visitNumber:`V-${Date.now()}-${randomBytes(2).toString('hex')}`,patientId,reason:p.data.reason,status:'WAITING'}});await audit(req.user!.id,'CREATE','Visit',visit.id);res.status(201).json(visit);});
app.get('/api/visits', roles(Role.ADMIN, Role.REGISTRATION, Role.DOCTOR, Role.LAB), async (req, res) => { const status = req.query.status as any; const rows = await prisma.visit.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'asc' }, include: { patient: true, clinician: { select: { name: true } }, labRequests: { include: { result: true } }, prescriptions: { include: { items: { include: { medicine: true } } } } }, take: 200 }); res.json(rows); });
app.patch('/api/visits/:id', roles(Role.DOCTOR, Role.ADMIN), async (req: SessionRequest, res) => {
  const p=z.object({symptoms:z.string().max(4000).optional(),examination:z.string().max(4000).optional(),diagnosis:z.string().max(500).optional(),notes:z.string().max(5000).optional(),followUp:z.string().max(500).optional(),followUpDate:z.string().optional(),status:z.enum(['WAITING','IN_CONSULTATION','LAB_PENDING','REVIEW','PHARMACY','COMPLETED']).optional()}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Check the consultation details and try again.'});
  const {followUpDate,...data}=p.data;const visit=await prisma.visit.update({where:{id:String(req.params.id)},data:{...data,followUpDate:followUpDate?new Date(`${followUpDate}T12:00:00`):null,clinicianId:req.user!.id}});
  await audit(req.user!.id,'UPDATE','Visit',visit.id);res.json(visit);
});
app.post('/api/visits/:id/labs', roles(Role.DOCTOR, Role.ADMIN), async (req: SessionRequest, res) => { const p = z.object({ testName: z.string().min(2), disease: z.string().optional(), sampleType: z.string().optional() }).safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Enter the test name.' }); const r = await prisma.labRequest.create({ data: { testName:p.data.testName!, disease:p.data.disease, sampleType:p.data.sampleType, visit:{connect:{id:String(req.params.id)}}, requestedBy:{connect:{id:req.user!.id}} } }); await prisma.visit.update({ where: { id: String(req.params.id) }, data: { status: 'LAB_PENDING' } }); await audit(req.user!.id, 'CREATE', 'LabRequest', r.id); res.status(201).json(r); });
app.post('/api/visits/:id/prescriptions', roles(Role.DOCTOR, Role.ADMIN), async (req: SessionRequest, res) => {
  const p=z.object({medicineId:z.string(),dosage:z.string().min(1),quantity:z.coerce.number().int().positive(),instructions:z.string().optional()}).safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Choose a medicine and enter dosage and quantity.'});
  const prescription=await prisma.prescription.create({data:{visitId:String(req.params.id),prescribedById:req.user!.id,items:{create:{medicineId:p.data.medicineId!,dosage:p.data.dosage!,quantity:p.data.quantity!,instructions:p.data.instructions}}},include:{items:{include:{medicine:true}}}});
  await prisma.visit.update({where:{id:String(req.params.id)},data:{status:'PHARMACY'}}); await audit(req.user!.id,'CREATE','Prescription',prescription.id); res.status(201).json(prescription);
});
app.patch('/api/labs/:id/status', roles(Role.LAB, Role.ADMIN), async (req: SessionRequest, res) => { const p = z.object({ status: z.enum(['SAMPLE_COLLECTED','PROCESSING']) }).safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Invalid sample status.' }); const r = await prisma.labRequest.update({ where: { id: String(req.params.id) }, data: { status: p.data.status } }); await audit(req.user!.id, 'UPDATE', 'LabRequest', r.id); res.json(r); });
app.post('/api/labs/:id/result', roles(Role.LAB, Role.ADMIN), async (req: SessionRequest, res) => { const p=z.object({value:z.string().trim().min(1).max(1000),interpretation:z.string().max(2000).optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enter a valid result before verifying.'});const result=await prisma.$transaction(async tx=>{const id=String(req.params.id);const r=await tx.labResult.upsert({where:{requestId:id},create:{requestId:id,value:p.data.value,interpretation:p.data.interpretation,verifiedById:req.user!.id},update:{value:p.data.value,interpretation:p.data.interpretation,verifiedById:req.user!.id,verifiedAt:new Date()}});const lab=await tx.labRequest.update({where:{id},data:{status:'VERIFIED'},select:{visitId:true}});const pending=await tx.labRequest.count({where:{visitId:lab.visitId,status:{not:'VERIFIED'}}});await tx.visit.update({where:{id:lab.visitId},data:{status:pending?'LAB_PENDING':'REVIEW'}});return r;});await audit(req.user!.id,'VERIFY','LabResult',result.id);res.status(201).json(result);});
app.get('/api/medicines', roles(Role.ADMIN, Role.DOCTOR, Role.PHARMACY), async (_req, res) => { res.json(await prisma.medicine.findMany({ include: { batches: {include:{adjustments:{orderBy:{createdAt:'desc'},take:1,include:{user:{select:{name:true}}}}}} } })); });
app.post('/api/medicines', roles(Role.PHARMACY,Role.ADMIN), async (req: SessionRequest, res) => { const p = z.object({ name:z.string().trim().min(2),category:z.string().optional(),batchNumber:z.string().trim().min(1),expiryDate:z.string().min(10),quantity:z.coerce.number().int().min(0),reorderLevel:z.coerce.number().int().min(0) }).safeParse(req.body); if(!p.success)return res.status(400).json({error:'Check medicine, batch, expiry, and quantity details.'}); const expiryDate=new Date(`${p.data.expiryDate}T12:00:00`);if(Number.isNaN(expiryDate.getTime())||expiryDate<=new Date())return res.status(400).json({error:'Expiry date must be a valid future date.'});try{const m=await prisma.medicine.upsert({where:{name:p.data.name},create:{name:p.data.name,category:p.data.category,batches:{create:{batchNumber:p.data.batchNumber,expiryDate,quantity:p.data.quantity,reorderLevel:p.data.reorderLevel}}},update:{category:p.data.category,batches:{create:{batchNumber:p.data.batchNumber,expiryDate,quantity:p.data.quantity,reorderLevel:p.data.reorderLevel}}}});await audit(req.user!.id,'ADD_BATCH','Medicine',m.id);res.status(201).json(m);}catch(e){res.status(409).json({error:'That medicine batch already exists. Use a unique batch number.'});} });
app.post('/api/inventory/:batchId/adjustments',roles(Role.PHARMACY,Role.ADMIN),async(req:SessionRequest,res)=>{const p=z.object({quantityChange:z.coerce.number().int().min(-100000).max(100000).refine(n=>n!==0),reason:z.string().trim().min(3).max(240)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enter a non-zero quantity change and a reason.'});try{const adjustment=await prisma.$transaction(async tx=>{const batch=await tx.medicineBatch.findUniqueOrThrow({where:{id:String(req.params.batchId)}});const next=batch.quantity+p.data.quantityChange;if(next<0)throw new Error('Adjustment cannot reduce stock below zero.');if(p.data.quantityChange>0&&batch.expiryDate<=new Date())throw new Error('Expired batches cannot receive additional stock.');await tx.medicineBatch.update({where:{id:batch.id},data:{quantity:next}});return tx.inventoryAdjustment.create({data:{batchId:batch.id,userId:req.user!.id,quantityChange:p.data.quantityChange,reason:p.data.reason}});});await audit(req.user!.id,'ADJUST_STOCK','MedicineBatch',adjustment.batchId);res.status(201).json(adjustment);}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Unable to adjust stock.'});}});
app.get('/api/prescriptions', roles(Role.ADMIN, Role.PHARMACY), async (_req,res)=>res.json(await prisma.prescription.findMany({where:{dispensedAt:null},include:{visit:{include:{patient:true}},items:{include:{medicine:true}}},orderBy:{createdAt:'asc'}})));
app.post('/api/prescriptions/:id/dispense', roles(Role.PHARMACY,Role.ADMIN), async (req: SessionRequest,res)=>{
  try { const record=await prisma.$transaction(async tx=>{ const p=await tx.prescription.findUniqueOrThrow({where:{id:String(req.params.id)},include:{items:true}}); const items=await tx.prescriptionItem.findMany({where:{prescriptionId:p.id}}); if(p.dispensedAt)throw new Error('Already dispensed'); for(const item of items){let remaining=item.quantity;const batches=await tx.medicineBatch.findMany({where:{medicineId:item.medicineId,expiryDate:{gt:new Date()},quantity:{gt:0}},orderBy:{expiryDate:'asc'}});for(const batch of batches){if(!remaining)break;const take=Math.min(remaining,batch.quantity);await tx.medicineBatch.update({where:{id:batch.id},data:{quantity:{decrement:take}}});remaining-=take;}if(remaining)throw new Error('Insufficient unexpired stock for one or more items');} await tx.prescription.update({where:{id:p.id},data:{dispensedAt:new Date()}});await tx.visit.update({where:{id:p.visitId},data:{status:'COMPLETED'}});return p;}); await audit(req.user!.id,'DISPENSE','Prescription',record.id);res.json({ok:true});}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Unable to dispense prescription.'});}
});
app.get('/api/reports/labs', roles(Role.ADMIN, Role.DOCTOR, Role.LAB), async (req, res) => { const from = req.query.from ? new Date(String(req.query.from)) : new Date('2000-01-01'); const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date(Date.now()+86400000); const requests = await prisma.labRequest.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { result: true, visit: { include: { patient: true } } }, orderBy: { createdAt: 'desc' } }); const diseases = ['Anthrax','Chandipura Virus','Chickenpox','Chikungunya','Cholera','Crimean-Congo Haemorrhagic Fever','Dengue','Diphtheria','Hepatitis A','Hepatitis E','Human Rabies','Influenza','Influenza & Covid-19','Japanese Encephalitis','Kyasanur Forest Disease','Leptospirosis','Malaria','Malaria (syndromic surveillance)','Measles','Meningitis','Mpox','Mumps','Pertussis','Rubella','Scrub Typhus','Shigellosis','Typhoid','Others']; const rows = diseases.map(disease => { const found = requests.filter(r => (r.disease || '').toLowerCase() === disease.toLowerCase() || (disease === 'Malaria' && r.testName.toLowerCase().includes('malaria'))); const positive = found.filter(r => /positive|detected/i.test(r.result?.value || '')); const male=positive.filter(r=>r.visit.patient.gender.toLowerCase()==='male'), female=positive.filter(r=>r.visit.patient.gender.toLowerCase()==='female'); return { disease, tests: [...new Set(found.map(r=>r.testName))].join(', ') || '—', samples: found.filter(r=>r.status==='VERIFIED').length, positive: positive.length, maleUnder5: male.filter(r=>(r.visit.patient.age||0)<=5).length, maleOver5: male.filter(r=>(r.visit.patient.age||0)>5).length, femaleUnder5: female.filter(r=>(r.visit.patient.age||0)<=5).length, femaleOver5: female.filter(r=>(r.visit.patient.age||0)>5).length }; }); res.json({ rows, totalSamples: requests.filter(r=>r.status==='VERIFIED').length, positive: requests.filter(r=>/positive|detected/i.test(r.result?.value||'')).length }); });
app.get('/api/reports/cases', roles(Role.ADMIN,Role.DOCTOR), async (req, res) => {const from=req.query.from?new Date(`${String(req.query.from)}T00:00:00.000Z`):undefined;const to=req.query.to?new Date(`${String(req.query.to)}T23:59:59.999Z`):undefined;res.json(await prisma.caseReport.findMany({where:from||to?{reportDate:{...(from?{gte:from}:{}),...(to?{lte:to}:{})}}:undefined,orderBy:{reportDate:'desc'},include:{patient:true}}));});
app.post('/api/cases', roles(Role.DOCTOR, Role.ADMIN), async (req: SessionRequest, res) => { const p=z.object({patientId:z.string().optional(),disease:z.string().min(2),onsetDate:z.string().optional(),provisionalDiagnosis:z.string().optional(),opdIpd:z.string().optional(),status:z.string().optional(),notes:z.string().optional()}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Check case report details.'});const patient=p.data.patientId?await prisma.patient.findUnique({where:{patientNumber:p.data.patientId}}):null;if(p.data.patientId&&!patient)return res.status(400).json({error:'Patient number was not found.'});const row=await prisma.caseReport.create({data:{...(patient?{patientId:patient.id}:{}),disease:p.data.disease!,onsetDate:p.data.onsetDate?new Date(p.data.onsetDate):undefined,provisionalDiagnosis:p.data.provisionalDiagnosis,opdIpd:p.data.opdIpd,status:p.data.status,notes:p.data.notes,createdById:req.user!.id}});await audit(req.user!.id,'CREATE','CaseReport',row.id);res.status(201).json(row);});
app.post('/api/admin/users', roles(Role.ADMIN), async (req: SessionRequest, res) => { const p=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(10),role:z.enum(['REGISTRATION','DOCTOR','LAB','PHARMACY'])}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Use a valid email and password of at least 10 characters.'});const u=await prisma.user.create({data:{name:p.data.name!,email:p.data.email.toLowerCase(),role:p.data.role!,passwordHash:await bcrypt.hash(p.data.password!,12)}});await audit(req.user!.id,'CREATE','User',u.id);res.status(201).json({id:u.id,name:u.name,email:u.email,role:u.role});});
app.get('/api/admin/users', roles(Role.ADMIN), async (_req,res)=>res.json(await prisma.user.findMany({select:{id:true,name:true,email:true,role:true,active:true,createdAt:true},orderBy:{createdAt:'desc'}})));
if (production) { app.use(express.static(resolve(process.cwd(), 'dist'))); app.use((req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(resolve(process.cwd(), 'dist/index.html'))); }
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Svasthya API listening on ${port}`));
