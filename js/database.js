const DB_NAME="MobileRD_Master_DB";
const DB_VERSION=8;
const MANIFEST_STORE="file_manifests";
let fallbackVersionCounter=0;
const CHUNK_STORE="file_chunks";
const CHUNK_SIZE=4*1024*1024;
const FILE_STORE="files";
const LEGACY_FILE_STORE="heavy_files";
const LOG_STORE="audit";

function openDB(){
  return new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){ reject(new Error("IndexedDB is unavailable in this browser context")); return; }
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onblocked=()=>reject(new Error("IndexedDB upgrade is blocked by another open dashboard tab. Close other dashboard tabs and retry."));
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      const tx=e.target.transaction;
      if(!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      if(!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
      if(!db.objectStoreNames.contains(LOG_STORE)) db.createObjectStore(LOG_STORE,{keyPath:"id",autoIncrement:true});
      if(!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE);
      if(db.objectStoreNames.contains(LEGACY_FILE_STORE)){
        const oldStore=tx.objectStore(LEGACY_FILE_STORE),newStore=tx.objectStore(FILE_STORE);
        oldStore.openCursor().onsuccess=event=>{
          const cursor=event.target.result;
          if(!cursor)return;
          const value=cursor.value;
          if(value?.blob)newStore.put(value,cursor.primaryKey);
          else if(value instanceof Blob)newStore.put({blob:value,filename:String(cursor.primaryKey),size:value.size,type:value.type||"",updatedAt:new Date().toISOString()},cursor.primaryKey);
          cursor.continue();
        };
      }
    };
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>db.close();
      resolve(db);
    };
    req.onerror=()=>{
      const err=req.error||new Error("IndexedDB open failed");
      reject(err);
    };
  });
}

export async function saveFile(key,file,onProgress){
  if(!file) throw new Error("No file selected");
  const db=await openDB();
  const total=Math.max(1,Math.ceil(file.size/CHUNK_SIZE));
  const now=new Date().toISOString();
  const metadata={filename:file.name,size:file.size,type:file.type||"application/octet-stream",updatedAt:now,chunked:true,chunkCount:total,status:"complete"};
  try{
    // One logical file commit: old chunks are replaced and the final metadata is
    // written in the same IndexedDB transaction. If anything fails, IndexedDB
    // rolls the whole transaction back instead of leaving a partial upload.
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(fn,value)=>{if(settled)return;settled=true;fn(value)};
      const tx=db.transaction([FILE_STORE,CHUNK_STORE],"readwrite");
      const files=tx.objectStore(FILE_STORE);
      const chunks=tx.objectStore(CHUNK_STORE);
      const oldReq=files.get(key);
      oldReq.onerror=()=>finish(reject,oldReq.error||new Error("Existing file lookup failed"));
      oldReq.onsuccess=()=>{
        const old=oldReq.result;
        if(old?.chunked&&old.chunkCount){
          for(let i=0;i<old.chunkCount;i++) chunks.delete([key,i]);
        }
        files.put(metadata,key);
        for(let i=0;i<total;i++){
          const start=i*CHUNK_SIZE;
          const end=Math.min(file.size,start+CHUNK_SIZE);
          chunks.put(file.slice(start,end),[key,i]);
        }
        // Keep a lightweight progress indicator without opening one transaction per chunk.
        if(typeof onProgress==='function') onProgress(100,total,total);
      };
      tx.oncomplete=()=>finish(resolve);
      tx.onerror=()=>finish(reject,tx.error||new Error("IndexedDB file commit failed"));
      tx.onabort=()=>finish(reject,tx.error||new Error("IndexedDB file commit aborted"));
    });
    return metadata;
  }catch(err){
    const name=err?.name||"IndexedDBError";
    const message=err?.message||"The browser rejected the file transaction.";
    const wrapped=new Error(`${name}: ${message}`);
    wrapped.name=name;
    wrapped.cause=err;
    throw wrapped;
  }finally{try{db.close()}catch{}}
}

export async function listFileMetadata(){
  const db=await openDB();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor(),out=[];
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve(out);return}const r=cursor.value;if(r&&(r.status==="complete"||!r.status)){const {blob,...meta}=r;out.push({key:String(cursor.primaryKey),...meta})}cursor.continue()};
      req.onerror=()=>reject(req.error||new Error("File metadata lookup failed"));
      tx.onerror=()=>reject(tx.error||new Error("File metadata lookup failed"));
    });
  }finally{try{db.close()}catch{}}
}

export async function getFiles(keys=[]){
  const wanted=[...new Set((keys||[]).filter(Boolean))];
  if(!wanted.length)return new Map();
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(FILE_STORE,"readonly");
    const store=tx.objectStore(FILE_STORE);
    const out=new Map(); let settled=false;
    const fail=err=>{if(settled)return;settled=true;try{db.close()}catch{};reject(err||new Error("File lookup failed"))};
    tx.oncomplete=()=>{if(settled)return;settled=true;try{db.close()}catch{};resolve(out)};
    tx.onerror=()=>fail(tx.error); tx.onabort=()=>fail(tx.error||new Error("File lookup aborted"));
    for(const key of wanted){
      const req=store.get(key);
      req.onsuccess=()=>{const r=req.result;if(r&&(r.status==="complete"||!r.status))out.set(key,{...r,blob:r.chunked?null:r.blob})};
      req.onerror=()=>fail(req.error);
    }
  });
}

export async function getFile(key){
  const db=await openDB();
  try{
    const record=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(key);
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File lookup failed"));
      tx.onerror=()=>reject(tx.error||new Error("File lookup failed"));
    });
    if(!record||record.status==="writing")return null;
    if(!record.chunked)return record;
    const chunks=[];
    for(let i=0;i<record.chunkCount;i++){
      const chunk=await new Promise((resolve,reject)=>{
        const tx=db.transaction(CHUNK_STORE,"readonly"),req=tx.objectStore(CHUNK_STORE).get([key,i]);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File chunk lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("File chunk lookup failed"));
      });
      if(!chunk)throw new Error("Uploaded file is incomplete");
      chunks.push(chunk);
    }
    return {...record,blob:new Blob(chunks,{type:record.type||"application/octet-stream"})};
  }finally{db.close()}
}


export async function listFileVersionsForBases(baseKeys=[]){
  const wanted=[...new Set((baseKeys||[]).filter(Boolean).map(String))];
  const out=new Map(wanted.map(k=>[k,[]]));
  if(!wanted.length)return out;
  const db=await openDB();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve();return}const record=cursor.value;if(record&&(record.status==="complete"||!record.status)){const key=String(cursor.primaryKey),base=String(record.baseKey||key.split("::v::")[0]);if(out.has(base)){const {blob,...meta}=record;out.get(base).push({key,...meta})}}cursor.continue()};
      req.onerror=()=>reject(req.error||new Error("File version lookup failed"));
      tx.onerror=()=>reject(tx.error||new Error("File version lookup failed"));
    });
    for(const list of out.values())list.sort((a,b)=>String(a.updatedAt||"").localeCompare(String(b.updatedAt||"")));
    return out;
  }finally{try{db.close()}catch{}}
}

export async function listFileVersions(baseKey){
  const map=await listFileVersionsForBases([baseKey]);
  return map.get(String(baseKey))||[];
}

export async function resolveLatestFileMetadata(baseKey){
  const canonicalBase=String(baseKey||"");
  if(!canonicalBase)return null;
  const db=await openDB();
  try{
    let manifest=null;
    try{
      manifest=await new Promise((resolve,reject)=>{
        const tx=db.transaction(MANIFEST_STORE,"readonly"),req=tx.objectStore(MANIFEST_STORE).get(canonicalBase);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File manifest lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("File manifest lookup failed"));
      });
    }catch{}
    if(manifest?.latestKey){
      const record=await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(manifest.latestKey);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("Latest file lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("Latest file lookup failed"));
      });
      if(record && record.status!=="writing")return {key:String(manifest.latestKey),...record,versionCount:Number(manifest.versionCount||0),blob:undefined};
    }
    const versions=[];
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve();return}const record=cursor.value,key=String(cursor.primaryKey),base=String(record?.baseKey||key.split("::v::")[0]);if(record&&(record.status==="complete"||!record.status)&&base===canonicalBase)versions.push({key,record});cursor.continue()};
      req.onerror=()=>reject(req.error||new Error("File version lookup failed")); tx.onerror=()=>reject(tx.error||new Error("File version lookup failed"));
    });
    if(versions.length){
      versions.sort((a,b)=>String(a.record.updatedAt||"").localeCompare(String(b.record.updatedAt||""))||a.key.localeCompare(b.key));
      const latest=versions[versions.length-1];
      const repaired={baseKey:canonicalBase,latestKey:latest.key,versionCount:versions.length,updatedAt:latest.record.updatedAt||new Date().toISOString()};
      try{await new Promise((resolve,reject)=>{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).put(repaired,canonicalBase);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Manifest repair failed"));tx.onabort=()=>reject(tx.error||new Error("Manifest repair aborted"));});}catch{}
      return {key:latest.key,...latest.record,versionCount:versions.length,blob:undefined};
    }
    const direct=await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(canonicalBase);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("File lookup failed"));tx.onerror=()=>reject(tx.error||new Error("File lookup failed"));});
    if(direct&&direct.status!=="writing")return {key:canonicalBase,...direct,versionCount:1,blob:undefined};
    return null;
  }finally{try{db.close()}catch{}}
}

export async function resolveLatestFile(baseKey){
  const canonicalBase=String(baseKey||"");
  if(!canonicalBase)return null;
  const db=await openDB();
  try{
    let manifest=null;
    try{
      manifest=await new Promise((resolve,reject)=>{
        const tx=db.transaction(MANIFEST_STORE,"readonly"),req=tx.objectStore(MANIFEST_STORE).get(canonicalBase);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File manifest lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("File manifest lookup failed"));
      });
    }catch(err){ manifest=null; }
    if(manifest?.latestKey){
      const record=await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(manifest.latestKey);
        req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("Latest file lookup failed"));
        tx.onerror=()=>reject(tx.error||new Error("Latest file lookup failed"));
      });
      if(record && record.status!=="writing"){const hydrated=await hydrateFileRecord(db,manifest.latestKey,record);return {...hydrated,versionCount:Number(manifest.versionCount||1)};}
    }
    const versions=[];
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor();
      req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve();return}const record=cursor.value;const key=String(cursor.primaryKey);const base=String(record?.baseKey||key.split("::v::")[0]);if(record&&(record.status==="complete"||!record.status)&&base===canonicalBase)versions.push({key,record});cursor.continue()};
      req.onerror=()=>reject(req.error||new Error("File version lookup failed")); tx.onerror=()=>reject(tx.error||new Error("File version lookup failed"));
    });
    if(versions.length){
      versions.sort((a,b)=>String(a.record.updatedAt||"").localeCompare(String(b.record.updatedAt||""))||a.key.localeCompare(b.key));
      const latest=versions[versions.length-1];
      const manifest={baseKey:canonicalBase,latestKey:latest.key,versionCount:versions.length,updatedAt:latest.record.updatedAt||new Date().toISOString()};
      try{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).put(manifest,canonicalBase);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Manifest repair failed"));tx.onabort=()=>reject(tx.error||new Error("Manifest repair aborted"));});}catch{}
      return {...await hydrateFileRecord(db,latest.key,latest.record),versionCount:versions.length};
    }
    const direct=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(canonicalBase);
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error||new Error("File lookup failed")); tx.onerror=()=>reject(tx.error||new Error("File lookup failed"));
    });
    if(direct && direct.status!=="writing")return {...await hydrateFileRecord(db,canonicalBase,direct),versionCount:1};
    return null;
  }finally{try{db.close()}catch{}}
}

async function hydrateFileRecord(db,key,record){
  if(!record.chunked){
    const blob=record.blob||null;
    if(blob&&Number.isFinite(Number(record.size))&&blob.size!==Number(record.size))throw new Error(`Stored file size mismatch: metadata=${record.size}, binary=${blob.size}`);
    return {...record,key,blob};
  }
  const count=Number(record.chunkCount||0);
  if(!count)throw new Error("Stored file has no chunks");
  const chunks=await new Promise((resolve,reject)=>{
    const tx=db.transaction(CHUNK_STORE,"readonly"),store=tx.objectStore(CHUNK_STORE),out=new Array(count);
    let failed=false;
    const fail=err=>{if(failed)return;failed=true;reject(err||new Error("File chunk lookup failed"));};
    for(let i=0;i<count;i++){
      const req=store.get([key,i]);
      req.onsuccess=()=>{
        if(!req.result)fail(new Error(`Uploaded file is incomplete: missing chunk ${i+1}/${count}`));
        else out[i]=req.result;
      };
      req.onerror=()=>fail(req.error||new Error(`File chunk lookup failed at ${i+1}/${count}`));
    }
    tx.oncomplete=()=>{if(!failed)resolve(out)};
    tx.onerror=()=>fail(tx.error||new Error("File chunk lookup failed"));
    tx.onabort=()=>fail(tx.error||new Error("File chunk lookup aborted"));
  });
  const total=chunks.reduce((sum,chunk)=>sum+Number(chunk?.size||0),0);
  if(Number.isFinite(Number(record.size))&&total!==Number(record.size))throw new Error(`Stored file is corrupt or incomplete: expected ${record.size} bytes, reconstructed ${total} bytes`);
  return {...record,key,blob:new Blob(chunks,{type:record.type||"application/octet-stream"})};
}

export async function saveFileVersion(baseKey,file,options={},onProgress){
  const canonicalBase=String(baseKey||"").trim();
  if(!canonicalBase)throw new Error("A canonical document key is required");
  if(!file)throw new Error("No file selected");
  const suffix=Date.now().toString(36)+"-"+(globalThis.crypto?.randomUUID?.()||`fallback-${Date.now().toString(36)}-${++fallbackVersionCounter}`);
  const versionKey=`${canonicalBase}::v::${suffix}`;
  const total=Math.max(1,Math.ceil(file.size/CHUNK_SIZE));
  const now=new Date().toISOString();
  const record={filename:file.name,size:file.size,type:file.type||"application/octet-stream",updatedAt:now,chunked:true,chunkCount:total,status:"complete",baseKey:canonicalBase,versionLabel:String(options.revision||"").trim()||`Version ${now.replace(/[-:TZ.]/g,"").slice(0,14)}`,note:String(options.note||"").trim()};
  const db=await openDB();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([FILE_STORE,CHUNK_STORE,MANIFEST_STORE],"readwrite");
      tx.objectStore(FILE_STORE).put(record,versionKey);
      const chunks=tx.objectStore(CHUNK_STORE);
      for(let i=0;i<total;i++){const start=i*CHUNK_SIZE,end=Math.min(file.size,start+CHUNK_SIZE);chunks.put(file.slice(start,end),[versionKey,i]);}
      const manifests=tx.objectStore(MANIFEST_STORE),req=manifests.get(canonicalBase);
      req.onsuccess=()=>{const prior=req.result||{};manifests.put({baseKey:canonicalBase,latestKey:versionKey,versionCount:Number(prior.versionCount||0)+1,updatedAt:now},canonicalBase)};
      req.onerror=()=>manifests.put({baseKey:canonicalBase,latestKey:versionKey,versionCount:1,updatedAt:now},canonicalBase);
      if(typeof onProgress==='function')onProgress(100,total,total);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Version commit failed"));tx.onabort=()=>reject(tx.error||new Error("Version commit aborted"));
    });
    return {key:versionKey,record};
  }finally{try{db.close()}catch{}}
}

export async function getLatestFile(baseKey){ return resolveLatestFile(baseKey); }


export async function deleteAllFiles(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const stores=[FILE_STORE,CHUNK_STORE,MANIFEST_STORE];
    if(db.objectStoreNames.contains(LEGACY_FILE_STORE))stores.push(LEGACY_FILE_STORE);
    const tx=db.transaction(stores,"readwrite");
    tx.objectStore(FILE_STORE).clear();
    tx.objectStore(CHUNK_STORE).clear();
    if(stores.includes(LEGACY_FILE_STORE))tx.objectStore(LEGACY_FILE_STORE).clear();
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("File reset failed"))};
  });
}

export async function addAudit(action,details={}){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readwrite");
    tx.objectStore(LOG_STORE).add({action,details,at:new Date().toISOString()});
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit write failed"))};
  });
}

export async function getAuditLogs(limit=100){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readonly"),req=tx.objectStore(LOG_STORE).getAll();
    req.onsuccess=()=>resolve(req.result.reverse().slice(0,limit));
    req.onerror=()=>reject(req.error||new Error("Audit lookup failed"));
    tx.oncomplete=()=>db.close();
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit lookup failed"))};
  });
}

export async function deleteAuditLogs(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOG_STORE,"readwrite");
    tx.objectStore(LOG_STORE).clear();
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||new Error("Audit reset failed"))};
    tx.onabort=()=>{db.close();reject(tx.error||new Error("Audit reset aborted"))};
  });
}

export async function migrateFilePrefix(oldPrefix,newPrefix){
  if(!oldPrefix||!newPrefix||oldPrefix===newPrefix)return;
  const db=await openDB();
  try{
    const keys=await new Promise((resolve,reject)=>{
      const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).getAllKeys();
      req.onsuccess=()=>resolve((req.result||[]).filter(k=>typeof k==="string"&&(k===oldPrefix||k.startsWith(oldPrefix+"_")||k.startsWith(oldPrefix+"::v::"))));
      req.onerror=()=>reject(req.error||new Error("File key lookup failed"));
    });
    const affectedBases=new Set();
    for(const oldKey of keys){
      const newKey=oldKey===oldPrefix?newPrefix:oldKey.startsWith(oldPrefix+"::v::")?newPrefix+oldKey.slice(oldPrefix.length):newPrefix+oldKey.slice(oldPrefix.length);
      const record=await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(oldKey);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("File metadata read failed"));});
      if(record){
        const oldBase=String(record.baseKey||String(oldKey).split("::v::")[0]);
        const newBase=oldBase===oldPrefix?newPrefix:oldBase.startsWith(oldPrefix+"_")?newPrefix+oldBase.slice(oldPrefix.length):oldBase.startsWith(oldPrefix+"::v::")?newPrefix+oldBase.slice(oldPrefix.length):oldBase;
        record.baseKey=newBase;affectedBases.add(oldBase);affectedBases.add(newBase);
        await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readwrite"),store=tx.objectStore(FILE_STORE);store.put(record,newKey);store.delete(oldKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("File key migration failed"));tx.onabort=()=>reject(tx.error||new Error("File key migration aborted"));});
        for(let i=0;i<Number(record.chunkCount||0);i++){
          const chunk=await new Promise((resolve,reject)=>{const tx=db.transaction(CHUNK_STORE,"readonly"),req=tx.objectStore(CHUNK_STORE).get([oldKey,i]);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("File chunk read failed"));});
          if(chunk)await new Promise((resolve,reject)=>{const tx=db.transaction(CHUNK_STORE,"readwrite"),store=tx.objectStore(CHUNK_STORE);store.put(chunk,[newKey,i]);store.delete([oldKey,i]);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("File chunk migration failed"));});
        }
      }
    }
    for(const oldBase of affectedBases){
      await new Promise((resolve,reject)=>{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).delete(oldBase);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Old manifest cleanup failed"));});
    }
    const bases=[...affectedBases].filter(b=>b===newPrefix||b.startsWith(newPrefix+"_")||b.startsWith(newPrefix+"::v::"));
    for(const base of bases){
      const versions=[];
      await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor();req.onsuccess=()=>{const c=req.result;if(!c){resolve();return}const r=c.value,k=String(c.primaryKey),b=String(r?.baseKey||k.split("::v::")[0]);if(r&&(r.status==="complete"||!r.status)&&b===base)versions.push({key:k,record:r});c.continue()};req.onerror=()=>reject(req.error||new Error("Manifest rebuild lookup failed"));});
      if(versions.length){versions.sort((a,b)=>String(a.record.updatedAt||"").localeCompare(String(b.record.updatedAt||""))||a.key.localeCompare(b.key));const latest=versions[versions.length-1];await new Promise((resolve,reject)=>{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).put({baseKey:base,latestKey:latest.key,versionCount:versions.length,updatedAt:latest.record.updatedAt||new Date().toISOString()},base);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Manifest rebuild failed"));});}
    }
  }finally{db.close()}
}

export async function deleteFilePrefix(prefix){
  if(!prefix)return;
  const db=await openDB();
  try{
    const keys=await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).getAllKeys();req.onsuccess=()=>resolve((req.result||[]).filter(k=>typeof k==="string"&&(k===prefix||k.startsWith(prefix+"_")||k.startsWith(prefix+"::v::"))));req.onerror=()=>reject(req.error||new Error("File key lookup failed"));});
    const bases=new Set();
    for(const key of keys){
      const record=await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error("File metadata read failed"));});
      const base=String(record?.baseKey||String(key).split("::v::")[0]);bases.add(base);
      await new Promise((resolve,reject)=>{const tx=db.transaction([FILE_STORE,CHUNK_STORE],"readwrite");tx.objectStore(FILE_STORE).delete(key);for(let i=0;i<Number(record?.chunkCount||0);i++)tx.objectStore(CHUNK_STORE).delete([key,i]);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("File deletion failed"));});
    }
    for(const base of bases){
      await new Promise((resolve,reject)=>{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).delete(base);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Manifest deletion failed"));});
      const remaining=[];
      await new Promise((resolve,reject)=>{const tx=db.transaction(FILE_STORE,"readonly"),req=tx.objectStore(FILE_STORE).openCursor();req.onsuccess=()=>{const c=req.result;if(!c){resolve();return}const r=c.value,k=String(c.primaryKey),b=String(r?.baseKey||k.split("::v::")[0]);if(r&&(r.status==="complete"||!r.status)&&b===base)remaining.push({key:k,record:r});c.continue()};req.onerror=()=>reject(req.error||new Error("Remaining file lookup failed"));});
      if(remaining.length){remaining.sort((a,b)=>String(a.record.updatedAt||"").localeCompare(String(b.record.updatedAt||""))||a.key.localeCompare(b.key));const latest=remaining[remaining.length-1];await new Promise((resolve,reject)=>{const tx=db.transaction(MANIFEST_STORE,"readwrite");tx.objectStore(MANIFEST_STORE).put({baseKey:base,latestKey:latest.key,versionCount:remaining.length,updatedAt:latest.record.updatedAt||new Date().toISOString()},base);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Manifest rebuild failed"));});}
    }
  }finally{db.close()}
}

