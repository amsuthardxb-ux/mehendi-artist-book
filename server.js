import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized:false } });
app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public')));

function auth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  try { req.admin=jwt.verify(token,process.env.JWT_SECRET); next(); } catch { res.status(401).json({error:'Unauthorized'}); }
}
function code(){ return 'MAB-'+crypto.randomBytes(4).toString('hex').toUpperCase(); }
async function init(){
  await pool.query(`CREATE TABLE IF NOT EXISTS admins(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS artists(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,location TEXT NOT NULL,phone TEXT,experience TEXT,starting_price INTEGER,specialty TEXT,image_url TEXT,about TEXT,rating NUMERIC(2,1),verified BOOLEAN NOT NULL DEFAULT FALSE,featured BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS bookings(id BIGSERIAL PRIMARY KEY,booking_code TEXT UNIQUE NOT NULL,artist_id BIGINT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,customer_name TEXT NOT NULL,customer_phone TEXT NOT NULL,customer_email TEXT,event_date DATE NOT NULL,event_time TIME NOT NULL,event_location TEXT NOT NULL,notes TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','created','paid','failed','refunded')),payment_order_id TEXT,payment_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE INDEX IF NOT EXISTS bookings_artist_date_idx ON bookings(artist_id,event_date,event_time);`);
  const email=process.env.ADMIN_EMAIL, pw=process.env.ADMIN_PASSWORD;
  if(email&&pw){const r=await pool.query('SELECT id FROM admins WHERE email=$1',[email]); if(!r.rowCount) await pool.query('INSERT INTO admins(email,password_hash) VALUES($1,$2)',[email,await bcrypt.hash(pw,12)]);}
}

app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true});}catch(e){res.status(503).json({ok:false});}});
app.get('/api/artists',async(req,res)=>{const q=(req.query.q||'').trim(); const vals=[]; let where=''; if(q){vals.push('%'+q+'%');where='WHERE name ILIKE $1 OR location ILIKE $1 OR specialty ILIKE $1';} const r=await pool.query(`SELECT id,name,location,phone,experience,starting_price,specialty,image_url,about,rating,verified,featured FROM artists ${where} ORDER BY featured DESC, verified DESC, id DESC`,vals);res.json(r.rows);});
app.get('/api/artists/:id',async(req,res)=>{const r=await pool.query('SELECT * FROM artists WHERE id=$1',[req.params.id]); if(!r.rowCount)return res.status(404).json({error:'Artist not found'});res.json(r.rows[0]);});
app.post('/api/bookings',async(req,res)=>{
  const {artist_id,customer_name,customer_phone,customer_email,event_date,event_time,event_location,notes}=req.body||{};
  if(!artist_id||!customer_name||!customer_phone||!event_date||!event_time||!event_location)return res.status(400).json({error:'Please fill all required fields.'});
  const a=await pool.query('SELECT id,name FROM artists WHERE id=$1',[artist_id]); if(!a.rowCount)return res.status(404).json({error:'Artist not found'});
  const clash=await pool.query(`SELECT 1 FROM bookings WHERE artist_id=$1 AND event_date=$2 AND event_time=$3 AND status IN ('pending','confirmed') LIMIT 1`,[artist_id,event_date,event_time]);
  if(clash.rowCount)return res.status(409).json({error:'That artist is already booked for this date and time.'});
  const bookingCode=code(); const r=await pool.query(`INSERT INTO bookings(booking_code,artist_id,customer_name,customer_phone,customer_email,event_date,event_time,event_location,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING booking_code,status,payment_status`,[bookingCode,artist_id,customer_name.trim(),customer_phone.trim(),customer_email?.trim()||null,event_date,event_time,event_location.trim(),notes?.trim()||null]);
  res.status(201).json({message:'Booking received',artist:a.rows[0].name,...r.rows[0]});
});
app.post('/api/admin/login',async(req,res)=>{const {email,password}=req.body||{}; const r=await pool.query('SELECT * FROM admins WHERE email=$1',[String(email||'').toLowerCase().trim()]); if(!r.rowCount||!await bcrypt.compare(password||'',r.rows[0].password_hash))return res.status(401).json({error:'Invalid email or password'}); const token=jwt.sign({id:r.rows[0].id,email:r.rows[0].email},process.env.JWT_SECRET,{expiresIn:'8h'});res.json({token});});
app.get('/api/admin/stats',auth,async(_req,res)=>{const [a,b,p]=await Promise.all([pool.query('SELECT count(*)::int n FROM artists'),pool.query('SELECT count(*)::int n FROM bookings'),pool.query("SELECT count(*)::int n FROM bookings WHERE status='pending'")]);res.json({artists:a.rows[0].n,bookings:b.rows[0].n,pending:p.rows[0].n});});
app.get('/api/admin/bookings',auth,async(_req,res)=>{const r=await pool.query(`SELECT b.*,a.name artist_name FROM bookings b JOIN artists a ON a.id=b.artist_id ORDER BY b.created_at DESC`);res.json(r.rows);});
app.patch('/api/admin/bookings/:id',auth,async(req,res)=>{const {status,payment_status}=req.body||{}; const r=await pool.query(`UPDATE bookings SET status=COALESCE($1,status),payment_status=COALESCE($2,payment_status),updated_at=NOW() WHERE id=$3 RETURNING *`,[status||null,payment_status||null,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Booking not found'});res.json(r.rows[0]);});
app.post('/api/admin/artists',auth,async(req,res)=>{const x=req.body||{}; if(!x.name||!x.location)return res.status(400).json({error:'Name and location are required'}); const r=await pool.query(`INSERT INTO artists(name,location,phone,experience,starting_price,specialty,image_url,about,rating,verified,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[x.name,x.location,x.phone||null,x.experience||null,x.starting_price?Number(x.starting_price):null,x.specialty||null,x.image_url||null,x.about||null,x.rating?Number(x.rating):null,!!x.verified,!!x.featured]);res.status(201).json(r.rows[0]);});
app.patch('/api/admin/artists/:id',auth,async(req,res)=>{const x=req.body||{}; const r=await pool.query(`UPDATE artists SET name=COALESCE($1,name),location=COALESCE($2,location),phone=$3,experience=$4,starting_price=$5,specialty=$6,image_url=$7,about=$8,rating=$9,verified=$10,featured=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[x.name,x.location,x.phone||null,x.experience||null,x.starting_price?Number(x.starting_price):null,x.specialty||null,x.image_url||null,x.about||null,x.rating?Number(x.rating):null,!!x.verified,!!x.featured,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Artist not found'});res.json(r.rows[0]);});
app.delete('/api/admin/artists/:id',auth,async(req,res)=>{try{await pool.query('DELETE FROM artists WHERE id=$1',[req.params.id]);res.json({ok:true});}catch(e){res.status(409).json({error:'Cannot delete an artist with existing bookings.'});}});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
init().then(()=>app.listen(port,()=>console.log(`Mehendi Artist Book running on ${port}`))).catch(e=>{console.error(e);process.exit(1)});
