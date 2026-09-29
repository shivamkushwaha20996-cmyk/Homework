export function toast(message,type="info"){
  let box=document.getElementById("toastContainer");
  if(!box){box=document.createElement("div");box.id="toastContainer";box.className="toast-container";document.body.appendChild(box)}
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  const icon=type==="success"?"fa-circle-check":type==="error"?"fa-circle-exclamation":"fa-circle-info";
  el.innerHTML=`<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
  box.appendChild(el);
  setTimeout(()=>{el.style.opacity="0";setTimeout(()=>el.remove(),180)},3200);
}
export function escapeHtml(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
export function formatBytes(bytes){
  if(!bytes)return "0 B";
  const units=["B","KB","MB","GB"]; const i=Math.floor(Math.log(bytes)/Math.log(1024));
  return `${(bytes/Math.pow(1024,i)).toFixed(i?1:0)} ${units[i]}`;
}
export function downloadBlob(blob,filename){
  try{
    const safeName=String(filename||"download").replace(/[\\/:*?"<>|]+/g,"_");
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=safeName;a.rel="noopener";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    return true;
  }catch(err){
    console.error("Download failed",err);
    return false;
  }
}
export function downloadText(text,filename,type="application/json"){
  downloadBlob(new Blob([text],{type}),filename);
}
