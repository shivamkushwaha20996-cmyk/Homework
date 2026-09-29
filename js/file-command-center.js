import {MODEL_ORDER, RECORD_ORDER, createDefaultData} from "../data/models.js";
import {getLatestFile, resolveLatestFileMetadata, getAuditLogs, addAudit} from "./database.js";
import {downloadBlob, formatBytes, escapeHtml} from "./ui.js";
import {resolvePreviewFile,renderPreview,clearPreviewContainer} from "./preview/preview-controller.js?v=PREVIEW-RUNTIME-20260929-01";

/*
  Isolated File Command Center.
  This module intentionally does not modify app.js, record rendering, model selection,
  upload handlers, or existing click handlers. It only owns its own modal and button.
*/

const DATA_KEY = "MOBILE_RND_DB_DATA_V1";
let rows = [];
let objectUrl = null;
let previewRequestId = 0;

function loadData() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY)) || createDefaultData(); }
  catch { return createDefaultData(); }
}

function subpartId(sub, index) {
  return String(sub?.id || sub?.name || `part-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `part-${index + 1}`;
}

function keyForSubpart(model, key, sub, index) {
  const storageKey = key === "M" ? "O" : key;
  return `${model}_${storageKey}_${subpartId(sub, index)}`;
}

function modelCodes(data) {
  return Object.keys(data || {});
}

async function collectRecords() {
  const data=loadData(),out=[];
  const pushRow=async(model,key,item,storageKey,subpart,slotFilename,slotSize)=>{
    const latest=await resolveLatestFileMetadata(storageKey);if(!latest)return;
    out.push({model,key,subpart:subpart||"",title:item.title||key,category:item.category||"General",filename:latest.filename||slotFilename||"Uploaded file",size:latest.size?formatBytes(latest.size):(slotSize||"—"),baseKey:storageKey,storageKey:latest.key||storageKey,versionCount:latest.versionCount||undefined,updatedAt:latest.updatedAt||""});
  };
  const jobs=[];
  for(const model of modelCodes(data)){
    const items=data[model]?.items||{};
    for(const key of RECORD_ORDER){
      const item=items[key];if(!item)continue;
      if(Array.isArray(item.mergedSources)){
        for(const src of item.mergedSources)jobs.push(pushRow(model,key,item,`${model}_${src.key}`,src.name,src.filename,src.size));
      }else if(Array.isArray(item.subItems)){
        for(let index=0;index<item.subItems.length;index++){const sub=item.subItems[index];jobs.push(pushRow(model,key,item,keyForSubpart(model,key,sub,index),sub.name||`Part ${index+1}`,sub.filename,sub.size))}
      }else{
        jobs.push(pushRow(model,key,item,`${model}_${key}`,"",item.filename,item.size));
      }
      // Additional uploaded documents are independent file slots and must be
      // indexed even when the record also has configured sub-items or merged
      // sources. The previous early `continue` statements silently excluded
      // these real uploaded files from the Command Center.
      if(Array.isArray(item.documents)){
        for(let index=0;index<item.documents.length;index++){
          const doc=item.documents[index];
          const storageKey=doc.storageKey||`${model}_${key}_document_${doc.id||index+1}`;
          jobs.push(pushRow(model,key,item,storageKey,doc.name||doc.filename||"Additional document",doc.filename,doc.size));
        }
      }
    }
  }
  await Promise.all(jobs);
  return out.sort((a,b)=>String(a.model).localeCompare(String(b.model))||String(a.key).localeCompare(String(b.key))||String(a.subpart).localeCompare(String(b.subpart)));
}

function iconFor(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return "fa-file-pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "fa-file-excel";
  if (["doc", "docx"].includes(ext)) return "fa-file-word";
  if (["ppt", "pptx"].includes(ext)) return "fa-file-powerpoint";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "fa-file-image";
  if (["zip", "bin"].includes(ext)) return "fa-file-zipper";
  return "fa-file-lines";
}

function extOf(filename = "") { return filename.split(".").pop().toLowerCase(); }

function modal() { return document.getElementById("fileCenterModal"); }
function close() { modal()?.classList.add("hidden"); closeFilePreview(); }
function open() { clearPreview(); document.getElementById("recordPreviewModal")?.classList.add("hidden"); document.getElementById("filePreviewModal")?.classList.add("hidden"); modal()?.classList.remove("hidden"); refresh(); }

function renderModelOptions() {
  const select = document.getElementById("fileCenterModel");
  if (!select) return;
  const data = loadData();
  const selected=select.value;
  select.innerHTML = `<option value="">All models</option>` + modelCodes(data).map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if(selected&&modelCodes(data).includes(selected))select.value=selected;
}

function filtered() {
  const q = (document.getElementById("fileCenterSearch")?.value || "").trim().toLowerCase();
  const model = document.getElementById("fileCenterModel")?.value || "";
  return rows.filter(r => (!model || r.model === model) && (!q || `${r.model} ${r.key} ${r.subpart || ""} ${r.title} ${r.category} ${r.filename}`.toLowerCase().includes(q)));
}

async function refresh() {
  renderModelOptions();
  try {
    rows = await collectRecords();
    render();
    await recentUploads();
  } catch (error) {
    console.error("File Command Center refresh failed", error);
    rows = [];
    render();
    const el = document.getElementById("fileCenterRecent");
    if (el) el.innerHTML = `<div class="file-center-recent-empty">File repository index is temporarily unavailable.</div>`;
  }
}

function render() {
  const list = document.getElementById("fileCenterList");
  const count = document.getElementById("fileCenterCount");
  if (!list) return;
  const items = filtered();
  if (count) count.textContent = `${items.length} file${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    list.innerHTML = `<div class="file-center-empty"><i class="fa-solid fa-folder-open"></i><strong>No uploaded files found</strong><span>Use Upload from the Admin controls to add an engineering file.</span></div>`;
    return;
  }
  list.innerHTML = items.map((r, i) => `
    <div class="file-center-row" data-index="${i}">
      <div class="file-center-icon"><i class="fa-solid ${iconFor(r.filename)}"></i></div>
      <div class="file-center-main">
        <strong title="${escapeHtml(r.filename)}">${escapeHtml(r.filename)}</strong>
        <span>${escapeHtml(r.model)} · ${escapeHtml(r.key)}${r.subpart ? ` / ${escapeHtml(r.subpart)}` : ""} · ${escapeHtml(r.category)} · ${escapeHtml(r.size)}</span>
      </div>
      <div class="file-center-actions">
        <button type="button" class="fc-action" data-action="preview" title="Preview"><i class="fa-solid fa-eye"></i></button>
        <button type="button" class="fc-action" data-action="download" title="Download"><i class="fa-solid fa-download"></i></button>
      </div>
    </div>`).join("");
}

async function recentUploads() {
  const el = document.getElementById("fileCenterRecent");
  if (!el) return;
  try {
    const logs = await getAuditLogs(30);
    const uploads = (logs || []).filter(x => x.action === "UPLOAD").slice(0, 5);
    el.innerHTML = uploads.length ? uploads.map(x => {
      const d = (x.at || x.timestamp) ? new Date(x.at || x.timestamp).toLocaleString() : "";
      const p = x.details || {};
      return `<div class="file-center-recent-item"><i class="fa-solid fa-cloud-arrow-up"></i><span><strong>${escapeHtml(p.filename || "Engineering file")}</strong><small>${escapeHtml(p.model || "")} · ${escapeHtml(p.key || "")}${p.subpart ? ` / ${escapeHtml(p.subpart)}` : ""} · ${escapeHtml(d)}</small></span></div>`;
    }).join("") : `<div class="file-center-recent-empty">No recent uploads recorded.</div>`;
  } catch {
    el.innerHTML = `<div class="file-center-recent-empty">Recent upload history is unavailable.</div>`;
  }
}

function clearPreview() {
  previewRequestId++;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  const body = document.getElementById("filePreviewBody");
  if (body) clearPreviewContainer(body);
}

function closeFilePreview(){
  clearPreview();
  document.getElementById("filePreviewModal")?.classList.add("hidden");
}

async function getSelected(row) {
  return getLatestFile(row.baseKey || row.storageKey || `${row.model}_${row.key}`);
}

async function downloadRow(row) {
  const record = await getSelected(row);
  if (!record?.blob) throw new Error("File is not present in local storage.");
  const filename=record.filename || row.filename;
  const ok = downloadBlob(record.blob, filename);
  if (!ok) throw new Error("Browser blocked the download.");
  await addAudit("DOWNLOAD",{model:row.model,key:row.key,subpart:row.subpart || "",filename});
}

async function previewRow(row) {
  const requestId=++previewRequestId;
  let record;
  try{record=await resolvePreviewFile(row.baseKey||row.storageKey||`${row.model}_${row.key}`)}catch(error){if(requestId!==previewRequestId)return;window.alert(error?.message||"Stored binary is unavailable for preview.");return;}
  if(requestId!==previewRequestId)return;
  const body=document.getElementById("filePreviewBody"),title=document.getElementById("filePreviewTitle"),meta=document.getElementById("filePreviewMeta");if(!body)return;
  if(title)title.textContent=record.filename||row.filename||"Engineering file";
  if(meta)meta.textContent=`${row.model} · ${formatBytes(record.size||record.blob.size)} · ${record.blob.type||"unknown type"}`;
  clearPreviewContainer(body);
  try{await renderPreview({blob:record.blob,name:record.filename||row.filename||"file",container:body,escapeHtml,onDownload:()=>downloadRow(row).catch(e=>window.alert(e.message))})}catch(error){
    if(requestId!==previewRequestId)return;
    body.innerHTML=`<div class="preview-placeholder preview-file-fallback"><i class="fa-solid fa-triangle-exclamation"></i><strong>Preview could not be rendered</strong><span>${escapeHtml(error?.message||"The stored binary failed preview validation.")}</span><div class="preview-fallback-actions"><button type="button" class="btn btn-dark" data-preview-download><i class="fa-solid fa-download"></i> Download File</button></div></div>`;
    body.querySelector("[data-preview-download]")?.addEventListener("click",()=>downloadRow(row).catch(e=>window.alert(e.message)));
    return;
  }
  if(requestId!==previewRequestId){clearPreview();return;}
  document.getElementById("recordPreviewModal")?.classList.add("hidden");
  document.getElementById("filePreviewModal")?.classList.remove("hidden");
}
function bind() {
  const btn = document.getElementById("fileCenterBtn");
  if (!btn) return;
  btn.addEventListener("click", open);
  document.getElementById("fileCenterRefresh")?.addEventListener("click", () => refresh());
  document.getElementById("fileCenterSearch")?.addEventListener("input", render);
  document.getElementById("fileCenterModel")?.addEventListener("change", render);
  document.querySelectorAll("[data-close-file-center]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.closeFileCenter)?.classList.add("hidden")));
  document.getElementById("fileCenterModal")?.addEventListener("click", async e => {
    if (e.target.classList.contains("modal-backdrop")) { close(); return; }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const rowEl = e.target.closest(".file-center-row");
    const row = rowEl ? filtered()[Number(rowEl.dataset.index)] : null;
    if (!row) return;
    try {
      if (action === "download") await downloadRow(row);
      if (action === "preview") await previewRow(row);
    } catch (err) {
      window.alert(err?.message || "File operation failed.");
    }
  });
  document.getElementById("filePreviewModal")?.addEventListener("click", e => { if (e.target.classList.contains("modal-backdrop")) closeFilePreview(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closeFilePreview();
    close();
  });
}

document.addEventListener("DOMContentLoaded", bind);
