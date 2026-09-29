/*
 * Record presentation boundary.
 * Data loading, filtering, upload/storage and application state remain in app.js.
 * This module owns only record cards + the dedicated record preview workspace.
 */
import {resolvePreviewFile,renderPreview,clearPreviewContainer} from "../preview/preview-controller.js?v=PREVIEW-REBUILT";

export function createRecordSystem(ctx){
  let previewRequestId=0;
  const esc=ctx.escapeHtml;
  const colorFor=category=>ctx.getCategoryColors?.()[category]||ctx.getCategoryColors?.().Specification||"#2563eb";

  function recordViewModel(key,item){
    const entries=ctx.getExpandedFileMap().get(key)||[];
    const presentCount=entries.filter(entry=>entry.present).length;
    const totalSlots=entries.length;
    const versionTotal=entries.reduce((sum,entry)=>sum+(entry.versionCount||0),0);
    const statusClass=presentCount>0?"all-present":"all-missing";
    const statusText=presentCount>0?"DOCUMENT READY":"DOCUMENT MISSING";
    const fileText=presentCount===1?"1 document ready":`${presentCount} documents ready`;
    return {
      key,item,entries,presentCount,totalSlots,versionTotal,statusClass,statusText,
      summary:presentCount?fileText:"No document uploaded"
    };
  }

  function renderExpandedFiles(vm){
    if(!vm.entries.length)return `<div class="expanded-empty">No document entries configured.</div>`;
    return vm.entries.map(entry=>{
      const selector=entry.selectorValue??entry.sourceKey??"";
      const actions=entry.present
        ? `<button type="button" class="text-action primary" data-preview-file="${esc(vm.key)}" data-preview-base-key="${esc(entry.baseKey||entry.storageKey||"")}"><i class="fa-solid fa-eye"></i> Preview</button><button type="button" class="text-action" data-download="${esc(entry.storageKey)}" data-filename="${esc(entry.filename||"document")}"><i class="fa-solid fa-download"></i> Download</button>${ctx.getIsAdmin()?`<button type="button" class="text-action" data-open-upload="${esc(vm.key)}" data-subpart-index="${esc(selector)}"><i class="fa-solid fa-plus"></i> New Version</button>`:""}`
        : (ctx.getIsAdmin()?`<button type="button" class="text-action primary" data-open-upload="${esc(vm.key)}" data-subpart-index="${esc(selector)}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`:`<span class="missing-label">ADMIN UPLOAD REQUIRED</span>`);
      return `<div class="expanded-file-row ${entry.present?"is-present":"is-missing"}">
        <div class="expanded-file-main">
          <div class="expanded-file-title"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i><span>${esc(entry.name)}</span><span class="expanded-status ${entry.present?"present":"missing"}">${entry.present?"PRESENT":"MISSING"}</span></div>
          <div class="expanded-file-meta"><span>${entry.present?`Latest: ${esc(entry.versionLabel||"Current")}`:"No uploaded document"}</span><span>${esc(entry.size||"—")}</span><span>${entry.versionCount?`${entry.versionCount} version${entry.versionCount===1?"":"s"}`:"Ready to upload"}</span></div>
        </div>
        <div class="expanded-file-actions">${actions}</div>
      </div>`;
    }).join("");
  }

  function renderCard(key,item){
    const vm=recordViewModel(key,item);
    const color=colorFor(item.category);
    const favKey=`${ctx.getCurrentModel()}:${key}`;
    const isFav=ctx.getFavorites().includes(favKey);
    const groupView=ctx.getActiveCategory()!=="all";
    const expanded=groupView||ctx.getExpandedCards().has(key);
    const detail=expanded?`<div class="record-expanded-panel">
      <div class="record-detail-summary">
        <div><span class="detail-label">DOCUMENT STATUS</span><strong class="${vm.statusClass}">${esc(vm.statusText)}</strong></div>
        <div><span class="detail-label">UPLOADED</span><strong>${vm.presentCount} document${vm.presentCount===1?"":"s"}</strong></div>
      </div>
      <div class="expanded-file-list">${renderExpandedFiles(vm)}</div>
      <div class="expanded-footer">
        <button type="button" class="text-action" data-copy-record="${esc(key)}"><i class="fa-regular fa-copy"></i> Copy details</button>
        <button type="button" class="text-action" data-link-record="${esc(key)}"><i class="fa-solid fa-link"></i> Copy link</button>
      </div>
    </div>`:"";

    return `<article id="record-${esc(key)}" class="record-card ${expanded?"is-expanded":""} ${isFav?"is-favorite":""}" style="--record-accent:${color}" data-record="${esc(key)}" tabindex="0" aria-expanded="${expanded}">
      <div class="record-stripe" style="background:${color}"></div>
      <div class="record-collapsed-face">
        <div class="record-icon" style="background:${color}"><i class="fa-solid ${esc(item.icon)}"></i></div>
        <div class="record-card-identity">
          <div class="record-title-only" title="${esc(item.title)}">${esc(item.title)}</div>
          <div class="record-card-subtitle"><span class="record-subtitle-status ${vm.statusClass}"><span class="status-dot ${vm.presentCount?"present":"missing"}"></span></span><strong class="record-document-state ${vm.statusClass}">${esc(vm.statusText)}</strong>${vm.presentCount>1?` · ${vm.presentCount} files`:""}</div>
        </div>
        <button type="button" class="favorite-btn ${isFav?"active":""}" data-favorite="${esc(favKey)}" title="Favorite" aria-label="Favorite"><i class="fa-${isFav?"solid":"regular"} fa-star"></i></button>
        <span class="expand-cue" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
      </div>
      <div class="record-card-actions">
        <button type="button" class="card-action card-preview-action" data-preview-record="${esc(key)}"><i class="fa-solid fa-eye"></i><span>Preview</span></button>
        ${vm.presentCount?`<button type="button" class="card-action" data-download-latest="${esc(key)}"><i class="fa-solid fa-download"></i><span>Download</span></button>`:""}
        ${ctx.getIsAdmin()?`<button type="button" class="card-action" data-open-upload="${esc(key)}" data-subpart-index=""><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload</span></button>`:""}
      </div>
      ${detail}
    </article>`;
  }

  function equalizeGroupCardHeights(){
    if(ctx.getActiveCategory()==="all") return;
    const grid=document.getElementById("cardsGrid");
    if(!grid) return;
    const cards=[...grid.querySelectorAll(".record-card")];
    cards.forEach(card=>{card.style.minHeight="";});
    const maxHeight=cards.reduce((max,card)=>Math.max(max,card.getBoundingClientRect().height),0);
    if(maxHeight>0) cards.forEach(card=>{card.style.minHeight=`${Math.ceil(maxHeight)}px`;});
  }

  function renderCards(){
    ctx.ensureSchematicCardsVisible();
    const grid=document.getElementById("cardsGrid");
    if(!grid)return;
    const entries=ctx.getFilteredEntries();
    const items=ctx.getCurrentItems();
    const total=ctx.getRecordOrder().filter(key=>items[key]).length;
    const groupView=ctx.getActiveCategory()!=="all";
    document.body.dataset.recordView=groupView?"group":"all";
    document.body.dataset.activeRecordCategory=ctx.getActiveCategory();
    const count=document.getElementById("recordCount");
    if(count)count.textContent=groupView?`${entries.length} records • Group view`:`${total} records`;
    const telemetryRecords=document.getElementById("telemetryRecords");
    if(telemetryRecords)telemetryRecords.textContent=String(total);
    const activeFilters=document.getElementById("activeFilters");
    const hasSecondaryFilters=Boolean(ctx.getQuery?.()||ctx.getFavoritesOnly?.()||ctx.getSortMode?.()!=="default");
    if(activeFilters){
      activeFilters.classList.toggle("hidden",!hasSecondaryFilters);
      activeFilters.innerHTML=`${ctx.getQuery?.()?`<span class="filter-chip">Search: ${esc(ctx.getQuery())}</span>`:""}${ctx.getFavoritesOnly?.()?`<span class="filter-chip">Favorites only</span>`:""}${ctx.getSortMode?.()!=="default"?`<span class="filter-chip">Sort: ${esc(ctx.getSortMode())}</span>`:""}`;
    }
    grid.innerHTML=entries.map(([key,item])=>renderCard(key,item)).join("")||`<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark"></i><h3 class="font-bold mt-3">No records found</h3><p class="text-xs mt-1">Adjust the search or filters.</p><button class="btn btn-light mt-3" data-clear-filters>Clear filters</button></div>`;
    if(groupView) requestAnimationFrame(equalizeGroupCardHeights);
  }

  function clearRecordPreviewSurface(){
    const body=document.getElementById("recordPreviewBody");
    if(body)clearPreviewContainer(body);
  }

  function showRecordPreviewShell(key,item,entries){
    const title=document.getElementById("recordPreviewTitle");
    const meta=document.getElementById("recordPreviewMeta");
    const body=document.getElementById("recordPreviewBody");
    if(!body)return null;
    clearRecordPreviewSurface();
    const present=entries.filter(entry=>entry.present).length;
    const versions=entries.reduce((sum,entry)=>sum+(entry.versionCount||0),0);
    if(title)title.textContent=`${item.title} — Record Preview`;
    if(meta)meta.textContent=`${ctx.getCurrentModel()} · ${item.category} · ${present} document${present===1?"":"s"} ready · ${versions} version${versions===1?"":"s"}`;
    body.innerHTML=`<div class="record-preview-workspace">
      <aside class="record-preview-info">
        <div class="preview-section-title">RECORD INFORMATION</div>
        <div class="preview-info-grid">
          <span>Model</span><strong>${esc(ctx.getCurrentModel())}</strong>
          <span>Record</span><strong>${esc(key)}</strong>
          <span>Category</span><strong>${esc(item.category)}</strong>
          <span>Status</span><strong>${esc(item.status||"Engineering record")}</strong>
          <span>Documents</span><strong>${present} document${present===1?"":"s"} ready</strong>
          <span>Versions</span><strong>${versions}</strong>
        </div>
        <div class="preview-section-title">FILES</div>
        <div class="preview-file-list">
          ${entries.length?entries.map(entry=>`<button type="button" class="preview-file-item ${entry.present?"present":"missing"}" data-record-preview-base-key="${esc(entry.baseKey||entry.storageKey||"")}">
            <span class="preview-file-icon"><i class="fa-solid ${entry.present?"fa-file-circle-check":"fa-file-circle-xmark"}"></i></span>
            <span class="preview-file-copy"><strong>${esc(entry.name)}</strong><small>${esc(entry.present?entry.filename:"No uploaded document")}</small></span>
            <span class="preview-file-state">${entry.present?esc(entry.size):"MISSING"}</span>
          </button>`).join(""):"<div class='preview-empty'>No document uploaded yet.</div>"}
        </div>
        <div class="preview-bottom-actions"><button type="button" class="btn btn-dark" id="recordPreviewDownloadAll"><i class="fa-solid fa-download"></i> Download All Files</button></div>
      </aside>
      <section class="record-preview-viewer">
        <div class="preview-viewer-head"><span id="recordPreviewViewerLabel">Select a file</span><span id="recordPreviewViewerMeta">Preview</span></div>
        <div id="recordPreviewViewerCanvas" class="preview-viewer-canvas"><div class="preview-placeholder"><i class="fa-solid fa-eye"></i><strong>Select a file from the list</strong><span>Choose a specific document to preview it.</span></div></div>
      </section>
    </div>`;
    document.getElementById("filePreviewModal")?.classList.add("hidden");
    document.getElementById("recordPreviewDownloadAll")?.addEventListener("click",()=>downloadAllRecordFiles(key));
    body.querySelectorAll("[data-record-preview-base-key]").forEach(button=>button.addEventListener("click",()=>{previewRequestId++;previewRecordFile(key,button.dataset.recordPreviewBaseKey,previewRequestId)}));
    document.getElementById("recordPreviewModal")?.classList.remove("hidden");
    return body;
  }

  async function previewRecord(key){
    const requestId=++previewRequestId;
    const item=ctx.getCurrentItems()?.[key];
    if(!item)return;
    const entries=ctx.getExpandedFileMap().get(key)||[];
    showRecordPreviewShell(key,item,entries);
    const firstPresent=entries.find(entry=>entry.present);
    if(firstPresent)await previewRecordFile(key,firstPresent.baseKey||firstPresent.storageKey,requestId);
  }

  async function previewRecordFile(key,baseKey,parentRequestId=null){
    const requestId=parentRequestId||++previewRequestId;
    if(requestId!==previewRequestId)return;
    const item=ctx.getCurrentItems()?.[key],entries=ctx.getExpandedFileMap().get(key)||[];
    const entry=entries.find(x=>String(x.baseKey||x.storageKey||"")===String(baseKey||""));
    if(!item||!entry)return;
    if(!parentRequestId)showRecordPreviewShell(key,item,entries);
    const canvas=document.getElementById("recordPreviewViewerCanvas"),label=document.getElementById("recordPreviewViewerLabel"),meta=document.getElementById("recordPreviewViewerMeta");
    if(!canvas||!label||!meta)return;
    document.querySelectorAll("#recordPreviewBody .preview-file-item").forEach(element=>element.classList.toggle("active",String(element.dataset.recordPreviewBaseKey)===String(baseKey)));
    if(!entry.present){label.textContent=entry.name;meta.textContent="No uploaded file";canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-file-circle-xmark"></i><strong>No file uploaded</strong><span>This document slot is currently missing.</span></div>`;return;}
    label.textContent=entry.name||entry.filename||"Document";meta.textContent=`Resolving latest version · ${entry.versionCount||0} version${entry.versionCount===1?"":"s"}`;
    canvas.innerHTML=`<div class="preview-placeholder"><i class="fa-solid fa-spinner fa-spin"></i><strong>Loading latest version…</strong><span>Resolving and validating the stored binary before rendering.</span></div>`;
    try{
      const record=await resolvePreviewFile(entry.baseKey||entry.storageKey);
      if(requestId!==previewRequestId)return;
      const name=record.filename||entry.filename||"document";
      label.textContent=name;meta.textContent=`${record.versionLabel||entry.versionLabel||"Latest"} · ${formatSize(record.size||record.blob.size)}`;
      await renderPreview({blob:record.blob,name,container:canvas,escapeHtml:esc,onDownload:()=>ctx.downloadRecord(record.key||entry.storageKey,name)});
      if(requestId!==previewRequestId){clearRecordPreviewSurface();return;}
    }catch(error){
      if(requestId!==previewRequestId)return;
      console.error("Record preview pipeline failed",error);
      canvas.innerHTML=`<div class="preview-placeholder preview-file-fallback"><i class="fa-solid fa-triangle-exclamation"></i><strong>Preview could not be rendered</strong><span>${esc(error?.message||"The stored binary failed preview validation.")}</span><div class="preview-fallback-actions"><button type="button" class="btn btn-dark" id="recordPreviewFailedDownload"><i class="fa-solid fa-download"></i> Download File</button></div></div>`;
      document.getElementById("recordPreviewFailedDownload")?.addEventListener("click",()=>ctx.downloadRecord(entry.baseKey||entry.storageKey,entry.filename||"document").catch(e=>ctx.toast?.(e.message,"error")));
    }
  }

  function formatSize(value){return typeof value==="number"?ctx.formatBytes(value):String(value||"—")}

  async function downloadAllRecordFiles(key){
    const present=(ctx.getExpandedFileMap().get(key)||[]).filter(entry=>entry.present);
    if(!present.length){ctx.toast("No uploaded files are available for this record.","info");return;}
    for(const entry of present)await ctx.downloadRecord(entry.baseKey||entry.storageKey,entry.filename);
    ctx.toast(`${present.length} file${present.length===1?"":"s"} queued for download.` ,"success");
  }

  async function downloadLatestForRecord(key){
    const entry=(ctx.getExpandedFileMap().get(key)||[]).find(item=>item.present);
    if(entry)await ctx.downloadRecord(entry.baseKey||entry.storageKey,entry.filename);
  }

  return {renderCards,previewRecord,previewRecordFile,downloadAllRecordFiles,downloadLatestForRecord,equalizeGroupCardHeights};
}
