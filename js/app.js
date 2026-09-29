import {MODEL_ORDER,RECORD_ORDER,CATEGORIES,CATEGORY_COLORS,createDefaultData} from "../data/models.js";
import {saveFile,saveFileVersion,getFile,getFiles,getLatestFile,resolveLatestFileMetadata,listFileVersions,listFileVersionsForBases,deleteAllFiles,deleteAuditLogs,addAudit,migrateFilePrefix,deleteFilePrefix} from "./database.js";
import {toast,escapeHtml,formatBytes,downloadBlob,downloadText} from "./ui.js";
import {createRecordSystem} from "./records/record-system.js?v=V8-PREVIEW-SETTINGS-FIX-2";

let fallbackDocumentIdCounter=0;
function createStableId(prefix="id"){return globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now().toString(36)}-${++fallbackDocumentIdCounter}`;}
const STORAGE_KEY="MOBILE_RND_DB_DATA_V1";
const PREF_KEY="MOBILE_RND_PREFS_V3";
const AUTH_KEY="RND_AUTH_V3";
const CUSTOM_MODELS_KEY="MOBILE_RND_CUSTOM_MODELS_V1";
const RENAMED_MODELS_KEY="MOBILE_RND_RENAMED_MODELS_V1";
function customModelCodes(){return readJson(CUSTOM_MODELS_KEY,[]).map(x=>String(x?.code||"").trim().toUpperCase()).filter(Boolean)}
function renamedModelMap(){return readJson(RENAMED_MODELS_KEY,{});}
function modelList(){const renamed=renamedModelMap();return [...MODEL_ORDER,...customModelCodes()].filter((m,i,a)=>a.indexOf(m)===i&&!renamed[m]&&data?.[m])}

function clone(value){return structuredClone(value)}

let data=loadData();
let prefs=loadPrefs();
let draftPrefs={...prefs};
let currentModel=modelList()[0];
let activeCategory="all", query="", sortMode="default", favoritesOnly=false;
let recentlyViewed=readJson("MOBILE_RND_RECENT_V1",[]);
let favorites=readJson("MOBILE_RND_FAVORITES_V1",[]);
let isAdmin=sessionStorage.getItem(AUTH_KEY)==="true";
let selectedFiles=[];
let uploadedKeys=new Set();
let uploadedFiles=new Map();
let uploadedSubpartFiles=new Map();
let expandedFileMap=new Map();
let expandedCards=new Set();

function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||"null");return value??fallback}catch{return fallback}}
function loadData(){
  try{
    const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
    const defaults=createDefaultData();
    const raw=stored&&typeof stored==="object"?stored:{};
    const normalized={};
    const modelCodes=[...new Set([...MODEL_ORDER,...customModelCodes(),...Object.keys(raw).filter(k=>raw[k]?.meta)])];

    for(const code of modelCodes){
      const saved=raw[code]&&typeof raw[code]==="object"?raw[code]:{};
      const template=defaults[code]||clone(defaults.A576);
      const templateItems=template.items||{};
      const savedItems=saved.items&&typeof saved.items==="object"?saved.items:{};
      const items={};

      for(const key of Object.keys(templateItems)){
        const baseItem=templateItems[key]||{};
        const savedItem=savedItems[key]&&typeof savedItems[key]==="object"?savedItems[key]:{};
        items[key]={...clone(baseItem),...clone(savedItem)};
        if(baseItem.subItems && !Array.isArray(savedItem.subItems)) items[key].subItems=clone(baseItem.subItems);
        if(baseItem.tags && !Array.isArray(savedItem.tags)) items[key].tags=clone(baseItem.tags);
      }

      for(const key of Object.keys(savedItems)){
        if(!items[key]) items[key]=clone(savedItems[key]);
      }

      const meta={...clone(template.meta||{}),...clone(saved.meta||{})};
      if(!meta.name) meta.name=`Galaxy ${code}`;
      normalized[code]={meta,items};
    }

    // Repair legacy/incomplete localStorage records in-place. This preserves
    // uploaded document metadata while restoring any missing default records.
    const normalizedJson=JSON.stringify(normalized);
    if(JSON.stringify(raw)!==normalizedJson) localStorage.setItem(STORAGE_KEY,normalizedJson);
    return normalized;
  }catch(error){
    console.warn("Stored dashboard data could not be normalized; using defaults.",error);
    return createDefaultData();
  }
}
function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
function loadPrefs(){try{return {...{theme:"light",accent:"cyan",density:"comfortable",motion:true},...JSON.parse(localStorage.getItem(PREF_KEY)||"{}")}}catch{return {theme:"light",accent:"cyan",density:"comfortable",motion:true}}}
function savePrefs(){localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}
function currentItems(){return data[currentModel].items}
function currentItemsFor(model){return data[model]?.items||{}}
function itemText(k,item){return [k,item.title,item.category,item.filename,item.uploadedFilename,...(item.tags||[]),...(item.subItems||[]).flatMap(s=>[s.name,s.filename,s.size]),...(item.mergedSources||[]).flatMap(s=>[s.name,s.filename,s.size,s.detail]),...(item.documents||[]).flatMap(s=>[s.name,s.filename,s.size,s.detail])].join(" ").toLowerCase()}
function markRecent(key){const id=`${currentModel}:${key}`;recentlyViewed=[id,...recentlyViewed.filter(x=>x!==id)].slice(0,8);localStorage.setItem("MOBILE_RND_RECENT_V1",JSON.stringify(recentlyViewed))}
function parseHash(){const m=location.hash.match(/^#record\/([^/]+)\/?([^/]*)$/);if(m&&modelList().includes(m[1])&&currentItemsFor(m[1])[m[2]]){currentModel=m[1];activeCategory="all";query="";renderAll();refreshUploadedFlags(currentModel);setTimeout(()=>focusRecord(m[2]),0)}}
function init(){
  populateUploadModels(currentModel);
  const last=localStorage.getItem("MOBILE_RND_LAST_MODEL_V1");if(last&&modelList().includes(last))currentModel=last;
  populateUploadModels(currentModel);
  const picker=document.getElementById("modelPickerInput"),menu=document.getElementById("modelPickerMenu"),toggle=document.getElementById("modelPickerToggle");
  if(picker){picker.value=currentModel;picker.addEventListener("input",()=>{renderModelPicker(picker.value);openModelPicker()});picker.addEventListener("focus",()=>{renderModelPicker(picker.value);openModelPicker()});picker.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const m=findModel(picker.value);if(m){setModel(m);closeModelPicker()}else toast("Select a valid model.","error")}if(e.key==="Escape")closeModelPicker()})}
  if(toggle)toggle.addEventListener("click",()=>{renderModelPicker("");toggleModelPicker()});
  document.addEventListener("click",e=>{if(!e.target.closest("#modelPickerWrap"))closeModelPicker()});
  const hw=document.getElementById("hardwareChecklistUploadBtn");if(hw)hw.addEventListener("click",()=>openUploadModal("T"));
  renderCategories();renderAll();bindEvents();applyPrefs();refreshUploadedFlags(currentModel);restoreSidebarState();parseHash();
}

function isKoreaMemberFile(record){
  const n=String(record?.filename||"").toLowerCase();
  return n.includes("korea") || n.includes("hq_roster") || n.includes("member_stage") || n.includes("member");
}
function recordStoredFor(model,key,storedMap){
  const primary=storedMap.get(`${model}_${key}`);
  if(key==="T"){
    if(primary && !isKoreaMemberFile(primary)) return primary;
    return storedMap.get(`${model}_U`) || primary;
  }
  if(key==="U"){
    if(primary && isKoreaMemberFile(primary)) return primary;
    const legacy=storedMap.get(`${model}_T`);
    return legacy && isKoreaMemberFile(legacy) ? legacy : (isKoreaMemberFile(primary) ? primary : null);
  }
  return primary;
}

async function renderFileSummary(){ return; }
function renderAll(){renderHero();renderCategories();renderCards();populateUploadRecords(document.getElementById("uploadModel")?.value||currentModel);renderAuth();renderRecent()}
async function refreshUploadedFlags(model=currentModel){
  const items=data[model]?.items||{};
  const keys=RECORD_ORDER.filter(k=>items[k]);
  const baseKeys=[];
  const slotDescriptors=new Map();
  for(const key of keys){
    const item=items[key];
    const slots=[];
    if(Array.isArray(item.mergedSources)){
      item.mergedSources.forEach(src=>slots.push({baseKey:`${model}_${src.key}`,sourceKey:src.key,selectorValue:src.key,name:src.name,detail:src.detail||"",filename:src.filename||"No document uploaded",size:src.size||"—"}));
    }else if(Array.isArray(item.subItems)&&item.subItems.length){
      item.subItems.forEach((sub,i)=>slots.push({baseKey:keyForSubpart(model,key,sub,i),sourceKey:key,selectorValue:String(i),subpartIndex:i,name:sub.name||`File ${i+1}`,detail:sub.note||"",filename:sub.filename||"No document uploaded",size:sub.size||"—"}));
    }else{
      slots.push({baseKey:`${model}_${key}`,sourceKey:key,selectorValue:"",name:item.title,detail:"",filename:key==="T"?"No checklist uploaded":item.filename||"No document uploaded",size:item.size||"—"});
    }
    if(Array.isArray(item.documents)){
      item.documents.forEach((doc,index)=>slots.push({
        baseKey:doc.storageKey||`${model}_${key}_document_${doc.id||index+1}`,
        sourceKey:key,selectorValue:`__doc__:${doc.id||index+1}`,documentId:doc.id||String(index+1),
        name:doc.name||doc.filename||`Document ${index+1}`,detail:doc.detail||"",filename:doc.filename||"No document uploaded",size:doc.size||"—",additionalDocument:true
      }));
    }
    slotDescriptors.set(key,slots);
    slots.forEach(slot=>baseKeys.push(slot.baseKey));
  }
  const uniqueBaseKeys=[...new Set(baseKeys)];
  const files=await getFiles(uniqueBaseKeys);
  let versionCache=new Map();
  try{versionCache=await listFileVersionsForBases(uniqueBaseKeys)}
  catch(err){console.warn("Version lookup failed",err);versionCache=new Map(uniqueBaseKeys.map(k=>[k,[]]))}
  const latestCache=new Map();
  await Promise.all(uniqueBaseKeys.map(async baseKey=>{try{latestCache.set(baseKey,await resolveLatestFileMetadata(baseKey))}catch(err){console.warn("Latest file lookup failed",baseKey,err);latestCache.set(baseKey,null)}}));
  if(model!==currentModel)return;
  uploadedFiles=new Map();
  uploadedKeys=new Set();
  expandedFileMap=new Map();
  for(const key of keys){
    const slots=slotDescriptors.get(key)||[];
    const entries=slots.map(slot=>{
      const versions=versionCache.get(slot.baseKey)||[];
      const latest=latestCache.get(slot.baseKey);
      const normalizedVersions=versions.map(v=>({
        key:v.key,
        versionLabel:v.versionLabel||"Version",
        filename:v.filename||slot.filename||"Uploaded document",
        size:v.size?formatBytes(v.size):slot.size||"—",
        note:v.note||"",
        updatedAt:v.updatedAt||""
      }));
      if(latest&&!normalizedVersions.some(v=>v.key===latest.key))normalizedVersions.push({key:latest.key,versionLabel:latest.versionLabel||"Current",filename:latest.filename||slot.filename||"Uploaded document",size:latest.size?formatBytes(latest.size):slot.size||"—",note:latest.note||"",updatedAt:latest.updatedAt||""});
      if(normalizedVersions.length)normalizedVersions.sort((a,b)=>String(a.updatedAt||"").localeCompare(String(b.updatedAt||""))||String(a.key).localeCompare(String(b.key)));
      const resolved=latest||(!normalizedVersions.length?files.get(slot.baseKey):normalizedVersions[normalizedVersions.length-1]);
      return {
        ...slot,
        present:!!resolved,
        versions:normalizedVersions,
        versionCount:normalizedVersions.length,
        baseKey:slot.baseKey,
        storageKey:resolved?.key||slot.baseKey,
        filename:resolved?.filename||slot.filename,
        size:resolved?.size?(typeof resolved.size==="number"?formatBytes(resolved.size):resolved.size):slot.size,
        versionLabel:resolved?.versionLabel||"",
        updatedAt:resolved?.updatedAt||""
      };
    });
    expandedFileMap.set(key,entries);
    const present=entries.find(x=>x.present);
    if(present) uploadedFiles.set(key,{...present,storageKey:present.storageKey});
    if(entries.some(x=>x.present)) uploadedKeys.add(key);
  }
  renderCards();
  const telemetryFiles=document.getElementById("telemetryFiles");
  if(telemetryFiles)telemetryFiles.textContent=String([...expandedFileMap.values()].flat().filter(x=>x.present).length);
}

function subpartId(sub,index){return String(sub?.id||sub?.name||`part-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||`part-${index+1}`}
function keyForSubpart(model,key,sub,index){const storageKey=key==="M"?"O":key;return `${model}_${storageKey}_${subpartId(sub,index)}`}
function renderHero(){const m=data[currentModel].meta;document.getElementById("activeModelCode").textContent=currentModel;document.getElementById("activeModelName").textContent=m.name;const modelType=m.modelType||(m.status==="Mass Production"?"Mass Production Model":"Development Model");document.getElementById("modelStatus").innerHTML=`<i class="fa-solid fa-circle"></i> ${escapeHtml(modelType)}`;document.getElementById("metaAp").textContent=m.ap||"—";document.getElementById("metaModelYear").textContent=m.modelYear||"—";document.getElementById("metaSielHwPic").textContent=m.sielHwPic||m.leadKorea||"—";document.getElementById("metaRfNetwork").textContent=m.rfNetwork||m.modem||"—"}
function renderCategories(){
  const tabColors={
    all:"#2563eb",
    Schematics:CATEGORY_COLORS["Schematics"],
    "RF & Wireless":CATEGORY_COLORS["RF & Wireless"],
    "Process & Tech":CATEGORY_COLORS["Process & Tech"],
    "Defect summary & SW process":CATEGORY_COLORS["Defect summary & SW process"],
    Specification:CATEGORY_COLORS.Specification
  };
  document.getElementById("categoryTabs").innerHTML=CATEGORIES.map(c=>`<button class="cat-btn ${activeCategory===c.key?"active":""}" data-cat="${escapeHtml(c.key)}" style="--cat-color:${tabColors[c.key]||"#2563eb"}"><i class="fa-solid ${escapeHtml(c.icon||"fa-folder")}"></i><span>${escapeHtml(c.label)}</span><b class="cat-count">${RECORD_ORDER.filter(k=>currentItems()[k]?.category===c.key).length|| (c.key==="all"?RECORD_ORDER.filter(k=>currentItems()[k]).length:0)}</b></button>`).join("")
}
function ensureSchematicCardsVisible(){
  const items=currentItems();
  // Custom models inherit the same record schema as the built-in models.
  // Never read an undefined per-model template here: that was the cause of
  // the Records workspace becoming unresponsive after selecting a new model.
  const defaults=createDefaultData().A576?.items||{};
  for(const key of ["A","B","C"]){
    const template=defaults[key];
    if(!template) continue;
    if(!items[key]) items[key]=clone(template);
    items[key].title=template.title;
    items[key].category="Schematics";
    items[key].icon=template.icon;
    items[key].tags=clone(template.tags||[]);
  }
}

function filteredEntries(){let arr=RECORD_ORDER.map(k=>[k,currentItems()[k]]).filter(([,i])=>i).filter(([k,i])=>{const cat=activeCategory==="all"||i.category===activeCategory;const fav=!favoritesOnly||favorites.includes(`${currentModel}:${k}`);return cat&&fav&&(!query||itemText(k,i).includes(query.toLowerCase()))});if(sortMode==="title")arr.sort((a,b)=>a[1].title.localeCompare(b[1].title));if(sortMode==="category")arr.sort((a,b)=>a[1].category.localeCompare(b[1].category)||a[0].localeCompare(b[0]));if(sortMode==="favorite")arr.sort((a,b)=>Number(favorites.includes(`${currentModel}:${b[0]}`))-Number(favorites.includes(`${currentModel}:${a[0]}`)));return arr}

const recordSystem=createRecordSystem({
  getCurrentModel:()=>currentModel,
  getCurrentItems:()=>currentItems(),
  getExpandedFileMap:()=>expandedFileMap,
  getLatestFile,
  getFavorites:()=>favorites,
  getExpandedCards:()=>expandedCards,
  getIsAdmin:()=>isAdmin,
  getActiveCategory:()=>activeCategory,
  getQuery:()=>query,
  getFavoritesOnly:()=>favoritesOnly,
  getSortMode:()=>sortMode,
  getFilteredEntries:filteredEntries,
  ensureSchematicCardsVisible,
  getCategoryColors:()=>CATEGORY_COLORS,
  getRecordOrder:()=>RECORD_ORDER,
  getFile,
  formatBytes,
  escapeHtml,
  downloadRecord,
  toast,
  openUploadModal,
  getMotion:()=>prefs.motion
});
const renderCards=()=>recordSystem.renderCards();
const previewRecord=(key)=>recordSystem.previewRecord(key);
const previewRecordFile=(key,baseKey)=>recordSystem.previewRecordFile(key,baseKey);
const downloadAllRecordFiles=(key)=>recordSystem.downloadAllRecordFiles(key);
const downloadLatestForRecord=(key)=>recordSystem.downloadLatestForRecord(key);

function renderAuth(){const slot=document.getElementById("adminAuthSlot");slot.innerHTML=isAdmin?`<div class="flex gap-1"><button id="uploadBtn" class="btn btn-cyan"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button><button id="addModelBtn" class="btn btn-dark"><i class="fa-solid fa-plus"></i> Model</button><button id="editModelBtn" class="btn btn-dark"><i class="fa-solid fa-pen-to-square"></i> Edit</button><button id="logoutBtn" class="header-icon-btn" title="Logout"><i class="fa-solid fa-right-from-bracket"></i></button></div>`:`<button id="loginBtn" class="btn btn-dark"><i class="fa-solid fa-lock"></i> Admin • Shivam</button>`;document.getElementById(isAdmin?"uploadBtn":"loginBtn").addEventListener("click",()=>isAdmin?openUploadModal():openModal("loginModal"));if(isAdmin)document.getElementById("addModelBtn")?.addEventListener("click",openAddModelModal);document.getElementById("editModelBtn")?.addEventListener("click",openEditModelModal);if(isAdmin)document.getElementById("logoutBtn").addEventListener("click",()=>{isAdmin=false;sessionStorage.removeItem(AUTH_KEY);renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session ended.","info")})}
function populateUploadModels(selected=currentModel){const el=document.getElementById("uploadModel");if(!el)return;el.innerHTML=modelList().map(m=>`<option value="${m}">${m} • ${escapeHtml(data[m].meta.name)}</option>`).join("");el.value=modelList().includes(selected)?selected:currentModel;populateUploadRecords(el.value)}
function populateUploadRecords(model=document.getElementById("uploadModel")?.value||currentModel,preferredKey=""){
  const el=document.getElementById("uploadRecord");if(!el)return;
  const items=data[model]?.items||{};
  el.innerHTML=RECORD_ORDER.filter(k=>items[k]).map(k=>`<option value="${k}">[${k}] ${escapeHtml(items[k].title)}</option>`).join("");
  if(preferredKey&&items[preferredKey])el.value=preferredKey;
  updateSubpartSelector();
}
function updateSubpartSelector(preferredIndex=""){
  const model=document.getElementById("uploadModel")?.value||currentModel,key=document.getElementById("uploadRecord")?.value,wrap=document.getElementById("uploadSubPartWrap"),el=document.getElementById("uploadSubPart");
  if(!wrap||!el)return;
  const item=data[model]?.items?.[key],sources=Array.isArray(item?.mergedSources)?item.mergedSources:[],subs=Array.isArray(item?.subItems)?item.subItems:[];
  const options=sources.length?sources.map(s=>({value:s.key,label:s.name,filename:s.filename})):subs.map((s,i)=>({value:String(i),label:s.name||`File ${i+1}`,filename:s.filename}));
  if(!sources.length&&!subs.length && item){options.push({value:"__base__",label:"Current document / new version",filename:item.filename||""})}
  (item?.documents||[]).forEach((doc,index)=>options.push({value:`__doc__:${doc.id||index+1}`,label:doc.name||doc.filename||`Additional document ${index+1}`,filename:doc.filename||""}));
  options.unshift({value:"__new__",label:"+ Add new document",filename:"Unlimited additional documents"});
  wrap.classList.remove("hidden");
  el.innerHTML=options.map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}${o.filename?` • ${escapeHtml(o.filename)}`:""}</option>`).join("");
  if(preferredIndex!==""&&options.some(o=>String(o.value)===String(preferredIndex)))el.value=String(preferredIndex);
}
function openUploadModal(recordKey="",subpartIndex=""){if(!isAdmin){toast("Admin authentication is required to upload documents.","error");return}const model=currentModel;populateUploadModels(model);populateUploadRecords(model,recordKey);updateSubpartSelector(subpartIndex);if(!subpartIndex){const uploadSubPart=document.getElementById("uploadSubPart");if(uploadSubPart)uploadSubPart.value="__new__";}resetSelectedFile();openModal("uploadModal")}

function resetSelectedFile(){selectedFiles=[];const input=document.getElementById("fileInput");if(input)input.value="";const name=document.getElementById("fileName");if(name)name.textContent="Drop files here or click to browse";const status=document.getElementById("uploadStatus");if(status)status.textContent="";const rev=document.getElementById("uploadRevision");if(rev)rev.value="";const note=document.getElementById("uploadNote");if(note)note.value=""}

function openModal(id){document.getElementById(id)?.classList.remove("hidden")}
function clearPreviewContainer(bodyId){const body=document.getElementById(bodyId);if(!body)return;const url=body.dataset.previewObjectUrl||body.dataset.objectUrl;if(url){try{URL.revokeObjectURL(url)}catch{}}delete body.dataset.previewObjectUrl;delete body.dataset.objectUrl;body.innerHTML=""}
function closeModal(id){document.getElementById(id)?.classList.add("hidden");if(id==="filePreviewModal")clearPreviewContainer("filePreviewBody");if(id==="recordPreviewModal")clearPreviewContainer("recordPreviewBody");if(id==="uploadModal")resetSelectedFile()}
function findModel(value){const v=String(value||"").trim().toUpperCase();return modelList().find(m=>m===v)||modelList().find(m=>m.toUpperCase()===v)||null}
function renderModelPicker(filter=""){const menu=document.getElementById("modelPickerMenu");if(!menu)return;const q=String(filter||"").trim().toLowerCase(),matches=modelList().filter(m=>!q||m.toLowerCase().includes(q)||data[m].meta.name.toLowerCase().includes(q));menu.innerHTML=`<div class="model-picker-label"><i class="fa-solid fa-list-check"></i><span>Select Model</span></div>`+(matches.length?matches.map(m=>`<button type="button" class="model-picker-option ${m===currentModel?"active":""}" data-picker-model="${m}" role="option" aria-selected="${m===currentModel}"><span class="model-picker-code">${m}</span><span class="model-picker-name">${escapeHtml(data[m].meta.name)}</span></button>`).join(""):`<div class="model-picker-empty">No model found</div>`);menu.querySelectorAll("[data-picker-model]").forEach(b=>b.addEventListener("click",()=>{setModel(b.dataset.pickerModel);closeModelPicker()}))}
function openModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.remove("hidden");i?.setAttribute("aria-expanded","true")}}
function closeModelPicker(){const m=document.getElementById("modelPickerMenu"),i=document.getElementById("modelPickerInput");if(m){m.classList.add("hidden");i?.setAttribute("aria-expanded","false")}}
function toggleModelPicker(){const m=document.getElementById("modelPickerMenu");if(m?.classList.contains("hidden"))openModelPicker();else closeModelPicker()}
function setModel(m){if(!modelList().includes(m))return;expandedCards.clear();currentModel=m;localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",m);activeCategory="all";query="";if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";favoritesOnly=false;sortMode="default";populateUploadModels(m);renderAll();refreshUploadedFlags(m);const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;renderModelPicker("");location.hash="";window.scrollTo({top:0,behavior:prefs.motion?"smooth":"auto"})}
function refreshDashboard(){
  // Re-read persisted application state, then rebuild every model-dependent view.
  // This is intentionally a full page reload so stale event handlers/DOM state
  // cannot survive a refresh. Stored models/documents are untouched.
  const target=currentModel;
  localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",target);
  window.location.reload();
}
function openRecord(key){
  const item=currentItems()?.[key];
  if(!item)return;
  expandedCards.add(key);
  markRecent(key);
  // Summary tiles must always reach their card, even when filters/search are active.
  activeCategory="all";
  query="";
  if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";
  favoritesOnly=false;
  sortMode="default";
  renderAll();
  location.hash=`record/${currentModel}/${key}`;
  renderRecent();
  requestAnimationFrame(()=>focusRecord(key));
}
function focusRecord(key){const el=document.getElementById(`record-${key}`);if(el){el.scrollIntoView({behavior:prefs.motion?"smooth":"auto",block:"center"});el.classList.add("record-focus");setTimeout(()=>el.classList.remove("record-focus"),1200)}}
function renderRecent(){const wrap=document.getElementById("recentList");if(!wrap)return;const panel=wrap.closest(".recent-panel");const items=recentlyViewed.map(id=>{const [m,k]=id.split(":");const item=currentItemsFor(m)[k];return item?{m,k,item}:null}).filter(Boolean);if(panel)panel.classList.toggle("hidden",!items.length);wrap.innerHTML=items.length?items.map(x=>`<button class="recent-item" data-recent-model="${x.m}" data-recent-key="${x.k}"><span>${x.m} · ${x.k}</span><strong>${escapeHtml(x.item.title)}</strong></button>`).join(""):""}

function bindEvents(){
  const engineeringTabsToggle=document.getElementById("engineeringTabsToggle"),engineeringTabsRow=document.getElementById("engineeringRecordsTabsRow"),engineeringTabsHidden=false;
  const applyEngineeringTabsState=(hidden)=>{
    engineeringTabsRow?.classList.toggle("tabs-hidden",hidden);
    engineeringTabsToggle?.setAttribute("aria-expanded",String(!hidden));
    if(engineeringTabsToggle)engineeringTabsToggle.innerHTML=`<i class="fa-solid fa-eye${hidden?"":"-slash"}"></i><span>${hidden?"Show Tabs":"Hide Tabs"}</span>`;
    engineeringTabsToggle?.setAttribute("title",hidden?"Show Engineering Records category tabs":"Hide Engineering Records category tabs");
  };
  applyEngineeringTabsState(engineeringTabsHidden);
  document.getElementById("sidebarCollapseBtn")?.addEventListener("click",()=>{document.body.classList.toggle("sidebar-collapsed");const collapsed=document.body.classList.contains("sidebar-collapsed");localStorage.setItem("MOBILE_RND_SIDEBAR_V1",collapsed?"collapsed":"expanded");document.getElementById("sidebarCollapseBtn").innerHTML=`<i class="fa-solid fa-angles-${collapsed?"right":"left"}"></i>`});
  document.getElementById("categoryTabs").addEventListener("click",e=>{const b=e.target.closest("[data-cat]");if(b){activeCategory=b.dataset.cat;expandedCards.clear();renderCategories();renderCards()}});
  document.getElementById("cardsGrid").addEventListener("click",e=>{
    const up=e.target.closest("[data-open-upload]");if(up){openUploadModal(up.dataset.openUpload,up.dataset.subpartIndex||"");return}
    const fav=e.target.closest("[data-favorite]");if(fav){toggleFavorite(fav.dataset.favorite);return}
    const previewFileBtn=e.target.closest("[data-preview-file]");if(previewFileBtn){previewRecordFile(previewFileBtn.dataset.previewFile,previewFileBtn.dataset.previewBaseKey);return}
    const previewRecordBtn=e.target.closest("[data-preview-record]");if(previewRecordBtn){previewRecord(previewRecordBtn.dataset.previewRecord);return}
    const latest=e.target.closest("[data-download-latest]");if(latest){downloadLatestForRecord(latest.dataset.downloadLatest);return}
    const d=e.target.closest("[data-download]");if(d){downloadRecord(d.dataset.download,d.dataset.filename);return}
    const o=e.target.closest("[data-open-record]");if(o){openRecord(o.dataset.openRecord);openPresentation(o.dataset.openRecord);return}
    const c=e.target.closest("[data-copy-record]");if(c){copyRecord(c.dataset.copyRecord);return}
    const l=e.target.closest("[data-link-record]");if(l){copyLink(l.dataset.linkRecord);return}
    const clr=e.target.closest("[data-clear-filters]");if(clr){clearFilters();return}
    const card=e.target.closest(".record-card");
    if(card&&!e.target.closest("button,a,input,select,textarea")){
      if(activeCategory!=="all") return;
      const key=card.dataset.record;if(expandedCards.has(key))expandedCards.delete(key);else expandedCards.add(key);renderCards();requestAnimationFrame(()=>document.getElementById(`record-${key}`)?.scrollIntoView({behavior:prefs.motion?"smooth":"auto",block:"nearest"}));
    }
  });
  document.getElementById("cardsGrid").addEventListener("keydown",e=>{const card=e.target.closest(".record-card");if(card&&(e.key==="Enter"||e.key===" ")&&!e.target.closest("button,input,select,textarea")){e.preventDefault();if(activeCategory!=="all")return;const key=card.dataset.record;if(expandedCards.has(key))expandedCards.delete(key);else expandedCards.add(key);renderCards();}});
  document.getElementById("copySpecsBtn").addEventListener("click",copySpecs);document.getElementById("refreshDashboardBtn")?.addEventListener("click",refreshDashboard);document.getElementById("exportJsonBtn").addEventListener("click",exportModel);document.getElementById("exportReportBtn").addEventListener("click",exportReport);document.getElementById("settingsBtn").addEventListener("click",openSettings);document.getElementById("themeBtn").addEventListener("click",()=>{prefs.theme=prefs.theme==="dark"?"light":"dark";savePrefs();draftPrefs={...prefs};applyPrefs()});document.getElementById("fullscreenBtn").addEventListener("click",toggleFullscreen);
  ["themeSelect","accentSelect","densitySelect","motionToggle"].forEach(id=>document.getElementById(id)?.addEventListener("change",syncDraftPrefs));
  document.getElementById("settingsApplyBtn")?.addEventListener("click",()=>applyDraftPrefs(false));document.getElementById("settingsOkBtn")?.addEventListener("click",()=>{applyDraftPrefs(true)});
  document.getElementById("engineeringSearch")?.addEventListener("input",e=>{query=e.target.value.trim().toLowerCase();renderCards()});
  document.getElementById("sortSelect").addEventListener("change",e=>{sortMode=e.target.value;renderCards()});document.getElementById("favoritesToggle").addEventListener("click",()=>{favoritesOnly=!favoritesOnly;document.getElementById("favoritesToggle").classList.toggle("active",favoritesOnly);renderCards()});document.getElementById("clearFiltersBtn").addEventListener("click",clearFilters);
  document.getElementById("prevRecordBtn").addEventListener("click",()=>navigateRecord(-1));document.getElementById("nextRecordBtn").addEventListener("click",()=>navigateRecord(1));document.getElementById("presentationBtn").addEventListener("click",()=>{const k=filteredEntries()[0]?.[0];if(k)openPresentation(k)});
  document.getElementById("recentList")?.addEventListener("click",e=>{const b=e.target.closest("[data-recent-key]");if(b){setModel(b.dataset.recentModel);setTimeout(()=>openRecord(b.dataset.recentKey),50)}});
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));document.querySelectorAll(".modal-backdrop").forEach(b=>b.addEventListener("click",()=>closeModal(b.parentElement.id)));
  document.getElementById("loginForm").addEventListener("submit",login);document.getElementById("addModelForm")?.addEventListener("submit",addModel);document.getElementById("editModelSelect")?.addEventListener("change",e=>loadEditModelFields(e.target.value));
  const passwordToggle=document.getElementById("passwordToggle");
  passwordToggle?.addEventListener("click",()=>{const input=document.getElementById("passwordInput"); const showing=input.type==="text"; input.type=showing?"password":"text"; passwordToggle.innerHTML=showing?'<i class="fa-solid fa-eye"></i>':'<i class="fa-solid fa-eye-slash"></i>'; passwordToggle.setAttribute("aria-label",showing?"Show password":"Hide password"); passwordToggle.title=showing?"Show password":"Hide password"});
  document.getElementById("uploadModel").addEventListener("change",e=>{populateUploadRecords(e.target.value);const first=document.getElementById("uploadRecord")?.value;if(first)document.getElementById("uploadRecord").value=first;updateSubpartSelector()});document.getElementById("uploadRecord").addEventListener("change",()=>updateSubpartSelector());
  document.getElementById("dropZone").addEventListener("click",()=>document.getElementById("fileInput").click());document.getElementById("dropZone").addEventListener("dragover",e=>{e.preventDefault();document.getElementById("dropZone").classList.add("drag-active")});document.getElementById("dropZone").addEventListener("dragleave",()=>document.getElementById("dropZone").classList.remove("drag-active"));document.getElementById("dropZone").addEventListener("drop",e=>{e.preventDefault();document.getElementById("dropZone").classList.remove("drag-active");selectFiles(e.dataTransfer.files)});document.getElementById("fileInput").addEventListener("change",e=>selectFiles(e.target.files));document.getElementById("uploadForm").addEventListener("submit",upload);
  document.getElementById("backupBtn").addEventListener("click",()=>downloadText(JSON.stringify(data,null,2),`MobileRD_Backup_${dateStamp()}.json`));document.getElementById("resetBtn").addEventListener("click",resetData);
  document.addEventListener("keydown",e=>{const tag=document.activeElement?.tagName||"",typing=/INPUT|TEXTAREA|SELECT/.test(tag);if(e.key==="Escape")document.querySelectorAll(".modal:not(.hidden)").forEach(m=>closeModal(m.id));if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("engineeringSearch")?.focus();return}if(e.key==="/"&&!typing){e.preventDefault();document.getElementById("engineeringSearch")?.focus();return}if(e.key.toLowerCase()==="f"&&!typing)toggleFullscreen();if(e.key.toLowerCase()==="p"&&!typing){e.preventDefault();document.getElementById("presentationBtn").click()}if((e.key==="ArrowLeft"||e.key==="ArrowRight")&&!typing&&!document.querySelector(".modal:not(.hidden)")){navigateRecord(e.key==="ArrowLeft"?-1:1)}});
}
function syncDraftPrefs(){draftPrefs={theme:document.getElementById("themeSelect").value,accent:document.getElementById("accentSelect").value,density:document.getElementById("densitySelect").value,motion:document.getElementById("motionToggle").checked}}
function openSettings(){draftPrefs={...prefs};applySettingsForm();openModal("settingsModal")}
function applySettingsForm(){document.getElementById("themeSelect").value=draftPrefs.theme;document.getElementById("accentSelect").value=draftPrefs.accent;document.getElementById("densitySelect").value=draftPrefs.density;document.getElementById("motionToggle").checked=draftPrefs.motion}
function applyDraftPrefs(closeAfter){syncDraftPrefs();prefs={...draftPrefs};savePrefs();applyPrefs();if(closeAfter)closeModal("settingsModal")}
function applyPrefs(){document.body.classList.toggle("no-motion",!prefs.motion);document.body.dataset.theme=prefs.theme;document.body.dataset.accent=prefs.accent;document.body.dataset.density=prefs.density;applySettingsForm();document.getElementById("themeIcon").className=`fa-solid fa-${prefs.theme==="dark"?"sun":"moon"}`}
function clearFilters(){query="";activeCategory="all";favoritesOnly=false;sortMode="default";document.getElementById("sortSelect").value="default";document.getElementById("engineeringSearch")?.setAttribute("value","");if(document.getElementById("engineeringSearch"))document.getElementById("engineeringSearch").value="";document.getElementById("favoritesToggle").classList.remove("active");renderCategories();renderCards()}
function toggleFavorite(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem("MOBILE_RND_FAVORITES_V1",JSON.stringify(favorites));renderCards();toast(favorites.includes(id)?"Added to favorites.":"Removed from favorites.","info")}
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{toast("Fullscreen is not available.","error")}}
function customModels(){return readJson(CUSTOM_MODELS_KEY,[]).filter(x=>x&&x.code&&data[x.code])}
function editableModels(){return modelList()}
function openAddModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}setModelAdminFormMode("add");document.getElementById("addModelForm")?.reset();document.getElementById("addModelError")?.classList.add("hidden");openModal("addModelModal")}
function openEditModelModal(){if(!isAdmin){toast("Admin authentication is required.","error");return}const models=editableModels();if(!models.length){toast("No editable model is available.","info");return}setModelAdminFormMode("edit");populateEditModelSelect(models[0]);openModal("addModelModal")}
function setModelAdminFormMode(mode){const edit=mode==="edit",title=document.getElementById("addModelTitle"),desc=document.querySelector("#addModelModal .modal-description"),submit=document.getElementById("addModelSubmit"),icon=document.querySelector("#addModelModal .modal-icon i"),wrap=document.getElementById("editModelSelectWrap"),code=document.getElementById("newModelCode"),help=document.getElementById("addModelHelp");if(title)title.textContent=edit?"Edit Existing Model":"Add New Model";if(desc)desc.textContent=edit?"Admin-only model update. Model code can be changed safely and associated stored files are migrated.":"Admin-only model registration. New models appear automatically in the model selector.";if(submit)submit.innerHTML=edit?'<i class="fa-solid fa-floppy-disk"></i> Save Updated Model':'<i class="fa-solid fa-plus"></i> Add Model';if(icon)icon.className=`fa-solid ${edit?"fa-pen-to-square":"fa-square-plus"}`;wrap?.classList.toggle("hidden",!edit);if(code)code.readOnly=false;const del=document.getElementById("deleteModelBtn");if(del){del.classList.toggle("hidden",!edit);del.onclick=deleteSelectedModel;}if(help)help.innerHTML=edit?'<i class="fa-solid fa-database"></i> Model code is editable. Stored document/version keys are migrated automatically.':'<i class="fa-solid fa-database"></i> Model registration is stored locally in this browser and survives page reloads.';["newModelName","newModelProcessor","newModelYear","newModelPic","newModelRf","newModelType"].forEach(id=>document.getElementById(id)?.toggleAttribute("required",!edit||id!=="newModelPic"));document.getElementById("addModelForm")?.setAttribute("data-mode",mode)}
function populateEditModelSelect(selected=""){const el=document.getElementById("editModelSelect");if(!el)return;const models=editableModels();el.innerHTML=models.map(code=>`<option value="${escapeHtml(code)}">${escapeHtml(code)} • ${escapeHtml(data[code]?.meta?.name||code)}</option>`).join("");if(selected&&models.includes(selected))el.value=selected;loadEditModelFields(el.value)}
function loadEditModelFields(code){const model=data[code];if(!model)return;document.getElementById("newModelCode").value=code;document.getElementById("newModelName").value=model.meta?.name||"";document.getElementById("newModelProcessor").value=model.meta?.ap||"";document.getElementById("newModelYear").value=model.meta?.modelYear||"";document.getElementById("newModelPic").value=model.meta?.sielHwPic||model.meta?.leadKorea||"";document.getElementById("newModelRf").value=model.meta?.rfNetwork||model.meta?.modem||"";document.getElementById("newModelType").value=model.meta?.modelType||(model.meta?.status==="Mass Production"?"Mass Production Model":"Development Model")}
async function addModel(e){
  e.preventDefault();if(!isAdmin)return;
  const form=document.getElementById("addModelForm"),mode=form?.dataset.mode||"add",oldCode=document.getElementById("editModelSelect")?.value||"",code=document.getElementById("newModelCode").value.trim().toUpperCase(),name=document.getElementById("newModelName").value.trim(),processor=document.getElementById("newModelProcessor").value.trim(),modelYear=document.getElementById("newModelYear").value.trim(),pic=document.getElementById("newModelPic").value.trim(),rf=document.getElementById("newModelRf").value.trim(),modelType=document.getElementById("newModelType").value,err=document.getElementById("addModelError");
  const fail=msg=>{err.textContent=msg;err.classList.remove("hidden")};
  if(!/^[A-Z][A-Z0-9_-]{1,23}$/.test(code))return fail("Use a valid model code (2–24 characters, letters/numbers/_/-). ");
  if(!name||!processor||!modelYear||!rf||!["Development Model","Mass Production Model"].includes(modelType)||(mode!=="edit"&&!pic))return fail("Complete all required model information fields.");
  if(mode==="edit"){
    if(!oldCode||!modelList().includes(oldCode)||!data[oldCode])return fail("Select a valid existing model to edit.");
    if(code!==oldCode&&modelList().includes(code))return fail("That model code already exists. Choose another code.");
    const model=data[oldCode];model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
    if(code!==oldCode){
      data[code]=model;delete data[oldCode];
      const custom=readJson(CUSTOM_MODELS_KEY,[]),idx=custom.findIndex(x=>x.code===oldCode);if(idx>=0)custom[idx]={...custom[idx],code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType};else custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});
      const renamed=renamedModelMap();if(MODEL_ORDER.includes(oldCode))renamed[oldCode]=code;
      await migrateFilePrefix(oldCode,code);
      if(currentModel===oldCode){currentModel=code;localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",code)}
      localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));if(MODEL_ORDER.includes(oldCode))localStorage.setItem(RENAMED_MODELS_KEY,JSON.stringify(renamed));
      saveData();closeModal("addModelModal");setModel(code);toast(`${oldCode} renamed to ${code} and stored document keys migrated.`,'success');addAudit("MODEL_RENAME",{from:oldCode,to:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});return;
    }
    const custom=readJson(CUSTOM_MODELS_KEY,[]),idx=custom.findIndex(x=>x.code===oldCode);if(idx>=0)custom[idx]={...custom[idx],code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType};else custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));saveData();closeModal("addModelModal");setModel(code);toast(`${code} model details updated.`,'success');addAudit("MODEL_EDIT",{model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});return;
  }
  if(modelList().includes(code))return fail("This model code already exists. Use Edit Model to update its details.");
  const defaults=createDefaultData().A576,model=clone(defaults);model.meta={...model.meta,name,ap:processor,modelYear,sielHwPic:pic,rfNetwork:rf,modem:rf,leadKorea:pic,modelType,status:modelType==="Mass Production Model"?"Mass Production":"Development"};
  for(const item of Object.values(model.items)){if(item.filename)item.filename=item.filename.replaceAll("A576",code);item.subItems?.forEach(sub=>{if(sub.filename)sub.filename=sub.filename.replaceAll("A576",code)});item.mergedSources?.forEach(src=>{if(src.filename)src.filename=src.filename.replaceAll("A576",code)})}
  data[code]=model;const custom=readJson(CUSTOM_MODELS_KEY,[]);custom.push({code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom));saveData();closeModal("addModelModal");setModel(code);toast(`${code} added to the model selection list.`,'success');addAudit("MODEL_ADD",{model:code,name,processor,modelYear,sielHwPic:pic,rfNetwork:rf,modelType});
}
async function deleteSelectedModel(){if(!isAdmin)return;const code=document.getElementById("editModelSelect")?.value||"";if(!code||!data[code]){toast("Select a model to delete.","error");return}const custom=readJson(CUSTOM_MODELS_KEY,[]);if(!custom.some(x=>x.code===code)){toast("Built-in models cannot be deleted from the admin panel.","error");return}if(!confirm(`Delete model ${code} and all locally stored documents for this model? This cannot be undone.`))return;await deleteFilePrefix(code);const renamed=renamedModelMap(),original=Object.entries(renamed).find(([,newCode])=>newCode===code)?.[0];delete data[code];if(original&&MODEL_ORDER.includes(original)){delete renamed[original];data[original]=createDefaultData()[original]}localStorage.setItem(CUSTOM_MODELS_KEY,JSON.stringify(custom.filter(x=>x.code!==code)));localStorage.setItem(RENAMED_MODELS_KEY,JSON.stringify(renamed));saveData();const models=modelList();currentModel=models[0]||"";expandedCards.clear();activeCategory="all";query="";favoritesOnly=false;sortMode="default";localStorage.setItem("MOBILE_RND_LAST_MODEL_V1",currentModel);closeModal("addModelModal");populateUploadModels(currentModel);renderCategories();renderAll();renderModelPicker("");const picker=document.getElementById("modelPickerInput");if(picker)picker.value=currentModel;refreshUploadedFlags(currentModel);toast(original?`${code} removed and ${original} restored.`:`${code} deleted.`,'success');addAudit("MODEL_DELETE",{model:code,restoredModel:original||""})}

function login(e){e.preventDefault();const input=document.getElementById("passwordInput");const error=document.getElementById("loginError");if(input.value==="admin123"){isAdmin=true;sessionStorage.setItem(AUTH_KEY,"true");closeModal("loginModal");document.getElementById("passwordInput").value="";renderAuth();renderCards();document.dispatchEvent(new Event("rnd-auth-changed"));toast("Admin session authenticated.","success");addAudit("LOGIN")}else{error.classList.remove("hidden");input.classList.add("input-error");input.focus();setTimeout(()=>input.classList.remove("input-error"),700)}}
function selectFiles(fileList){
  if(!isAdmin){toast("Admin authentication is required to upload documents.","error");return}
  const files=[...(fileList||[])];
  if(!files.length)return;
  selectedFiles=[...selectedFiles,...files];
  const name=document.getElementById("fileName");
  if(name)name.textContent=selectedFiles.length?selectedFiles.map(f=>`${f.name} (${formatBytes(f.size)})`).join(" • "):"Drop files here or click to browse";
  const status=document.getElementById("uploadStatus");
  if(status)status.textContent=`${selectedFiles.length} file${selectedFiles.length===1?"":"s"} ready. No per-record document limit is enforced; browser storage capacity remains the only practical constraint.`;
}

async function upload(e){
  e.preventDefault();if(!selectedFiles.length){toast("Please select at least one file first.","error");return}
  const model=document.getElementById("uploadModel").value,key=document.getElementById("uploadRecord").value,note=document.getElementById("uploadNote").value.trim(),revision=document.getElementById("uploadRevision")?.value.trim()||"",item=data[model]?.items?.[key];
  if(!item){toast("Upload target is not available.","error");return}
  const selector=document.getElementById("uploadSubPart"),sourceValue=selector?.value||"__new__";
  let storageKey=`${model}_${key}`,targetLabel=item.title,source=null,isNewDocument=sourceValue==="__new__";
  if(!isNewDocument && sourceValue.startsWith("__doc__:")){
    const id=sourceValue.slice(7);
    const doc=(item.documents||[]).find((x,index)=>String(x.id||index+1)===id);
    if(!doc){toast("Additional document is no longer available.","error");return}
    storageKey=doc.storageKey||`${model}_${key}_document_${id}`;targetLabel=`${item.title} / ${doc.name||doc.filename||"Additional document"}`;
  }
  else if(!isNewDocument && Array.isArray(item.mergedSources)&&item.mergedSources.length){source=item.mergedSources.find(x=>String(x.key)===String(sourceValue))||item.mergedSources[0];storageKey=`${model}_${source.key}`;targetLabel=`${item.title} / ${source.name}`}
  else if(!isNewDocument && sourceValue==="__base__"){storageKey=`${model}_${key}`;targetLabel=`${item.title} / current document`}
  else if(!isNewDocument && Array.isArray(item.subItems)&&item.subItems.length){const idx=Number(sourceValue);source=item.subItems[idx];if(!source){toast("Select a document entry first or choose Add new document.","error");return}storageKey=keyForSubpart(model,key,source,idx);targetLabel=`${item.title} / ${source.name}`}
  const files=[...selectedFiles],btn=document.getElementById("saveUploadBtn"),progressWrap=document.getElementById("uploadProgressWrap"),progress=document.getElementById("uploadProgress"),status=document.getElementById("uploadStatus");btn.disabled=true;progressWrap.classList.remove("hidden");progress.style.width="0%";
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];if(status)status.textContent=`Saving ${i+1} of ${files.length}: ${file.name}`;
      if(isNewDocument){
        const id=(createStableId(`doc-${i}`));
        storageKey=`${model}_${key}_document_${id}`;
      }
      let newDocumentId="";
      if(isNewDocument){
        newDocumentId=createStableId(`doc-${i}`);
        storageKey=`${model}_${key}_document_${newDocumentId}`;
      }
      let saved;
      try{
        saved=await saveFileVersion(storageKey,file,{revision,note},(pct,part,total)=>{progress.style.width=`${pct}%`;if(status)status.textContent=`Saving ${file.name}… ${pct}% (${part}/${total} chunks)`});
      }catch(err){
        const detail=err?.name?`${err.name}: ${err.message||"storage operation failed"}`:(err?.message||String(err));
        console.error("IndexedDB file commit failed",err);
        if(status)status.textContent=`Upload failed for ${file.name}: ${detail}`;
        toast(`File was not saved: ${detail}`,"error");
        throw err;
      }
      if(isNewDocument){
        if(!Array.isArray(item.documents))item.documents=[];
        item.documents.push({id:newDocumentId,storageKey,name:file.name,filename:file.name,size:formatBytes(file.size),uploadedFilename:file.name,uploadedSize:formatBytes(file.size),updatedAt:new Date().toISOString(),detail:note,revision});
      }else if(source){source.uploadedFilename=file.name;source.uploadedSize=formatBytes(file.size);source.updatedAt=new Date().toISOString();if(note)source.detail=note}
      else {item.filename=file.name;item.size=formatBytes(file.size);item.uploadedFilename=file.name;item.uploadedSize=formatBytes(file.size);item.updatedAt=new Date().toISOString();if(note)item.note=note}
      try{await addAudit("UPLOAD",{model,key,subpart:source?.name||"Additional document",filename:file.name,size:file.size,versionKey:saved.key})}
      catch(auditErr){console.warn("File saved but audit logging failed",auditErr)}
    }
    try{saveData()}catch(metaErr){console.warn("File saved but local metadata persistence failed",metaErr)}
    try{
      // Refresh the document state without forcing the record into the compact
      // grid's narrow column. In ALL view the user can expand the record on
      // demand; in a category/group view the existing group layout remains
      // expanded naturally.
      await refreshUploadedFlags(currentModel);
      renderRecent();
      requestAnimationFrame(()=>focusRecord(key));
    }catch(uiErr){console.warn("File saved but UI refresh failed",uiErr)}
    closeModal("uploadModal");toast(`${files.length} file${files.length===1?"":"s"} saved to ${targetLabel}.`,`success`);resetSelectedFile();document.getElementById("uploadModel").value=currentModel;populateUploadRecords(currentModel);updateSubpartSelector();
  }catch(err){
    console.error("Upload operation stopped",err);
    if(status&&!String(status.textContent||"").startsWith("Upload failed")) status.textContent=`Upload stopped: ${err?.message||String(err)}`;
  }finally{btn.disabled=false;setTimeout(()=>progressWrap.classList.add("hidden"),300)}
}

function parseStorageIdentity(storageKey){
  const value=String(storageKey||"");
  const model=[...modelList()].sort((a,b)=>b.length-a.length).find(m=>value===m||value.startsWith(`${m}_`))||currentModel;
  const rest=value===model?"":value.slice(model.length+1);
  const key=rest.split("::v::")[0].split("_")[0]||"";
  const suffix=rest.includes("_")?rest.slice(rest.indexOf("_")+1):"";
  return {model,key,subpart:suffix};
}

async function downloadRecord(storageKey,filename){
  try{
    const baseKey=String(storageKey||"").split("::v::")[0];
    let record=await getLatestFile(baseKey);
    const identity=parseStorageIdentity(baseKey);
    if((identity.key==="T"||identity.key==="U") && record?.blob){
      const korea=isKoreaMemberFile(record);
      const expected=identity.key==="U";
      if(korea!==expected){
        const legacyBase=`${identity.model}_${expected?"T":"U"}`;
        const legacy=await getLatestFile(legacyBase);
        if(legacy?.blob && isKoreaMemberFile(legacy)===expected)record=legacy;
      }
    }
    if(!record?.blob) record=await getFile(storageKey);
    if(record?.blob){
      const ok=downloadBlob(record.blob,record.filename||filename);
      if(ok){
        const parsed=parseStorageIdentity(record.key||storageKey);
        await addAudit("DOWNLOAD",{model:parsed.model,key:parsed.key,subpart:parsed.subpart,filename:record.filename||filename});
        toast("Download started.","success");
        return;
      }
      toast("Browser blocked the download. Please allow downloads for this site.","error");
      return;
    }
  }catch(err){console.error("File download lookup failed",err)}
  toast("No uploaded file is available for this record. Admin must upload the document first.","info");
}
function recordData(key){return currentItems()[key]}
async function copyRecord(key){const i=recordData(key),entries=expandedFileMap.get(key)||[];const files=entries.map(x=>{const versions=(x.versions||[]).map(v=>`${v.versionLabel}: ${v.filename} | ${v.size}`).join("\n    ");return `${x.name}: ${x.present?"PRESENT":"MISSING"} | ${x.versionCount||0} version(s)${versions?`\n    ${versions}`:""}`}).join("\n");const text=`${currentModel}\n${i.title}\nCategory: ${i.category}\n${files}`;try{await navigator.clipboard.writeText(text);toast(`${i.title} copied.`,`success`)}catch{toast("Clipboard access is unavailable.","error")}}
async function copyLink(key){const url=`${location.href.split("#")[0]}#record/${currentModel}/${key}`;try{await navigator.clipboard.writeText(url);toast("Record link copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
async function copySpecs(){const m=data[currentModel].meta;try{await navigator.clipboard.writeText(`Model: ${currentModel} (${m.name})\nProcessor: ${m.ap}\nLaunch Year: ${m.modelYear||"—"}\nKorea Lead / SIEL HW PIC: ${m.sielHwPic||m.leadKorea||"—"}\nRF / Network: ${m.rfNetwork||m.modem||"—"}\nModel Type: ${m.modelType||(m.status==="Mass Production"?"Mass Production Model":"Development Model")}\nStatus: ${m.status}`);toast("Model specification copied.","success")}catch{toast("Clipboard access is unavailable.","error")}}
function exportModel(){downloadText(JSON.stringify(data[currentModel],null,2),`${currentModel}_Engineering_Master.json`);toast("Model JSON exported.","success")}
async function exportReport(){
  const m=data[currentModel].meta,entries=filteredEntries();
  const rows=await Promise.all(entries.map(async([k,i])=>{
    const slots=[];
    if(Array.isArray(i.mergedSources))i.mergedSources.forEach(src=>slots.push({baseKey:`${currentModel}_${src.key}`,label:src.name}));
    else if(Array.isArray(i.subItems))i.subItems.forEach((sub,index)=>slots.push({baseKey:keyForSubpart(currentModel,k,sub,index),label:sub.name}));
    else slots.push({baseKey:`${currentModel}_${k}`,label:i.title});
    const slotRows=await Promise.all(slots.map(async slot=>{
      const versions=await listFileVersions(slot.baseKey);
      const latest=versions[versions.length-1]||await getFile(slot.baseKey);
      return `  - ${slot.label} | ${latest?.filename||"MISSING"} | ${latest?.size?formatBytes(latest.size):"MISSING"} | ${versions.length|| (latest?1:0)} version(s)`;
    }));
    return [`${k} | ${i.title} | ${i.category}`,...slotRows].join("\n");
  }));
  const text=`MOBILE R&D ENGINEERING REPORT
================================
Model: ${currentModel} - ${m.name}
Status: ${m.status}
Processor: ${m.ap}
Modem/RF: ${m.modem}
SW Build: ${m.swVersion}
HQ Lead: ${m.leadKorea}

RECORDS
-------
${rows.join("\n")}

Generated: ${new Date().toISOString()}`;
  downloadText(text,`${currentModel}_Engineering_Report.txt`,"text/plain");
  toast("Engineering report exported.","success");
}
function openPresentation(key){const i=recordData(key);if(!i)return;document.getElementById("presentationModal")?.setAttribute("data-presentation-key",key);const entries=expandedFileMap.get(key)||[];document.getElementById("presentationContent").innerHTML=`<div class="presentation-code">${currentModel} · ${escapeHtml(i.title)}</div><h2>${escapeHtml(i.title)}</h2><div class="presentation-category">${escapeHtml(i.category)}</div><div class="presentation-tags">${(i.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div><div class="presentation-file">${entries.map(x=>`<strong>${escapeHtml(x.name)}</strong><span class="${x.present?"status-present":"status-missing"}">${x.present?"PRESENT":"MISSING"}</span><strong>File</strong><span>${escapeHtml(x.filename)}</span><strong>Size</strong><span>${escapeHtml(x.size)}</span>`).join("")}</div>`;openModal("presentationModal")}
function navigateRecord(delta){const arr=RECORD_ORDER.filter(k=>currentItems()[k]),modal=document.getElementById("presentationModal"),activeKey=modal?.classList.contains("hidden")?location.hash.split("/").pop():modal.dataset.presentationKey,idx=arr.indexOf(activeKey),next=arr[Math.max(0,Math.min(arr.length-1,(idx<0?0:idx)+delta))];if(!next)return;if(modal&&!modal.classList.contains("hidden")){openRecord(next);openPresentation(next)}else openRecord(next)}
async function resetData(){if(!confirm("Reset all local dashboard data and stored files? This cannot be undone."))return;try{await deleteAllFiles();await deleteAuditLogs();data=createDefaultData();localStorage.removeItem(CUSTOM_MODELS_KEY);localStorage.removeItem(RENAMED_MODELS_KEY);saveData();uploadedFiles=new Map();uploadedKeys=new Set();favorites=[];recentlyViewed=[];expandedCards.clear();localStorage.removeItem("MOBILE_RND_FAVORITES_V1");localStorage.removeItem("MOBILE_RND_RECENT_V1");currentModel=modelList()[0];activeCategory="all";query="";renderCategories();populateUploadModels(currentModel);renderAll();closeModal("settingsModal");toast("Local data reset to default dataset.","success")}catch(err){console.error("Reset failed",err);toast(`Reset failed: ${err?.message||String(err)}`,"error")}}
function dateStamp(){return new Date().toISOString().slice(0,10).replaceAll("-","")}
function restoreSidebarState(){if(localStorage.getItem("MOBILE_RND_SIDEBAR_V1")==="collapsed"){document.body.classList.add("sidebar-collapsed");document.getElementById("sidebarCollapseBtn").innerHTML='<i class="fa-solid fa-angles-right"></i>'}}

init();
// V61: wait for fonts/layout to settle, then perform one harmless final render.
// This reduces first-open layout shifts on wide desktop viewports.
window.addEventListener("load",()=>{
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    renderAll();
    window.dispatchEvent(new Event("portal-layout-ready"));
  }));
},{once:true});
document.addEventListener("click",event=>{
  const target=event.target.closest("button,.btn,.cat-btn,.download-btn,.header-icon-btn,.file-row");
  if(target){
    const now=performance.now(),last=Number(target.dataset.lastPortalClick||0);
    if(now-last<320){event.preventDefault();event.stopImmediatePropagation();return}
    target.dataset.lastPortalClick=String(now);
  }
},{capture:true});
document.addEventListener("click",event=>{const target=event.target.closest("button,.btn,.cat-btn,.download-btn,.header-icon-btn,.file-row");if(!target||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const rect=target.getBoundingClientRect(),ripple=document.createElement("span");ripple.className="portal-click-ripple";ripple.style.left=(event.clientX-rect.left)+"px";ripple.style.top=(event.clientY-rect.top)+"px";if(getComputedStyle(target).position==="static")target.style.position="relative";target.style.overflow="hidden";target.appendChild(ripple);setTimeout(()=>ripple.remove(),420)});
