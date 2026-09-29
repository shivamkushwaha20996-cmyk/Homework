import {isModuleEnabled} from '../module-manager.js';
import {LAB_SETUPS,LAB_EQUIPMENT,LAB_TROUBLESHOOTING} from './data.js';
import {MODEL_ORDER} from '../../../data/models.js';
import {saveFileVersion,getFile,listFileVersions,addAudit} from '../../database.js';
import {downloadBlob,formatBytes,toast} from '../../ui.js';

const AUTH_KEY='RND_AUTH_V3';
const STORAGE_KEY='MOBILE_RND_DB_DATA_V10';
const MODEL_LINKS_KEY='MOBILE_RND_LAB_MODEL_LINKS_V1';
const MAX_FILE_SIZE=500*1024*1024;
const ALLOWED=['pdf','doc','docx','ppt','pptx','xls','xlsx','csv','zip','png','jpg','jpeg','webp'];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let tab='setups',q='',selectedId='';
const modal=()=>document.getElementById('labKnowledgeModal'),body=()=>document.getElementById('labKnowledgeBody');
const isAdmin=()=>sessionStorage.getItem(AUTH_KEY)==='true';
const fileKey=id=>`LAB_${id}`;
const allItems=()=>[...LAB_SETUPS,...LAB_EQUIPMENT];
function modelCodes(){try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');return [...new Set([...MODEL_ORDER,...Object.keys(data||{})])]}catch{return MODEL_ORDER}}
function loadModelLinks(){try{return JSON.parse(localStorage.getItem(MODEL_LINKS_KEY)||'{}')||{}}catch{return {}}}
function linkedModels(id){return loadModelLinks()[id]||[]}
function saveModelLinks(id,models){const all=loadModelLinks();all[id]=[...new Set(models)];localStorage.setItem(MODEL_LINKS_KEY,JSON.stringify(all));}

function fileExt(name){return String(name||'').split('.').pop().toLowerCase()}
function card(x,f){const admin=isAdmin();return `<article class="lab-card"><button class="lab-card-main" data-lab-open="${esc(x.id)}"><span class="lab-card-icon"><i class="fa-solid ${x.icon}"></i></span><span class="lab-card-copy"><strong>${esc(x.name)}</strong><small>${esc(x.desc)}</small></span><span class="lab-rev">${esc(f?.versionLabel||x.revision)}</span><i class="fa-solid fa-chevron-right lab-arrow"></i></button><div class="lab-card-actions">${f?`<span class="lab-file-badge present"><i class="fa-solid fa-paperclip"></i> FILE</span><button type="button" class="lab-mini-btn" data-lab-download="${esc(x.id)}"><i class="fa-solid fa-download"></i> DOWNLOAD</button>`:`<span class="lab-file-badge missing"><i class="fa-solid fa-file-circle-xmark"></i> NO FILE</span>`}${admin?`<button type="button" class="lab-mini-btn admin" data-lab-upload="${esc(x.id)}"><i class="fa-solid fa-cloud-arrow-up"></i> ${f?'UPDATE':'UPLOAD'}</button>`:''}</div></article>`}
async function fileState(id){try{const versions=await listFileVersions(fileKey(id));if(versions.length)return versions[versions.length-1];return await getFile(fileKey(id))}catch{return null}}
async function renderLibrary(){
  const z=q.toLowerCase();
  const list=tab==='setups'?LAB_SETUPS:LAB_EQUIPMENT;
  if(tab==='troubleshooting'){
    body().innerHTML=`<div class="lab-section-head"><span class="lab-kicker">PROBLEM SOLVER</span><h3>Troubleshooting Guide</h3><p>Search symptoms and follow the check sequence.</p></div><div class="lab-trouble-list">${LAB_TROUBLESHOOTING.filter(x=>(x.symptom+' '+x.checks.join(' ')+' '+x.resolution).toLowerCase().includes(z)).map(x=>`<article class="lab-trouble"><h4><i class="fa-solid fa-triangle-exclamation"></i>${esc(x.symptom)}</h4><div class="lab-trouble-cols"><div><b>Checks</b><ul>${x.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div><div><b>Resolution</b><p>${esc(x.resolution)}</p></div></div></article>`).join('')}</div>`;
    return;
  }
  const filtered=list.filter(x=>(x.name+' '+x.desc).toLowerCase().includes(z));
  const map=new Map();
  await Promise.all(filtered.map(async x=>{const f=await fileState(x.id);if(f)map.set(fileKey(x.id),f)}));
  body().innerHTML=`<div class="lab-section-head"><span class="lab-kicker">${tab==='setups'?'TEST SETUP LIBRARY':'EQUIPMENT LIBRARY'}</span><h3>${tab==='setups'?'R&D Test Setups':'R&D Lab Equipment'}</h3><p>${tab==='setups'?'Model-linked setup knowledge, connections, work instructions, checklist and troubleshooting.':'Working manual, operating checks, calibration and related setups.'}</p></div><div class="lab-grid">${filtered.map(x=>card(x,map.get(fileKey(x.id)))).join('')}</div>`;
}
async function detail(id){
  const x=allItems().find(a=>a.id===id);if(!x)return;selectedId=id;
  const f=await fileState(id);if(selectedId!==id)return;
  const admin=isAdmin();
  const filePanel=f?`<div class="lab-file-panel present"><div><strong><i class="fa-solid fa-file-circle-check"></i> Knowledge File Available</strong><small>${esc(f.filename||'Uploaded file')} · ${formatBytes(f.size||0)}</small></div><div class="lab-file-actions"><button class="btn btn-light" data-lab-download="${esc(id)}"><i class="fa-solid fa-download"></i> Download</button>${admin?`<button class="btn btn-cyan" data-lab-upload="${esc(id)}"><i class="fa-solid fa-arrow-up-from-bracket"></i> Replace</button>`:''}</div></div>`:`<div class="lab-file-panel missing"><div><strong><i class="fa-solid fa-file-circle-xmark"></i> No knowledge file uploaded</strong><small>Upload a manual, setup guide, diagram, checklist or related document for this ${tab==='setups'?'test setup':'equipment'} item.</small></div>${admin?`<button class="btn btn-cyan" data-lab-upload="${esc(id)}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload File</button>`:`<span class="lab-admin-hint"><i class="fa-solid fa-lock"></i> Admin upload required</span>`}</div>`;
  body().innerHTML=`<div class="lab-detail"><button class="lab-back" data-lab-back><i class="fa-solid fa-arrow-left"></i> Back to library</button><div class="lab-detail-hero"><span class="lab-card-icon"><i class="fa-solid ${x.icon}"></i></span><div><span class="lab-kicker">R&D LAB TESTING SETUP</span><h3>${esc(x.name)}</h3><p>${esc(x.desc)}</p><small>Knowledge revision: ${esc(f?.versionLabel||x.revision)} · Linked models: ${linkedModels(id).length?linkedModels(id).map(esc).join(', '):'None selected'}</small></div></div>${filePanel}<section class="lab-model-links"><h4>Model Link</h4><p>Select the models this lab knowledge item applies to. The linkage is stored locally and can be changed without replacing the knowledge file.</p><div class="lab-model-link-list">${modelCodes().map(code=>`<label><input type="checkbox" data-lab-model-link="${esc(id)}" value="${esc(code)}" ${linkedModels(id).includes(code)?'checked':''}> <span>${esc(code)}</span></label>`).join('')}</div></section><div class="lab-detail-grid"><section><h4>Working Manual</h4><p>Purpose, pre-checks, operating sequence, acceptance criteria and revision-controlled work instruction.</p></section><section><h4>Setup Procedure / Checklist</h4><p>Step-by-step setup sequence, pre-test checklist, pass/fail checks and sign-off placeholders.</p></section><section><h4>Connections / Cable / Port</h4><p>From / To / cable / port / adapter / calibration path, with an approved connection map placeholder.</p></section><section><h4>Setup Photos / Diagrams</h4><p>Reserved attachment area for setup photographs, wiring diagrams and station illustrations.</p></section><section><h4>Common Problems / Troubleshooting</h4><p>Symptoms, probable causes, diagnostic checks and approved resolution steps.</p></section><section><h4>Model Link / Revision</h4><p>Link this knowledge item to one or more models and maintain future revisions without changing the core portal.</p></section></div></div>`;
}
async function upload(id,file){
  if(!isAdmin()){toast('Admin authentication is required to upload lab files.','error');return}
  if(!file)return;
  if(file.size>MAX_FILE_SIZE){toast('File exceeds the 500 MB limit.','error');return}
  const ext=fileExt(file.name);if(!ALLOWED.includes(ext)){toast(`Unsupported file type: .${ext||'unknown'}`,'error');return}
  try{const saved=await saveFileVersion(fileKey(id),file,{revision:`${Date.now()}`,note:'R&D Lab knowledge revision'});await addAudit('LAB_UPLOAD',{id,filename:file.name,size:file.size,type:file.type||'',versionKey:saved.key,revision:saved.record?.versionLabel||''});toast(`${file.name} uploaded to the R&D Lab Testing Setup.`,'success');await detail(id)}catch(err){console.error(err);toast('Lab file upload failed.','error')}
}
async function download(id){
  try{const latest=await fileState(id);if(!latest){toast('No uploaded file is available.','info');return}const f=await getFile(latest.key||fileKey(id));if(!f?.blob){toast('The latest knowledge file is incomplete or unavailable.','info');return}if(downloadBlob(f.blob,f.filename||latest.filename||'lab-knowledge-file')){await addAudit('LAB_DOWNLOAD',{id,filename:f.filename||latest.filename||''});toast('Download started.','success')}else toast('Browser blocked the download.','error')}catch(err){console.error(err);toast('Lab file download failed.','error')}
}
export function initLabKnowledge(){
  if(!isModuleEnabled('labKnowledge'))return;
  const b=document.getElementById('labKnowledgeBtn');if(!b)return;
  b.onclick=()=>{modal().classList.remove('hidden');renderLibrary()};
  modal()?.addEventListener('click',async e=>{
    if(e.target.closest('[data-close-lab]'))modal().classList.add('hidden');
    const t=e.target.closest('[data-lab-tab]');if(t){tab=t.dataset.labTab;document.querySelectorAll('[data-lab-tab]').forEach(x=>x.classList.toggle('active',x===t));renderLibrary();return}
    const o=e.target.closest('[data-lab-open]');if(o){await detail(o.dataset.labOpen);return}
    if(e.target.closest('[data-lab-back]')){await renderLibrary();return}
    const link=e.target.closest('[data-lab-model-link]');if(link){const id=link.dataset.labModelLink,models=[...document.querySelectorAll(`[data-lab-model-link="${CSS.escape(id)}"]:checked`)].map(x=>x.value);saveModelLinks(id,models);return}
    const up=e.target.closest('[data-lab-upload]');if(up){const input=document.createElement('input');input.type='file';input.accept=ALLOWED.map(x=>'.'+x).join(',');input.onchange=()=>upload(up.dataset.labUpload,input.files?.[0]);input.click();return}
    const down=e.target.closest('[data-lab-download]');if(down){await download(down.dataset.labDownload)}
  });
  document.getElementById('labSearch')?.addEventListener('input',e=>{q=e.target.value;clearTimeout(window.__labSearchTimer);window.__labSearchTimer=setTimeout(renderLibrary,120)});
  document.addEventListener('rnd-auth-changed',()=>{if(!modal()?.classList.contains('hidden'))renderLibrary()});
}
