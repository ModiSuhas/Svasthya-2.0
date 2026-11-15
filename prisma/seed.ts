import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
const passwordHash = await bcrypt.hash('Demo@12345', 10);
const demoUsers = [
  ['Admin User','admin@svasthya.local','ADMIN'],
  ['Registration Desk','registration@svasthya.local','REGISTRATION'],
  ['Medical Officer','doctor@svasthya.local','DOCTOR'],
  ['Laboratory Team','lab@svasthya.local','LAB'],
  ['Pharmacy Team','pharmacy@svasthya.local','PHARMACY'],
] as const;
for (const [name,email,role] of demoUsers) await db.user.upsert({ where:{email}, update:{name,role,active:true}, create:{name,email,role,passwordHash} });
const doctor=await db.user.findUniqueOrThrow({where:{email:'doctor@svasthya.local'}});
const lab=await db.user.findUniqueOrThrow({where:{email:'lab@svasthya.local'}});
const patientCount=await db.patient.count();
if (!patientCount) {
  const p1=await db.patient.create({data:{patientNumber:'SV-240001',firstName:'Aarav',lastName:'Patel',age:28,gender:'Male',phone:'9876501234',village:'Jakhvada',heightCm:172,weightKg:68,bloodPressure:'120/80',pulseBpm:74,visits:{create:{visitNumber:'V-260001',status:'WAITING',reason:'Fever and body ache'}}}});
  const p2=await db.patient.create({data:{patientNumber:'SV-240002',firstName:'Kavya',lastName:'Shah',age:36,gender:'Female',phone:'9876505678',village:'Sanand',heightCm:158,weightKg:57,bloodPressure:'116/76',pulseBpm:78,visits:{create:{visitNumber:'V-260002',status:'LAB_PENDING',reason:'Fever for three days',symptoms:'Fever, headache',diagnosis:'Suspected dengue',clinicianId:doctor.id}}}});
  const visit=await db.visit.findFirstOrThrow({where:{patientId:p2.id}});
  await db.labRequest.create({data:{visitId:visit.id,testName:'Dengue NS1 Antigen',disease:'Dengue',sampleType:'Blood',requestedById:doctor.id,status:'SAMPLE_COLLECTED'}});
  await db.caseReport.create({data:{patientId:p2.id,disease:'Dengue',provisionalDiagnosis:'Suspected dengue',createdById:doctor.id}});
  void p1;
}
for (const [name,category,batch,qty] of [['Paracetamol 500 mg','Analgesic','PCM-2026-A',85],['ORS Sachets','Rehydration','ORS-2026-B',8],['Cetirizine 10 mg','Antihistamine','CTZ-2026-C',42]] as const) {
  const medicine=await db.medicine.upsert({where:{name},update:{category},create:{name,category}});
  await db.medicineBatch.upsert({where:{medicineId_batchNumber:{medicineId:medicine.id,batchNumber:batch}},update:{},create:{medicineId:medicine.id,batchNumber:batch,expiryDate:new Date('2027-12-31'),quantity:qty,reorderLevel:10}});
}
console.log(`Seeded ${demoUsers.length} demo accounts, sample patients, and medicine stock.`);
await db.$disconnect();
