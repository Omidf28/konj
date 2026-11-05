import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,copyFileSync,cpSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {spawn,execFileSync,type ChildProcess} from "node:child_process";
import {createServer} from "node:net";
import {DatabaseSync} from "node:sqlite";
import sharp from "sharp";
import {createHttpSnapshot} from "./http-snapshot.mts";
import {requireHttpFixture} from "../src/server/http-fixture.ts";
import {verifyBackup} from "../src/server/backup-integrity.ts";
const production=process.argv.includes("--production");
if(process.argv.slice(2).some(arg=>arg!=="--production")) throw Error("Recovery drill only accepts --production and never accepts a real source database.");
const project=fileURLToPath(new URL("..",import.meta.url));
const source=mkdtempSync(join(tmpdir(),"konj-http-"));
const restored=mkdtempSync(join(tmpdir(),"konj-http-"));
const id=randomBytes(16).toString("hex");
const code=createHttpSnapshot(project,id);
const config=join(code,".next","http-config",id);
mkdirSync(config,{recursive:true});
writeFileSync(join(config,"tsconfig.json"),JSON.stringify({extends:"../../../tsconfig.json",include:["../../../next-env.d.ts","../../../src/**/*.ts","../../../src/**/*.tsx","../../http-"+id+"/dev/types/**/*.ts"],exclude:["../../../node_modules","../../../storage"]}));
async function port(){const socket=createServer();await new Promise<void>((resolve,reject)=>{socket.once("error",reject);socket.listen(0,"127.0.0.1",resolve);});const address=socket.address();assert.ok(address&&typeof address!=="string");await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));return address.port;}
const sourceOrigin="http://127.0.0.1:"+await port();
function environment(root:string,origin:string):NodeJS.ProcessEnv{return {...process.env,NODE_ENV:"development",DATABASE_PATH:join(root,"fixture.sqlite"),UPLOAD_DIR:join(root,"uploads"),BACKUP_DIR:join(source,"backups"),APP_ORIGIN:origin,TEST_ORIGIN:origin,KONJ_HTTP_TEST_ID:id,KONJ_HTTP_FIXTURE_DIR:root,NEXT_TELEMETRY_DISABLED:"1"};}
const sourceEnv=environment(source,sourceOrigin);
requireHttpFixture(sourceEnv);
// Replace all storage configuration before importing any module that can open SQLite.
Object.assign(process.env,sourceEnv);
const {db,getProduct}=await import("../src/server/db.ts");
const {saveUpload}=await import("../src/server/uploads.ts");
const {hash,createSession,passwordHash}=await import("../src/server/security.ts");
const {createOrder,payTestOrder}=await import("../src/server/orders.ts");
const owner=hash(randomBytes(32).toString("hex"));
const original=await sharp({create:{width:240,height:240,channels:4,background:"#791b3d"}}).png().toBuffer();
const upload=await saveUpload(owner,original,await sharp(original).resize(80).png().toBuffer());
const adminId=randomUUID();
const adminPassword=randomBytes(32).toString("hex");
db().prepare("INSERT INTO admins VALUES(?,?,?,?)").run(adminId,"restore_review",passwordHash(adminPassword),Date.now());
const adminCookie="konj_session="+createSession(adminId);
const offer=getProduct("custom-tee-01")!;
const ready=getProduct("tee-offline")!;
const order=createOrder(owner,[
  {key:"custom",productId:offer.id,sku:offer.variants[0].sku,quantity:2,custom:{version:1,uploadId:upload.id,side:"front",widthCm:10,heightCm:10,xCm:1,yCm:2,rotation:0}},
  {key:"ready",productId:ready.id,sku:ready.variants[0].sku,quantity:1},
  {key:"pack",productId:"pack-internet",sku:"pack-internet-3",quantity:2},
],{name:"تست بازیابی مستقل",mobile:"09120000000",province:"تست",city:"آزمایشی",address:"نشانی کاملاً ساختگی برای بازیابی",postalCode:"1234567890",note:"ارسال نشود"},randomUUID());
payTestOrder(order.trackingToken);
const snapshot=String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(order.id)!.snapshot);
const inventory=db().prepare("SELECT sku,stock FROM variants ORDER BY sku").all();
const previewPath=String(db().prepare("SELECT preview_path FROM uploads WHERE id=?").get(upload.id)!.preview_path);
const preview=readFileSync(join(sourceEnv.UPLOAD_DIR!,previewPath));
let child:ChildProcess|undefined;
let output="";
function stop(){if(!child?.pid||child.exitCode!==null)return;if(process.platform==="win32"){execFileSync("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});}else child.kill("SIGTERM");child=undefined;}
async function start(env:NodeJS.ProcessEnv){
  output="";
  requireHttpFixture(env);
  child=spawn(process.execPath,["node_modules/next/dist/bin/next",production ? "start" : "dev","--hostname","127.0.0.1","--port",new URL(env.APP_ORIGIN!).port],{cwd:production ? project : code,env:{...env,NODE_ENV:production ? "production" : "development"},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const stream of [child.stdout,child.stderr])stream?.on("data",chunk=>{output=(output+String(chunk)).slice(-6000);});
  const fingerprint=requireHttpFixture(env).fingerprint;
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){if(child.exitCode!==null)throw Error("Drill server exited");try{const response=await fetch(env.APP_ORIGIN+"/api/health",{signal:AbortSignal.timeout(2000)});if(response.ok){const body=await response.json();if(production ? body.testInstance===undefined && body.checkout==="blocked-until-real-gateway" : body.testInstance===fingerprint)return;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  throw Error("Drill server readiness timed out");
}
async function verifyApp(origin:string){
  const request=(path:string,cookie="")=>fetch(origin+path,{headers:cookie?{cookie}:{},signal:AbortSignal.timeout(30000)});
  assert.equal((await request("/api/admin/data")).status,401);
  assert.equal((await request("/api/uploads/"+upload.id+"?original=1")).status,403);
  const full=await request("/api/admin/orders/"+order.id+"/production",adminCookie);
  assert.equal(full.status,200);assert.deepEqual((await full.json()).snapshot,JSON.parse(snapshot));
  for(const [query,expected] of [["?original=1",original],["",preview]] as const){const file=await request("/api/uploads/"+upload.id+query,adminCookie);assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),expected);}
  const tracking=await request("/api/orders/"+order.trackingToken);assert.equal(tracking.status,200);assert.equal((await tracking.json()).status,"paid");
  if(production){
    const login=await fetch(origin+"/api/admin/login",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify({username:"restore_review",password:adminPassword})});
    assert.equal(login.status,200);assert.match(login.headers.get("set-cookie")!,/; Secure/);
    const crossOrigin=await fetch(origin+"/api/admin/logout",{method:"POST",headers:{origin:"https://wrong-origin.invalid",cookie:adminCookie}});
    assert.equal(crossOrigin.status,403);
    for(const path of ["/api/orders", "/api/orders/"+order.trackingToken+"/pay"]){
      const blocked=await fetch(origin+path,{method:"POST",headers:{origin,cookie:adminCookie,"Content-Type":"application/json"},body:JSON.stringify({items:JSON.parse(snapshot).items,address:JSON.parse(snapshot).address,expectedTotalToman:JSON.parse(snapshot).totalToman,idempotencyKey:randomUUID()})});
      assert.equal(blocked.status,503,await blocked.clone().text());
    }
    const badSource=await fetch(origin+"/api/admin/login",{method:"POST",headers:{origin:"https://wrong-origin.invalid","Content-Type":"application/json"},body:"{}"});
    assert.equal(badSource.status,403);
  }
  const page=await request("/products/tee-offline");assert.equal(page.status,200);assert.ok((await page.text()).includes('dir="rtl"'));
}
const interrupt=()=>{try{stop();}finally{process.exit(130);}};
process.once("SIGINT",interrupt);process.once("SIGTERM",interrupt);
const started=Date.now();
try{
  console.log("Recovery drill: synthetic source only; code "+code);
  await start(sourceEnv);await verifyApp(sourceOrigin);
  const backupStarted=Date.now();
  execFileSync(process.execPath,["--experimental-strip-types",join(project,"scripts/backup.mts")],{cwd:project,env:sourceEnv,windowsHide:true,stdio:"pipe"});
  const folder=join(sourceEnv.BACKUP_DIR!,readdirSync(sourceEnv.BACKUP_DIR!)[0]);
  assert.equal((await verifyBackup(folder)).hashed,true);
  const backupMs=Date.now()-backupStarted;
  stop();
  const restoreStarted=Date.now();
  copyFileSync(join(folder,"konj.sqlite"),join(restored,"fixture.sqlite"));
  cpSync(join(folder,"uploads"),join(restored,"uploads"),{recursive:true,errorOnExist:true,force:false});
  const restoredEnv=environment(restored,"http://127.0.0.1:"+await port());
  await start(restoredEnv);await verifyApp(restoredEnv.APP_ORIGIN!);
  if(production){stop();await start(restoredEnv);await verifyApp(restoredEnv.APP_ORIGIN!);}
  const restoredDb=new DatabaseSync(restoredEnv.DATABASE_PATH!,{readOnly:true});
  try{
    assert.equal(restoredDb.prepare("PRAGMA integrity_check").get()!.integrity_check,"ok");
    assert.deepEqual(restoredDb.prepare("SELECT sku,stock FROM variants ORDER BY sku").all(),inventory);
    assert.equal(String(restoredDb.prepare("SELECT snapshot FROM orders WHERE id=?").get(order.id)!.snapshot),snapshot);
  }finally{restoredDb.close();}
  assert.deepEqual(db().prepare("SELECT sku,stock FROM variants ORDER BY sku").all(),inventory);
  assert.equal(String(db().prepare("SELECT snapshot FROM orders WHERE id=?").get(order.id)!.snapshot),snapshot);
  assert.deepEqual(readFileSync(join(sourceEnv.UPLOAD_DIR!,previewPath)),preview);
  const result={version:1,syntheticOnly:true,runtime:production?"production":"development",restartVerified:production,source,restored,backup:folder,backupMs,restoreAndBootAndVerifyMs:Date.now()-restoreStarted,totalMs:Date.now()-started,originalSha256:createHash("sha256").update(original).digest("hex"),checks:["SQLite integrity","stock preserved","order snapshot unchanged","authenticated export","exact original and preview","anonymous denied","tracking","RTL product page","source preserved",...(production?["Secure login cookie","cross-origin rejected","live checkout and test payment blocked","restart persistence"]:[])]};
  writeFileSync(join(restored,"recovery-result.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}catch(error){console.error(error instanceof Error?error.message:"Recovery drill failed");if(output)console.error(output);process.exitCode=1;}
finally{stop();db().close();process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);}
