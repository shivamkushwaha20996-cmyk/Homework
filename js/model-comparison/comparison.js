import {MODEL_ORDER} from '../../data/models.js';
import {isModuleEnabled} from '../modules/module-manager.js';

const XLSX_URL="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const STATUS=Object.freeze({SAME:"Same",NEW:"New Parameter",DELETED:"Deleted Parameter",CHANGED:"Changed",REVIEW:"Review"});
const OUTPUT_HEADERS=["S.No.","Upcoming Model Parameter","Upcoming LSL","Upcoming USL","Base Model Parameter","Base LSL","Base USL","LSL Difference","USL Difference","Remark"];

let baseFile=null,upcomingFile=null,comparisonResult=null,xlsxPromise=null,comparisonWorker=null;
const els={};
function setProgress(percent,label,visible=true){
  const p=Math.max(0,Math.min(100,Number(percent)||0));
  els.mcProgressWrap?.classList.toggle("hidden",!visible);
  if(els.mcProgressBar)els.mcProgressBar.style.width=`${p}%`;
  if(els.mcProgressPercent)els.mcProgressPercent.textContent=`${Math.round(p)}%`;
  if(els.mcProgressLabel)els.mcProgressLabel.textContent=label||"Processing…";
}
const qs=id=>document.getElementById(id);

function comparisonModelList(){
  try{
    const d=JSON.parse(localStorage.getItem('MOBILE_RND_DB_DATA_V10')||'null');
    if(d&&typeof d==='object')return Object.keys(d);
  }catch{}
  return MODEL_ORDER;
}
function esc(v=""){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function norm(v=""){return String(v??"").toLowerCase().replace(/[\u00a0\r\n\t]+/g," ").replace(/[_/\\|:;,.()[\]{}]+/g," ").replace(/[-–—]+/g," ").replace(/\s+/g," ").trim()}
function formatBytes(bytes){if(!bytes)return "0 B";const u=["B","KB","MB","GB"],i=Math.min(u.length-1,Math.floor(Math.log(bytes)/Math.log(1024)));return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`}
function loadXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(xlsxPromise)return xlsxPromise;
  xlsxPromise=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=XLSX_URL;
    s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error("Excel export library failed to initialize."));
    s.onerror=()=>reject(new Error("Could not load the Excel export library. Check browser internet/CDN access."));
    document.head.appendChild(s);
  });
  return xlsxPromise;
}
function setStatus(msg,type=""){
  if(!els.mcStatus)return;
  els.mcStatus.textContent=msg;
  els.mcStatus.style.color=type==="error"?"#b91c1c":type==="success"?"#047857":"";
}
function renderSummary(s){
  els.mcSummary.classList.remove("hidden");
  els.mcSummary.innerHTML=[["TOTAL",s.total,""],["SAME",s.same,"same"],["NEW",s.newCount,"new"],["DELETED",s.deleted,"deleted"],["CHANGED",s.changed,"changed"],["REVIEW",s.review,"review"]].map(x=>`<div class="mc-stat ${x[2]}"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join("");
}
function remarkClass(r){if(r===STATUS.SAME)return"same";if(r===STATUS.NEW)return"new";if(r===STATUS.DELETED)return"deleted";if(r===STATUS.REVIEW)return"review";return"changed"}
function renderTable(){
  const q=norm(els.mcSearch?.value||""),filter=els.mcStatusFilter?.value||"",conf=els.mcConfidenceFilter?.value||"";
  const rows=(comparisonResult?.rows||[]).filter(r=>{
    const text=norm([r.upcomingParameter,r.baseParameter,r.category,r.remark,r.upcomingSheet,r.baseSheet].join(" "));
    if(q&&!text.includes(q))return false;
    if(filter&&r.remark!==filter)return false;
    if(conf&&(conf==="high"?r.confidence<90:conf==="medium"?(r.confidence<70||r.confidence>=90):r.confidence>=70))return false;
    return true;
  });
  els.mcTableBody.innerHTML=rows.length?rows.map((r,i)=>`<tr><td>${i+1}</td><td class="mc-parameter">${esc(r.upcomingParameter)}</td><td class="mc-spec">${esc(r.upcomingLSL)}</td><td class="mc-spec">${esc(r.upcomingUSL)}</td><td>${esc(r.baseParameter)}</td><td class="mc-spec">${esc(r.baseLSL)}</td><td class="mc-spec">${esc(r.baseUSL)}</td><td class="mc-spec">${esc(r.lslDiff)}</td><td class="mc-spec">${esc(r.uslDiff)}</td><td><span class="mc-status-pill mc-status-${remarkClass(r.remark)}">${esc(r.remark)}</span></td></tr>`).join(""):`<tr><td colspan="10" class="mc-empty">No comparison rows match the current filter.</td></tr>`;
}
function populateModelSelects(){
  const comparisonModels=comparisonModelList();
  const options=comparisonModels.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
  [els.mcBaseModel,els.mcUpcomingModel].forEach((el,i)=>{
    if(!el)return;
    el.innerHTML=options+`<option value="CUSTOM">Custom / Other</option>`;
    el.value=i?(comparisonModels[1]||comparisonModels[0]):comparisonModels[0];
  });
}
function setFile(which,file){
  if(!file)return;
  if(!/\.(xlsx|xls|csv)$/i.test(file.name)){setStatus("Please select an XLSX, XLS or CSV workbook.","error");return}
  if(which==="base"){
    baseFile=file;els.mcBaseDrop.classList.add("loaded");els.mcBaseTitle.textContent=file.name;els.mcBaseMeta.textContent=`${formatBytes(file.size)} • Base model`;
  }else{
    upcomingFile=file;els.mcUpcomingDrop.classList.add("loaded");els.mcUpcomingTitle.textContent=file.name;els.mcUpcomingMeta.textContent=`${formatBytes(file.size)} • Upcoming model`;
  }
  els.mcCompareBtn.disabled=!(baseFile&&upcomingFile);
  if(baseFile&&upcomingFile)setStatus("Both workbooks ready. Click Compare Models.","success");
}
function wireDrop(drop,input,which){
  drop?.addEventListener("click",()=>input?.click());
  drop?.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();input?.click()}});
  input?.addEventListener("change",()=>setFile(which,input.files[0]));
  ["dragenter","dragover"].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("dragover")}));
  ["dragleave","drop"].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("dragover")}));
  drop?.addEventListener("drop",e=>setFile(which,e.dataTransfer.files[0]));
}
function terminateWorker(){
  if(comparisonWorker){comparisonWorker.terminate();comparisonWorker=null}
}
async function compare(){
  if(!baseFile||!upcomingFile)return;
  terminateWorker();
  try{
    els.mcCompareBtn.disabled=true;
    els.mcExportBtn.disabled=true;
    els.mcResults.classList.add("hidden");
    setProgress(5,"Preparing both Excel files…",true);
    setStatus("Preparing both Excel files…");
    const [baseBuffer,upcomingBuffer]=await Promise.all([baseFile.arrayBuffer(),upcomingFile.arrayBuffer()]);
    if(!baseBuffer.byteLength||!upcomingBuffer.byteLength)throw new Error("One of the selected workbooks is empty.");
    if(typeof Worker!=="function")throw new Error("This browser does not support background Excel comparison. Please use a current Chrome/Edge browser.");
    comparisonWorker=new Worker(new URL("./comparison-worker.js",import.meta.url),{type:"classic"});
    comparisonWorker.onmessage=event=>{
      const msg=event.data||{};
      if(msg.type==="status"){setStatus(msg.message);setProgress(msg.percent??5,msg.message,true);return}
      if(msg.type==="error"){
        setStatus(msg.message||"Excel comparison failed.","error");
        els.mcResults.classList.add("hidden");
        els.mcExportBtn.disabled=true;
        terminateWorker();
        return;
      }
      if(msg.type==="complete"){
        comparisonResult={
          baseFile:baseFile.name,
          upcomingFile:upcomingFile.name,
          baseModel:els.mcBaseModel.value,
          upcomingModel:els.mcUpcomingModel.value,
          rows:msg.rows,
          summary:msg.rows.reduce((s,r)=>{
            s.total++;
            if(r.remark===STATUS.SAME)s.same++;
            else if(r.remark===STATUS.NEW)s.newCount++;
            else if(r.remark===STATUS.DELETED)s.deleted++;
            else if(r.remark===STATUS.REVIEW)s.review++;
            else if(/^LSL |^USL |,/.test(r.remark))s.changed++;
            return s;
          },{total:0,same:0,newCount:0,deleted:0,changed:0,review:0}),
          generatedAt:new Date().toISOString()
        };
        renderSummary(comparisonResult.summary);
        els.mcResults.classList.remove("hidden");
        renderTable();
        els.mcExportBtn.disabled=false;
        setProgress(100,"Comparison complete",true);
        setStatus(`Comparison complete • ${msg.upRows.length.toLocaleString()} upcoming parameters • ${msg.baseRows.length.toLocaleString()} base parameters.`,"success");
        terminateWorker();
      }
    };
    comparisonWorker.onerror=event=>{
      console.error("Excel comparison worker error",event);
      setStatus("Excel comparison worker failed. The workbook may be unsupported or the browser blocked the background parser. Please retry with a valid XLSX/XLS/CSV file.","error");
      els.mcResults.classList.add("hidden");
      els.mcExportBtn.disabled=true;
      terminateWorker();
    };
    comparisonWorker.postMessage({baseBuffer,upcomingBuffer},[baseBuffer,upcomingBuffer]);
  }catch(err){
    console.error(err);
    setStatus(err?.message||"Comparison failed.","error");
  }finally{
    els.mcCompareBtn.disabled=!(baseFile&&upcomingFile);
  }
}
function reset(){
  terminateWorker();
  baseFile=null;upcomingFile=null;comparisonResult=null;
  ["mcBaseInput","mcUpcomingInput"].forEach(id=>{if(els[id])els[id].value=""});
  ["mcBaseDrop","mcUpcomingDrop"].forEach(id=>els[id]?.classList.remove("loaded"));
  els.mcBaseTitle.textContent="Drop Base Model Excel Here";
  els.mcUpcomingTitle.textContent="Drop Upcoming Model Excel Here";
  els.mcBaseMeta.textContent="XLSX / XLS • Multiple sheets supported";
  els.mcUpcomingMeta.textContent="XLSX / XLS • Multiple sheets supported";
  els.mcSummary.classList.add("hidden");els.mcResults.classList.add("hidden");els.mcExportBtn.disabled=true;els.mcCompareBtn.disabled=true;setProgress(0,"Ready",false);
  els.mcSearch.value="";setStatus("Select both workbooks to start.");
}
async function exportExcel(){
  if(!comparisonResult)return;
  try{
    const X=await loadXLSX(),wb=X.utils.book_new(),s=comparisonResult.summary;
    const summary=[["PARAMETER / SPEC COMPARISON REPORT"],["Base Model",comparisonResult.baseModel],["Upcoming Model",comparisonResult.upcomingModel],["Base Workbook",comparisonResult.baseFile],["Upcoming Workbook",comparisonResult.upcomingFile],[],["Metric","Count"],["Total",s.total],["Same",s.same],["New Parameter",s.newCount],["Deleted",s.deleted],["Changed",s.changed],["Review",s.review]];
    const ws1=X.utils.aoa_to_sheet(summary);ws1["!cols"]=[{wch:28},{wch:60}];X.utils.book_append_sheet(wb,ws1,"01 Summary");
    const rows=[OUTPUT_HEADERS,...comparisonResult.rows.map((r,i)=>[i+1,r.upcomingParameter,r.upcomingLSL,r.upcomingUSL,r.baseParameter,r.baseLSL,r.baseUSL,r.lslDiff,r.uslDiff,r.remark])];
    const ws=X.utils.aoa_to_sheet(rows);ws["!autofilter"]={ref:`A1:J${rows.length}`};ws["!freeze"]={xSplit:0,ySplit:1};ws["!cols"]=[{wch:8},{wch:34},{wch:14},{wch:14},{wch:34},{wch:14},{wch:14},{wch:14},{wch:14},{wch:24}];
    const headerLabels=["17365D","17365D","DCE6F1","DCE6F1","17365D","DCE6F1","DCE6F1","E2F0D9","E2F0D9","FFF2CC"];
    for(let c=0;c<10;c++){const cell=ws[X.utils.encode_cell({r:0,c})];if(cell)cell.s={font:{bold:true,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:headerLabels[c]}},alignment:{horizontal:"center",vertical:"center",wrapText:true},border:{top:{style:"thin",color:{rgb:"9CA3AF"}},bottom:{style:"thin",color:{rgb:"9CA3AF"}},left:{style:"thin",color:{rgb:"D1D5DB"}},right:{style:"thin",color:{rgb:"D1D5DB"}}}}}
    const remarkColors={"Same":"C6EFCE","New Parameter":"BDD7EE","Deleted Parameter":"F4CCCC","Review":"FCE4D6"};
    for(let r=1;r<rows.length;r++){const remark=rows[r][9],fill=remarkColors[remark]||"FFF2CC";for(let c=0;c<10;c++){const cell=ws[X.utils.encode_cell({r,c})];if(!cell)continue;cell.s={alignment:{vertical:"top",wrapText:true},border:{top:{style:"thin",color:{rgb:"D9E1F2"}},bottom:{style:"thin",color:{rgb:"D9E1F2"}},left:{style:"thin",color:{rgb:"D9E1F2"}},right:{style:"thin",color:{rgb:"D9E1F2"}}}};if(c===9)cell.s.fill={fgColor:{rgb:fill}};if(c===7||c===8)cell.s.alignment.horizontal="right"}}
    X.utils.book_append_sheet(wb,ws,"02 Comparison");
    const b=String(comparisonResult.baseModel||"Base").replace(/[^a-z0-9_-]+/gi,"_"),u=String(comparisonResult.upcomingModel||"Upcoming").replace(/[^a-z0-9_-]+/gi,"_");
    X.writeFile(wb,`Model_Comparison_${b}_vs_${u}.xlsx`);
  }catch(err){console.error(err);setStatus(`Export failed: ${err?.message||"Excel export error"}`,"error")}
}
function openModal(){qs("modelComparisonModal")?.classList.remove("hidden");setStatus("Select both workbooks to start.")}
function closeModal(){terminateWorker();qs("modelComparisonModal")?.classList.add("hidden")}
document.addEventListener("portal-open-excel-comparison",openModal);
document.addEventListener("DOMContentLoaded",()=>{
  ["mcBaseDrop","mcBaseInput","mcUpcomingDrop","mcUpcomingInput","mcBaseTitle","mcUpcomingTitle","mcBaseMeta","mcUpcomingMeta","mcStatus","mcProgressWrap","mcProgressBar","mcProgressPercent","mcProgressLabel","mcCompareBtn","mcExportBtn","mcResetBtn","mcSummary","mcResults","mcSearch","mcStatusFilter","mcConfidenceFilter","mcTableBody","mcBaseModel","mcUpcomingModel"].forEach(id=>els[id]=qs(id));
  populateModelSelects();
  wireDrop(els.mcBaseDrop,els.mcBaseInput,"base");
  wireDrop(els.mcUpcomingDrop,els.mcUpcomingInput,"upcoming");
  if(!isModuleEnabled("excelComparison"))setStatus("Parameter / Spec Comparison is currently disabled.","error");
  els.mcCompareBtn?.addEventListener("click",compare);
  els.mcExportBtn?.addEventListener("click",exportExcel);
  els.mcResetBtn?.addEventListener("click",reset);
  [els.mcSearch,els.mcStatusFilter,els.mcConfidenceFilter].forEach(el=>el?.addEventListener("input",renderTable));
  [els.mcStatusFilter,els.mcConfidenceFilter].forEach(el=>el?.addEventListener("change",renderTable));
  document.querySelectorAll("[data-close-model-comparison]").forEach(btn=>btn.addEventListener("click",closeModal));
  qs("modelComparisonModal")?.querySelector(".modal-backdrop")?.addEventListener("click",closeModal);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!qs("modelComparisonModal")?.classList.contains("hidden"))closeModal()});
});
