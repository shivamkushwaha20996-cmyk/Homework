/* Mobile R&D Technical Hub — Excel comparison worker.
   The worker isolates SheetJS parsing and parameter matching from the dashboard UI.
*/
const XLSX_URL="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const STATUS=Object.freeze({SAME:"Same",NEW:"New Parameter",DELETED:"Deleted Parameter",CHANGED:"Changed",REVIEW:"Review"});

function norm(v=""){return String(v??"").toLowerCase().replace(/[\u00a0\r\n\t]+/g," ").replace(/[_/\\|:;,.()[\]{}]+/g," ").replace(/[-–—]+/g," ").replace(/\s+/g," ").trim()}
function compact(v=""){return norm(v).replace(/\s+/g,"")}
function clean(v){return v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v).trim()}
function number(v){const s=String(v??"").replace(/,/g,"").trim();if(!s||["-","—","–","n/a","na","not applicable"].includes(s.toLowerCase()))return null;const m=s.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/);return m?Number(m[0]):null}
function headerMatch(v,words){const n=norm(v);return words.some(w=>n===w||n.includes(w))}
function tokens(v=""){return new Set(norm(v).split(" ").filter(Boolean).filter(x=>!new Set(["the","of","and","for","with","in","to","a","an","value","spec","specification","parameter"]).has(x)))}

function similarity(a,b){
  const aa=norm(a),bb=norm(b);
  if(!aa||!bb)return 0;
  if(aa===bb)return 1;
  if(compact(a)===compact(b))return .99;
  const A=tokens(a),B=tokens(b),inter=[...A].filter(x=>B.has(x)).length,union=new Set([...A,...B]).size;
  const j=union?inter/union:0,max=Math.max(aa.length,bb.length);
  let prev=Array.from({length:bb.length+1},(_,i)=>i);
  for(let i=1;i<=aa.length;i++){
    const cur=[i];
    for(let j2=1;j2<=bb.length;j2++)cur[j2]=Math.min(cur[j2-1]+1,prev[j2]+1,prev[j2-1]+(aa[i-1]===bb[j2-1]?0:1));
    prev=cur;
  }
  const lev=max?1-prev[bb.length]/max:0;
  return Math.max(0,Math.min(1,.62*lev+.28*j+.10*Math.min(1,Math.min(aa.length,bb.length)/max)));
}

function findLimitHeaders(rows){
  let testRow=-1,lowerRow=-1,upperRow=-1;
  for(let r=0;r<rows.length;r++){
    const a=norm(rows[r]?.[0]),c=norm(rows[r]?.[2]),d=norm(rows[r]?.[3]);
    if(testRow<0&&headerMatch(a,["test item","test items","test condition"]))testRow=r;
    if(lowerRow<0&&headerMatch(c,["lower limit","lsl"]))lowerRow=r;
    if(upperRow<0&&headerMatch(d,["upper limit","usl"]))upperRow=r;
    if(testRow>=0&&lowerRow>=0&&upperRow>=0)break;
  }
  if(testRow<0||lowerRow<0||upperRow<0)return null;
  if(Math.max(testRow,lowerRow,upperRow)-Math.min(testRow,lowerRow,upperRow)>3)return null;
  return {start:Math.max(testRow,lowerRow,upperRow)};
}

function parseWorkbook(workbook,label){
  const records=[];
  for(const sheetName of workbook.SheetNames){
    const sheet=workbook.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
    if(!rows.length)continue;
    const layout=findLimitHeaders(rows);
    if(layout){
      let order=0;
      for(let r=layout.start+1;r<rows.length;r++){
        const row=rows[r]||[],a=norm(row[0]),c=clean(row[2]),d=clean(row[3]);
        if(headerMatch(a,["test item","test items","test condition"])&&headerMatch(c,["lower limit","lsl"])&&headerMatch(d,["upper limit","usl"]))continue;
        const parameter=clean(row[0]),lsl=c,usl=d;
        if(!parameter||(number(lsl)===null&&number(usl)===null))continue;
        records.push({id:`${sheetName}:${r}`,sheet:sheetName,row:r+1,order:order++,parameter,lsl,usl,category:sheetName,key:norm(parameter)});
      }
      continue;
    }
    const headers=(rows[0]||[]).map(clean);let p=-1;
    headers.forEach((h,i)=>{if(p<0&&/^(parameter|param|test item|test items|test condition|item|feature|attribute|spec name|specification)$/i.test(norm(h)))p=i});
    if(p<0)p=0;
    for(let r=1;r<rows.length;r++){
      const row=rows[r]||[],parameter=clean(row[p]);
      if(!parameter)continue;
      const spec=clean(row[p+1]);
      records.push({id:`${sheetName}:${r}`,sheet:sheetName,row:r+1,order:r,parameter,lsl:"",usl:spec,category:sheetName,key:norm(parameter)});
    }
  }
  return records;
}

/* Build a bounded candidate index. This replaces the previous all-vs-all
   fuzzy scan, which could become quadratic on large engineering workbooks. */
function buildIndex(baseRecords){
  const exact=new Map(),tokenIndex=new Map();
  baseRecords.forEach(b=>{
    if(!exact.has(b.key))exact.set(b.key,[]);
    exact.get(b.key).push(b);
    for(const token of tokens(b.parameter)){
      let set=tokenIndex.get(token);
      if(!set){set=new Set();tokenIndex.set(token,set)}
      set.add(b.id);
    }
  });
  return {exact,tokenIndex};
}
function chooseMatch(upcoming,baseRecords,used,index){
  const exact=index.exact.get(upcoming.key)||[];
  const exactAvailable=exact.find(b=>!used.has(b.id)&&b.sheet===upcoming.sheet)||exact.find(b=>!used.has(b.id));
  if(exactAvailable)return {record:exactAvailable,confidence:exactAvailable.sheet===upcoming.sheet?100:96,kind:exactAvailable.sheet===upcoming.sheet?"exact":"exact-cross-sheet"};

  const candidateIds=new Set();
  for(const token of tokens(upcoming.parameter)){
    const ids=index.tokenIndex.get(token);
    if(ids)for(const id of ids)if(!used.has(id))candidateIds.add(id);
  }
  let candidates=[...candidateIds].map(id=>baseRecords.find(b=>b.id===id)).filter(Boolean);

  /* Keep the fuzzy workload bounded. Prefer same-sheet/category candidates. */
  if(candidates.length>250){
    candidates=candidates.filter(b=>b.category===upcoming.category);
    if(candidates.length>250)candidates=candidates.slice(0,250);
  }
  if(!candidates.length)return null;

  const scored=candidates.map(b=>({record:b,score:similarity(upcoming.parameter,b.parameter)+(b.sheet===upcoming.sheet?0.035:0)})).sort((a,b)=>b.score-a.score);
  const top=scored[0],second=scored[1]?.score||0,confidence=Math.round(top.score*100),margin=top.score-second;
  if(top.score>=.90&&margin>=.05)return {record:top.record,confidence,kind:"similar"};
  if(top.score>=.70)return {record:top.record,confidence,kind:"review"};
  return null;
}
function diffValue(up,base){
  if(!up&&!base)return {value:"",changed:false};
  if(up!==""&&base!==""&&number(up)!==null&&number(base)!==null){
    const d=number(up)-number(base);
    return {value:Number.isInteger(d)?String(d):d.toFixed(4).replace(/0+$/,"").replace(/\.$/,""),changed:d!==0};
  }
  return {value:up===base?"":(up||base?`${base||""} → ${up||""}`:""),changed:up!==base};
}
function remarkFor(up,base,upLSL,baseLSL,upUSL,baseUSL,matchKind){
  if(!base)return STATUS.NEW;
  if(!up)return STATUS.DELETED;
  if(matchKind==="review")return STATUS.REVIEW;
  const nl=number(upLSL),bl=number(baseLSL),nu=number(upUSL),bu=number(baseUSL),parts=[];
  if(nl!==null&&bl!==null&&nl!==bl)parts.push(nl<bl?"LSL Wide":"LSL Tight");
  else if(norm(upLSL)!==norm(baseLSL))parts.push("Review");
  if(nu!==null&&bu!==null&&nu!==bu)parts.push(nu>bu?"USL Wide":"USL Tight");
  else if(norm(upUSL)!==norm(baseUSL))parts.push("Review");
  if(!parts.length)return STATUS.SAME;
  return parts.includes("Review")?STATUS.REVIEW:parts.join(", ");
}
function compareRecords(baseRecords,upcomingRecords){
  const used=new Set(),rows=[],index=buildIndex(baseRecords);
  for(const u of upcomingRecords){
    const m=chooseMatch(u,baseRecords,used,index);
    if(!m){
      const unmatchedRemark=baseRecords.some(b=>!used.has(b.id))?STATUS.REVIEW:STATUS.NEW;
      rows.push({upcomingParameter:u.parameter,upcomingLSL:u.lsl,upcomingUSL:u.usl,baseParameter:"",baseLSL:"",baseUSL:"",lslDiff:"",uslDiff:"",remark:unmatchedRemark,confidence:0,upcomingSheet:u.sheet,baseSheet:"",upcomingRow:u.row,baseRow:"",order:u.order,category:u.category,matchKind:unmatchedRemark===STATUS.REVIEW?"unmatched":"new"});
      continue;
    }
    used.add(m.record.id);
    const l=diffValue(u.lsl,m.record.lsl),us=diffValue(u.usl,m.record.usl);
    rows.push({upcomingParameter:u.parameter,upcomingLSL:u.lsl,upcomingUSL:u.usl,baseParameter:m.record.parameter,baseLSL:m.record.lsl,baseUSL:m.record.usl,lslDiff:l.value,uslDiff:us.value,remark:remarkFor(true,true,u.lsl,m.record.lsl,u.usl,m.record.usl,m.kind),confidence:m.confidence,upcomingSheet:u.sheet,baseSheet:m.record.sheet,upcomingRow:u.row,baseRow:m.record.row,order:u.order,category:u.category,matchKind:m.kind});
  }
  for(const b of baseRecords){
    if(used.has(b.id))continue;
    const relatedIndex=rows.findIndex(r=>r.category===b.category);
    const insertAt=relatedIndex<0?rows.length:relatedIndex+1;
    rows.splice(insertAt,0,{upcomingParameter:"",upcomingLSL:"",upcomingUSL:"",baseParameter:b.parameter,baseLSL:b.lsl,baseUSL:b.usl,lslDiff:"",uslDiff:"",remark:STATUS.DELETED,confidence:0,upcomingSheet:"",baseSheet:b.sheet,upcomingRow:"",baseRow:b.row,order:relatedIndex<0?Number.MAX_SAFE_INTEGER:(rows[relatedIndex]?.order??Number.MAX_SAFE_INTEGER)+.01,category:b.category,matchKind:"deleted"});
  }
  return rows;
}
function summarize(rows){
  return {total:rows.length,same:rows.filter(r=>r.remark===STATUS.SAME).length,newCount:rows.filter(r=>r.remark===STATUS.NEW).length,deleted:rows.filter(r=>r.remark===STATUS.DELETED).length,changed:rows.filter(r=>/^LSL |^USL |,/.test(r.remark)).length,review:rows.filter(r=>r.remark===STATUS.REVIEW).length};
}
function parseErrorMessage(err,label){
  const raw=String(err?.message||err||"Unknown Excel parser error").trim();
  return `${label} could not be parsed. ${raw}. Make sure the file is a valid, unencrypted XLS/XLSX/CSV workbook.`;
}
self.onmessage=async event=>{
  const msg=event.data||{};
  try{
    if(!self.XLSX)importScripts(XLSX_URL);
    if(!self.XLSX)throw new Error("Excel parser did not initialize.");
    const baseBuf=msg.baseBuffer,upBuf=msg.upcomingBuffer;
    if(!(baseBuf instanceof ArrayBuffer)||!(upBuf instanceof ArrayBuffer))throw new Error("Workbook data was not received correctly.");
    postMessage({type:"status",percent:10,message:"Parsing Base Model workbook…"});
    let baseWb,upWb;
    try{baseWb=XLSX.read(new Uint8Array(baseBuf),{type:"array",cellDates:false,raw:false,WTF:false});}
    catch(err){throw new Error(parseErrorMessage(err,"Base Model workbook"))}
    postMessage({type:"status",percent:28,message:"Parsing Upcoming Model workbook…"});
    try{upWb=XLSX.read(new Uint8Array(upBuf),{type:"array",cellDates:false,raw:false,WTF:false});}
    catch(err){throw new Error(parseErrorMessage(err,"Upcoming Model workbook"))}
    postMessage({type:"status",percent:48,message:"Reading parameter rows…"});
    const baseRows=parseWorkbook(baseWb,"Base Model"),upRows=parseWorkbook(upWb,"Upcoming Model");
    if(!baseRows.length||!upRows.length)throw new Error("No parameter rows were detected. Check Test Item or Test Condition / Lower Limit / Upper Limit placement in Column A / C / D.");
    postMessage({type:"status",percent:60,message:`Comparing ${upRows.length.toLocaleString()} upcoming parameters with ${baseRows.length.toLocaleString()} base parameters…`});
    const rows=compareRecords(baseRows,upRows);
    postMessage({type:"status",percent:92,message:"Finalizing comparison results…"});
    postMessage({type:"complete",baseRows,upRows,rows});
  }catch(err){
    postMessage({type:"error",message:String(err?.message||err||"Excel comparison failed.")});
  }
};
