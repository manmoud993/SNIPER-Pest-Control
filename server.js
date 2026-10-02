
const http=require('http'), fs=require('fs'), path=require('path'), crypto=require('crypto');
const PORT=process.env.PORT||3000;
const DB=path.join(__dirname,'data.json');
const publicDir=path.join(__dirname,'public');
const sessions=new Map();

function seed(){
 if(!fs.existsSync(DB)){
  const hash=crypto.createHash('sha256').update('1234').digest('hex');
  fs.writeFileSync(DB,JSON.stringify({settings:{company:"SNIPER",adminName:"المدير",passwordHash:hash},prices:[
   {id:1,name:"مكافحة الصراصير",price:35},{id:2,name:"مكافحة النمل",price:30},{id:3,name:"مكافحة بق الفراش",price:50},{id:4,name:"مكافحة القوارض",price:60}
  ],customers:[],bookings:[],reports:[],next:{customer:1,booking:1001,report:1}},null,2));
 }
}
function db(){return JSON.parse(fs.readFileSync(DB,'utf8'))}
function save(x){fs.writeFileSync(DB,JSON.stringify(x,null,2))}
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj))}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})})}
function auth(req){let c=req.headers.cookie||'', m=c.match(/sid=([^;]+)/);return m&&sessions.has(m[1])}
function sendFile(res,file){
 let ext=path.extname(file), types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
 res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(fs.readFileSync(file));
}
seed();

const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end()}
  const u=new URL(req.url,'http://localhost'); const p=u.pathname;
  if(p==='/api/login'&&req.method==='POST'){
   const x=await body(req), d=db(), h=crypto.createHash('sha256').update(String(x.password||'')).digest('hex');
   if(x.username!==d.settings.adminName||h!==d.settings.passwordHash)return json(res,401,{error:'بيانات الدخول غير صحيحة'});
   const sid=crypto.randomBytes(24).toString('hex');sessions.set(sid,{at:Date.now()});
   res.writeHead(200,{'Set-Cookie':`sid=${sid}; HttpOnly; SameSite=Lax; Path=/`,'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true}))
  }
  if(p==='/api/logout'&&req.method==='POST'){let m=(req.headers.cookie||'').match(/sid=([^;]+)/);if(m)sessions.delete(m[1]);res.writeHead(200,{'Set-Cookie':'sid=; Max-Age=0; Path=/'});return res.end('{}')}
  if(p==='/api/public/prices'&&req.method==='GET')return json(res,200,{prices:db().prices});
  if(p.startsWith('/api/') && !auth(req))return json(res,401,{error:'تسجيل الدخول مطلوب'});
  if(p==='/api/dashboard') {let d=db();return json(res,200,{customers:d.customers.length,bookings:d.bookings.length,pending:d.bookings.filter(x=>x.status==='جديد').length,completed:d.bookings.filter(x=>x.status==='مكتمل').length,sales:d.bookings.filter(x=>x.status==='مكتمل').reduce((a,x)=>a+Number(x.price||0),0)})}
  if(p==='/api/data'&&req.method==='GET')return json(res,200,db());
  if(p==='/api/settings'&&req.method==='PUT'){
   let x=await body(req),d=db(); if(x.adminName)d.settings.adminName=x.adminName;
   if(x.password)d.settings.passwordHash=crypto.createHash('sha256').update(String(x.password)).digest('hex');
   save(d);return json(res,200,{ok:true})
  }
  if(p==='/api/prices'&&req.method==='POST'){let x=await body(req),d=db();d.prices.push({id:Date.now(),name:x.name,price:Number(x.price)});save(d);return json(res,201,d.prices.at(-1))}
  if(p.startsWith('/api/prices/')&&req.method==='PUT'){let id=Number(p.split('/').pop()),x=await body(req),d=db(),v=d.prices.find(a=>a.id===id);if(!v)return json(res,404,{error:'غير موجود'});Object.assign(v,{name:x.name,price:Number(x.price)});save(d);return json(res,200,v)}
  if(p.startsWith('/api/prices/')&&req.method==='DELETE'){let id=Number(p.split('/').pop()),d=db();d.prices=d.prices.filter(x=>x.id!==id);save(d);return json(res,200,{ok:true})}
  if(p==='/api/bookings'&&req.method==='POST'){
   let x=await body(req),d=db(),customer=d.customers.find(c=>c.phone===x.phone);
   if(!customer){customer={id:d.next.customer++,name:x.name,phone:x.phone,address:x.address||''};d.customers.push(customer)}
   let b={id:d.next.booking++,customerId:customer.id,name:x.name,phone:x.phone,address:x.address||'',pest:x.pest,date:x.date,notes:x.notes||'',price:Number(x.price||0),status:'جديد',created:new Date().toISOString()};
   d.bookings.push(b);save(d);return json(res,201,b)
  }
  if(p.startsWith('/api/bookings/')&&req.method==='PUT'){let id=Number(p.split('/').pop()),x=await body(req),d=db(),b=d.bookings.find(a=>a.id===id);if(!b)return json(res,404,{error:'غير موجود'});Object.assign(b,x);save(d);return json(res,200,b)}
  if(p==='/api/reports'&&req.method==='POST'){let x=await body(req),d=db();let r={id:d.next.report++,bookingId:Number(x.bookingId),customer:x.customer,pest:x.pest,date:x.date,work:x.work,materials:x.materials,recommendations:x.recommendations,nextVisit:x.nextVisit||'',created:new Date().toISOString()};d.reports.push(r);let b=d.bookings.find(a=>a.id===r.bookingId);if(b)b.status='مكتمل';save(d);return json(res,201,r)}
  if(p==='/api/reports'&&req.method==='GET')return json(res,200,db().reports);
  if(p==='/api/customers'&&req.method==='GET')return json(res,200,db().customers);
  if(p.startsWith('/api/customers/')&&req.method==='DELETE'){let id=Number(p.split('/').pop()),d=db();d.customers=d.customers.filter(x=>x.id!==id);save(d);return json(res,200,{ok:true})}
  let file=p==='/'?path.join(publicDir,'index.html'):path.join(publicDir,p.replace(/^\/+/,''));
  if(file.startsWith(publicDir)&&fs.existsSync(file)&&fs.statSync(file).isFile())return sendFile(res,file);
  res.writeHead(404);res.end('Not found');
 }catch(e){console.error(e);json(res,500,{error:'خطأ في الخادم'})}
});
server.listen(PORT,()=>console.log(`SNIPER running on http://localhost:${PORT}`));
