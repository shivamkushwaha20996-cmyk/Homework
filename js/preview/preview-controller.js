/*
 * Preview subsystem rebuilt as one boundary.
 * The dashboard/card structure stays outside this module.
 * Responsibilities: identity resolution, latest-file hydration, binary integrity,
 * format detection, rendering, cancellation and object-URL lifecycle.
 */
import {getLatestFile} from "../database.js";

const ZIP_OFFICE={
  docx:"word/document.xml", docm:"word/document.xml", dotx:"word/document.xml", dotm:"word/document.xml",
  xlsx:"xl/workbook.xml", xlsm:"xl/workbook.xml", xltx:"xl/workbook.xml", xltm:"xl/workbook.xml",
  pptx:"ppt/presentation.xml", pptm:"ppt/presentation.xml", potx:"ppt/presentation.xml", potm:"ppt/presentation.xml", ppsx:"ppt/presentation.xml", ppsm:"ppt/presentation.xml",
  odt:"content.xml", ods:"content.xml", odp:"content.xml"
};
const OFFICE_ZIP=new Set(Object.keys(ZIP_OFFICE));
const IMAGE=new Set(["png","jpg","jpeg","webp","gif","svg","bmp","ico","avif"]);
const TEXT=new Set(["txt","log","md","markdown","json","xml","yaml","yml","ini","cfg","conf","html","htm","css","js","mjs","cjs","ts","tsx","jsx","py","java","c","cpp","h","hpp","sql","sh","bat","ps1","rtf"]);
const AUDIO=new Set(["mp3","wav","ogg","oga","m4a","aac","flac"]);
const VIDEO=new Set(["mp4","webm","ogv","mov","m4v"]);
const SHEETS=new Set(["xlsx","xlsm","xltx","xltm"]);
const DOCS=new Set(["docx","docm","dotx","dotm"]);
const PPTS=new Set(["pptx","pptm","potx","potm","ppsx","ppsm"]);
const ARCHIVES=new Set(["zip","jar","epub"]);

function extOf(name=""){const clean=String(name).split(/[?#]/)[0],dot=clean.lastIndexOf(".");return dot>=0?clean.slice(dot+1).toLowerCase():""}
function esc(value,escapeHtml){return escapeHtml(String(value??""))}
function zipLib(){if(!window.JSZip)throw new Error("Bundled ZIP preview library is unavailable");return window.JSZip}
function xmlDoc(text){const doc=new DOMParser().parseFromString(text,"application/xml");if(doc.querySelector("parsererror"))throw new Error("Invalid XML package content");return doc}
function xmlTextNodes(root,localName){return [...root.getElementsByTagNameNS("*",localName)].map(n=>n.textContent.trim()).filter(Boolean)}
function attr(node,name){return node?.getAttribute(name)||""}
async function readZipText(zip,path){const f=zip.files[path];if(!f||f.dir)throw new Error(`Missing package entry: ${path}`);return f.async("text")}
function parseEmu(v){const n=Number(v||0);return Number.isFinite(n)?n:0}
function delimitedHtml(text,ext,escapeHtml){
  const rows=text.split(/\r?\n/).filter(r=>r.length).slice(0,160),delimiter=ext==="tsv"?"\t":",";
  const cells=rows.map(row=>{const out=[];let cell="",quoted=false;for(let i=0;i<row.length;i++){const ch=row[i],next=row[i+1];if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue}if(ch==='"'){quoted=!quoted;continue}if(ch===delimiter&&!quoted){out.push(cell);cell="";continue}cell+=ch}out.push(cell);return out.slice(0,30)});
  if(!cells.length)return `<div class="preview-placeholder"><strong>Empty ${esc(ext.toUpperCase(),escapeHtml)} file</strong></div>`;
  const maxCols=Math.min(30,cells.reduce((m,r)=>Math.max(m,r.length),0));
  return `<div class="record-preview-table-wrap"><table class="record-preview-table"><tbody>${cells.map((row,i)=>`<tr>${Array.from({length:maxCols},(_,j)=>`<${i===0?"th":"td"}>${esc(row[j]??"",escapeHtml)}</${i===0?"th":"td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
async function renderSpreadsheet(blob,name,container,escapeHtml){
  const zip=await zipLib().loadAsync(await blob.arrayBuffer()),shared=[];
  if(zip.files["xl/sharedStrings.xml"]){const doc=xmlDoc(await readZipText(zip,"xl/sharedStrings.xml"));for(const si of [...doc.getElementsByTagNameNS("*","si")])shared.push(xmlTextNodes(si,"t").join(""))}
  const wb=xmlDoc(await readZipText(zip,"xl/workbook.xml")),rels=zip.files["xl/_rels/workbook.xml.rels"]?xmlDoc(await readZipText(zip,"xl/_rels/workbook.xml.rels")):null;
  const relMap=new Map();if(rels)for(const r of [...rels.getElementsByTagNameNS("*","Relationship")])relMap.set(attr(r,"Id"),attr(r,"Target"));
  const sheets=[...wb.getElementsByTagNameNS("*","sheet")].map(s=>({name:attr(s,"name"),rid:attr(s,"{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")||attr(s,"r:id")}));
  const first=sheets[0];if(!first)throw new Error("Workbook contains no sheets");
  let target=relMap.get(first.rid)||"worksheets/sheet1.xml";target=target.replace(/^\//,"");if(!target.startsWith("xl/"))target=`xl/${target.replace(/^xl\//,"")}`;
  const sheet=xmlDoc(await readZipText(zip,target)),rows=[];let maxCols=0;
  for(const row of [...sheet.getElementsByTagNameNS("*","row")].slice(0,160)){const cells=[];for(const c of [...row.getElementsByTagNameNS("*","c")]){const ref=attr(c,"r"),m=ref.match(/([A-Z]+)/),col=m?m[1].split("").reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1:cells.length;let value="";const t=attr(c,"t"),v=c.getElementsByTagNameNS("*","v")[0];if(t==="s")value=shared[Number(v?.textContent||-1)]??"";else if(t==="inlineStr")value=xmlTextNodes(c,"t").join("");else value=v?.textContent||xmlTextNodes(c,"t").join("");cells[col]=value}maxCols=Math.max(maxCols,cells.length);rows.push(cells)}
  maxCols=Math.min(30,maxCols);container.innerHTML=`<div class="record-preview-table-wrap"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>${sheets.length} sheet${sheets.length===1?"":"s"} · ${esc(first.name,escapeHtml)}</span></div>${rows.length?`<table class="record-preview-table spreadsheet-preview"><tbody>${rows.map((row,i)=>`<tr>${Array.from({length:maxCols},(_,j)=>`<${i===0?"th":"td"}>${esc(row[j]??"",escapeHtml)}</${i===0?"th":"td"}>`).join("")}</tr>`).join("")}</tbody></table>`:`<div class="preview-placeholder"><strong>No readable cells found</strong></div>`}</div>`;
}
async function renderDocx(blob,name,container,escapeHtml){
  const zip=await zipLib().loadAsync(await blob.arrayBuffer()),xml=xmlDoc(await readZipText(zip,"word/document.xml")),body=xml.getElementsByTagNameNS("*","body")[0],blocks=[];
  for(const child of [...(body?.children||[])]){const tag=child.localName,text=xmlTextNodes(child,"t").join("");if(!text)continue;if(tag==="tbl"){const rows=[...child.getElementsByTagNameNS("*","tr")].map(r=>[...r.getElementsByTagNameNS("*","tc")].map(c=>xmlTextNodes(c,"t").join(" ")));blocks.push(`<table class="record-preview-table"><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c,escapeHtml)}</td>`).join("")}</tr>`).join("")}</tbody></table>`)}else blocks.push(`<p>${esc(text,escapeHtml)}</p>`)}
  container.innerHTML=`<article class="record-preview-docx"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>DOCX</span></div><div class="docx-content">${blocks.join("")||"<p>No readable document content found.</p>"}</div></article>`;
}
async function renderPptx(blob,name,container,escapeHtml){
  const zip=await zipLib().loadAsync(await blob.arrayBuffer()),presentation=xmlDoc(await readZipText(zip,"ppt/presentation.xml")),size=presentation.getElementsByTagNameNS("*","sldSz")[0],cx=parseEmu(attr(size,"cx"))||12192000,cy=parseEmu(attr(size,"cy"))||6858000;
  const paths=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/i.test(p)).sort((a,b)=>Number(a.match(/slide(\d+)/i)[1])-Number(b.match(/slide(\d+)/i)[1]));if(!paths.length)throw new Error("No PPTX slides found");
  const slides=[];for(let i=0;i<paths.length;i++){const xml=xmlDoc(await readZipText(zip,paths[i])),spTree=xml.getElementsByTagNameNS("*","spTree")[0],items=[];if(spTree)for(const shape of [...spTree.children].filter(x=>x.localName==="sp")){const text=xmlTextNodes(shape,"t").join(" ");if(!text)continue;const xfrm=shape.getElementsByTagNameNS("*","xfrm")[0],off=xfrm?.getElementsByTagNameNS("*","off")[0],ext=xfrm?.getElementsByTagNameNS("*","ext")[0],left=Math.max(0,Math.min(100,parseEmu(attr(off,"x"))/cx*100)),top=Math.max(0,Math.min(100,parseEmu(attr(off,"y"))/cy*100)),width=Math.max(4,Math.min(100-left,parseEmu(attr(ext,"cx"))/cx*100)),height=Math.max(3,Math.min(100-top,parseEmu(attr(ext,"cy"))/cy*100));items.push(`<div class="pptx-text-box" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%">${esc(text,escapeHtml)}</div>`)}slides.push(`<section class="pptx-slide-preview"><div class="pptx-slide-number">SLIDE ${i+1}</div><div class="pptx-slide-canvas" style="aspect-ratio:${cx}/${cy}">${items.join("")||'<div class="pptx-empty-slide">No text or renderable text shapes found on this slide.</div>'}</div></section>`)}
  container.innerHTML=`<div class="record-preview-pptx"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>${slides.length} slide${slides.length===1?"":"s"}</span></div>${slides.join("")}</div>`;
}
async function renderZipManifest(blob,name,container,escapeHtml){const zip=await zipLib().loadAsync(await blob.arrayBuffer()),files=Object.values(zip.files).filter(x=>!x.dir).slice(0,300);container.innerHTML=`<div class="record-preview-table-wrap"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>${files.length} file${files.length===1?"":"s"} in archive</span></div><table class="record-preview-table"><tbody><tr><th>Path</th><th>Type</th></tr>${files.map(x=>`<tr><td>${esc(x.name,escapeHtml)}</td><td>Archive entry</td></tr>`).join("")}</tbody></table></div>`}
async function renderOpenDocument(blob,name,ext,container,escapeHtml){
  const zip=await zipLib().loadAsync(await blob.arrayBuffer()),xml=xmlDoc(await readZipText(zip,"content.xml"));
  const paras=xmlTextNodes(xml,"p");
  const headings=xmlTextNodes(xml,"h");
  const cells=[...xml.getElementsByTagNameNS("*","table-cell")].map(c=>xmlTextNodes(c,"p").join(" ")).filter(Boolean);
  const text=[...headings,...paras];
  if(ext==="ods"&&cells.length){
    const rows=[];for(const row of [...xml.getElementsByTagNameNS("*","table-row")].slice(0,160)){const vals=[...row.getElementsByTagNameNS("*","table-cell")].map(c=>xmlTextNodes(c,"p").join(" "));if(vals.some(Boolean))rows.push(vals)}
    const cols=Math.min(30,rows.reduce((m,r)=>Math.max(m,r.length),0));container.innerHTML=`<div class="record-preview-table-wrap"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>OpenDocument spreadsheet</span></div><table class="record-preview-table"><tbody>${rows.map((r,i)=>`<tr>${Array.from({length:cols},(_,j)=>`<${i===0?"th":"td"}>${esc(r[j]??"",escapeHtml)}</${i===0?"th":"td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;return;
  }
  container.innerHTML=`<article class="record-preview-docx"><div class="preview-office-toolbar"><strong>${esc(name,escapeHtml)}</strong><span>${ext.toUpperCase()}</span></div><div class="docx-content">${text.length?text.map(x=>`<p>${esc(x,escapeHtml)}</p>`).join(""):cells.map(x=>`<p>${esc(x,escapeHtml)}</p>`).join("")||"<p>No readable OpenDocument content found.</p>"}</div></article>`;
}

function detect(ext,mime){
  if(IMAGE.has(ext)||mime.startsWith("image/"))return "image";
  if(ext==="pdf"||mime==="application/pdf")return "pdf";
  if(AUDIO.has(ext)||mime.startsWith("audio/"))return "audio";
  if(VIDEO.has(ext)||mime.startsWith("video/"))return "video";
  if(ext==="csv"||ext==="tsv"||mime.includes("csv")||mime.includes("tab-separated"))return "table";
  if(TEXT.has(ext)||mime.startsWith("text/"))return "text";
  if(SHEETS.has(ext))return "spreadsheet";
  if(DOCS.has(ext))return "document";
  if(PPTS.has(ext))return "presentation";
  if(["odt","ods","odp"].includes(ext))return "opendocument";
  if(ARCHIVES.has(ext)||mime==="application/zip"||mime==="application/epub+zip")return "archive";
  return "fallback";
}
function isZipFormat(ext,mime){return OFFICE_ZIP.has(ext)||ARCHIVES.has(ext)||mime==="application/zip"||mime==="application/epub+zip"}
async function inspectZip(blob,ext,mime){
  if(!isZipFormat(ext,mime))return null;
  const buf=await blob.arrayBuffer(),bytes=new Uint8Array(buf),hasLocal=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&(bytes[2]===0x03||bytes[2]===0x05||bytes[2]===0x07);
  if(!hasLocal)throw new Error(`Binary integrity check failed for .${ext||"package"}: ZIP signature is missing (stored ${bytes.length} bytes).`);
  try{return await zipLib().loadAsync(buf)}catch(error){throw new Error(`Binary integrity check failed for .${ext}: ${error?.message||"ZIP package is invalid"}`)}
}
function fallbackHtml(name,type,escapeHtml){return `<div class="preview-placeholder preview-file-fallback"><i class="fa-solid fa-file-lines"></i><strong>${esc(type,escapeHtml)} file</strong><span class="preview-fallback-name">${esc(name,escapeHtml)}</span><span>This file is stored correctly, but this browser workspace does not provide a safe visual renderer for this format. The original file remains available for download.</span><div class="preview-fallback-actions"><button type="button" class="btn btn-dark" data-preview-download><i class="fa-solid fa-download"></i> Download File</button></div></div>`}

export async function resolvePreviewFile(baseKey){
  const canonical=String(baseKey||"").split("::v::")[0];
  if(!canonical)throw new Error("Preview file identity is missing");
  const record=await getLatestFile(canonical);
  if(!record?.blob)throw new Error("Stored binary is unavailable for this document slot");
  if(Number.isFinite(Number(record.size))&&record.blob.size!==Number(record.size))throw new Error(`Stored binary size mismatch: metadata=${record.size}, reconstructed=${record.blob.size}`);
  return {...record,key:record.key||canonical,baseKey:canonical};
}

export async function renderPreview({blob,name,container,escapeHtml,onDownload}){
  if(!blob||!container)throw new Error("Preview target is unavailable");
  const previous=container.dataset.previewObjectUrl;if(previous){try{URL.revokeObjectURL(previous)}catch{}}delete container.dataset.previewObjectUrl;
  const objectUrl=()=>{const url=URL.createObjectURL(blob);container.dataset.previewObjectUrl=url;return url};
  const ext=extOf(name),mime=(blob.type||"").toLowerCase(),kind=detect(ext,mime);
  if(isZipFormat(ext,mime))await inspectZip(blob,ext,mime);
  if(kind==="image"){container.innerHTML=`<img class="record-preview-image" src="${objectUrl()}" alt="${esc(name,escapeHtml)}">`;return {kind,ext}}
  if(kind==="pdf"){container.innerHTML=`<iframe class="record-preview-frame" src="${objectUrl()}" title="PDF preview"></iframe>`;return {kind,ext}}
  if(kind==="audio"){const url=objectUrl();container.innerHTML=`<div class="preview-media"><i class="fa-solid fa-volume-high"></i><strong>${esc(name,escapeHtml)}</strong><audio controls preload="metadata" src="${url}"></audio></div>`;return {kind,ext}}
  if(kind==="video"){const url=objectUrl();container.innerHTML=`<div class="preview-media"><video controls preload="metadata" src="${url}"></video><strong>${esc(name,escapeHtml)}</strong></div>`;return {kind,ext}}
  if(kind==="table"){container.innerHTML=delimitedHtml(await blob.text(),ext||"csv",escapeHtml);return {kind,ext}}
  if(kind==="text"){container.innerHTML=`<pre class="record-preview-text">${esc((await blob.text()).slice(0,250000),escapeHtml)}</pre>`;return {kind,ext}}
  if(kind==="spreadsheet"){await renderSpreadsheet(blob,name,container,escapeHtml);return {kind,ext}}
  if(kind==="document"){await renderDocx(blob,name,container,escapeHtml);return {kind,ext}}
  if(kind==="presentation"){await renderPptx(blob,name,container,escapeHtml);return {kind,ext}}
  if(kind==="opendocument"){await renderOpenDocument(blob,name,ext,container,escapeHtml);return {kind,ext}}
  if(kind==="archive"){await renderZipManifest(blob,name,container,escapeHtml);return {kind,ext}}
  container.innerHTML=fallbackHtml(name,(ext||mime.split("/").pop()||"file").toUpperCase(),escapeHtml);container.querySelector("[data-preview-download]")?.addEventListener("click",()=>onDownload?.());return {kind,ext};
}

export function clearPreviewContainer(container){
  if(!container)return;
  const url=container.dataset.previewObjectUrl;if(url){try{URL.revokeObjectURL(url)}catch{}}delete container.dataset.previewObjectUrl;container.innerHTML="";
}
