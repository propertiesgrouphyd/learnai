
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const ROOT=process.cwd();
const SOURCE=path.join(ROOT,"data");
const OUTPUT=path.join(ROOT,"dist","data");
const KEY=process.env.AIVIDHYA_DATA_KEY;
const ALGORITHM="aes-256-gcm";
const IV_LENGTH=12;
const TAG_LENGTH=16;
const KEY_LENGTH=32;

function getKey(){
if(typeof KEY!=="string"||!KEY.trim())throw Error("AIVIDHYA_DATA_KEY secret is missing.");
const k=Buffer.from(KEY.trim(),"base64");
if(k.length!==KEY_LENGTH||k.toString("base64")!==KEY.trim())throw Error("AIVIDHYA_DATA_KEY must be valid Base64 encoding of exactly 32 bytes.");
return k;
}

function encrypt(buffer,key){
const compressed=zlib.gzipSync(buffer,{level:9});
const iv=crypto.randomBytes(IV_LENGTH);
const cipher=crypto.createCipheriv(ALGORITHM,key,iv);
const encrypted=Buffer.concat([cipher.update(compressed),cipher.final()]);
const tag=cipher.getAuthTag();
if(tag.length!==TAG_LENGTH)throw Error("Invalid AES-GCM authentication tag.");
return Buffer.concat([iv,tag,encrypted]);
}

function readJSON(file){
const source=fs.readFileSync(path.join(SOURCE,file),"utf8");
let parsed;
try{parsed=JSON.parse(source);}catch(e){throw Error(`Invalid JSON ${file}: ${e.message}`);}
if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error(`${file} must contain a JSON object.`);
return{source,parsed};
}

function validateLesson(file,parsed){
const match=/^day-(\d{3})\.json$/i.exec(file);
if(!match)throw Error(`Invalid lesson filename: ${file}`);
if(parsed.day!==undefined&&Number(parsed.day)!==Number(match[1]))throw Error(`${file}: day number mismatch.`);
if(typeof parsed.title!=="string"||!parsed.title.trim())throw Error(`${file}: lesson title missing.`);
}

function protect(file,key){
const{source,parsed}=readJSON(file);
if(file!=="credentials.json")validateLesson(file,parsed);
const output=file.replace(/\.json$/i,".dat");
const encrypted=encrypt(Buffer.from(source,"utf8"),key);
fs.writeFileSync(path.join(OUTPUT,output),encrypted);
console.log(`Protected: ${file} -> ${output}`);
return encrypted.length;
}

function validateCredentials(){
const{parsed}=readJSON("credentials.json");
if(!Array.isArray(parsed.users)||!parsed.users.length)throw Error("credentials.json must contain a non-empty users array.");
parsed.users.forEach((u,i)=>{
if(!u||typeof u.username!=="string"||!u.username.trim()||typeof u.password!=="string"||!u.password)throw Error(`Invalid username/password at credentials.users[${i}].`);
if(u.active!==undefined&&typeof u.active!=="boolean")throw Error(`Invalid active flag at credentials.users[${i}].`);
});
}

function main(){
console.log("========================================");
console.log(" VIDHWAAN AIVIDHYA DATA PROTECTION");
console.log("========================================");
const key=getKey();
if(!fs.existsSync(SOURCE))throw Error(`Missing source directory: ${SOURCE}`);
const lessons=fs.readdirSync(SOURCE).filter(f=>/^day-\d{3}\.json$/i.test(f)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
if(!lessons.length)throw Error("No day-XXX.json files found in data/.");
validateCredentials();
fs.rmSync(OUTPUT,{recursive:true,force:true});
fs.mkdirSync(OUTPUT,{recursive:true});
let bytes=0;
for(const file of lessons)bytes+=protect(file,key);
bytes+=protect("credentials.json",key);
const outputs=fs.readdirSync(OUTPUT);
const dat=outputs.filter(f=>/\.dat$/i.test(f));
const json=outputs.filter(f=>/\.json$/i.test(f));
if(dat.length!==lessons.length+1)throw Error(`Expected ${lessons.length+1} DAT files, found ${dat.length}.`);
if(json.length)throw Error(`Plain JSON found in dist/data: ${json.join(", ")}`);
if(!dat.includes("credentials.dat"))throw Error("credentials.dat missing.");
for(const f of lessons){const out=f.replace(/\.json$/i,".dat");if(!dat.includes(out))throw Error(`Missing ${out}`);}
console.log("----------------------------------------");
console.log(`Lessons protected : ${lessons.length}`);
console.log("Credentials      : credentials.dat");
console.log(`Total DAT files  : ${dat.length}`);
console.log(`Total output     : ${bytes} bytes`);
console.log("Encryption       : AES-256-GCM");
console.log("Compression      : gzip level 9");
console.log("Protection       : PASSED");
console.log("========================================");
}

try{main();}catch(e){console.error("\nPROTECTION FAILED\n"+e.message+"\n");process.exit(1);}
