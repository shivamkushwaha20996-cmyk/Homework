/*
 * Preview subsystem — Unified Document & Media Renderer
 * Responsibilities: identity resolution, binary hydration, MIME normalization,
 * format detection, OpenXML/ODF parsing, syntax formatting, and object-URL lifecycle.
 */
import {getLatestFile, getFile} from "../database.js";

const ZIP_OFFICE = {
  docx: "word/document.xml", docm: "word/document.xml", dotx: "word/document.xml", dotm: "word/document.xml",
  xlsx: "xl/workbook.xml", xlsm: "xl/workbook.xml", xltx: "xl/workbook.xml", xltm: "xl/workbook.xml",
  pptx: "ppt/presentation.xml", pptm: "ppt/presentation.xml", potx: "ppt/presentation.xml", potm: "ppt/presentation.xml", ppsx: "ppt/presentation.xml", ppsm: "ppt/presentation.xml",
  odt: "content.xml", ods: "content.xml", odp: "content.xml"
};
const OFFICE_ZIP = new Set(Object.keys(ZIP_OFFICE));
const IMAGE = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "avif"]);
const TEXT = new Set([
  "txt", "log", "md", "markdown", "json", "xml", "yaml", "yml", "ini", "cfg", "conf",
  "html", "htm", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "java", "c",
  "cpp", "h", "hpp", "sql", "sh", "bat", "ps1", "rtf", "diff", "patch", "inf",
  "properties", "gradle", "cmake", "mak", "mk", "out", "err", "asc", "net", "sch", "gbr", "ger"
]);
const AUDIO = new Set(["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"]);
const VIDEO = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
const SHEETS = new Set(["xlsx", "xlsm", "xltx", "xltm"]);
const DOCS = new Set(["docx", "docm", "dotx", "dotm"]);
const PPTS = new Set(["pptx", "pptm", "potx", "potm", "ppsx", "ppsm"]);
const ARCHIVES = new Set(["zip", "jar", "epub", "apk", "aar"]);

function extOf(name = "") {
  const clean = String(name).split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

function esc(value, escapeHtml) {
  return escapeHtml ? escapeHtml(String(value ?? "")) : String(value ?? "");
}

function zipLib() {
  const lib = globalThis.JSZip || window.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
  if (!lib) throw new Error("Bundled ZIP preview library (JSZip) is unavailable");
  return lib;
}

function getZipEntry(zip, targetPath) {
  if (!zip || !zip.files) return null;
  if (zip.files[targetPath] && !zip.files[targetPath].dir) return zip.files[targetPath];
  const normalizedTarget = targetPath.replace(/\\/g, "/").replace(/^\//, "").toLowerCase();
  for (const [key, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normKey = key.replace(/\\/g, "/").replace(/^\//, "").toLowerCase();
    if (normKey === normalizedTarget) return entry;
  }
  return null;
}

async function readZipText(zip, path) {
  const entry = getZipEntry(zip, path);
  if (!entry) throw new Error(`Missing package entry: ${path}`);
  return entry.async("text");
}

function xmlDoc(text) {
  const clean = String(text || "").trim().replace(/^\uFEFF/, "");
  const doc = new DOMParser().parseFromString(clean, "application/xml");
  if (doc.querySelector("parsererror")) {
    const fallback = new DOMParser().parseFromString(clean, "text/xml");
    if (!fallback.querySelector("parsererror")) return fallback;
    throw new Error("Invalid XML package content");
  }
  return doc;
}

function attr(node, name) {
  return node?.getAttribute(name) || "";
}

function parseEmu(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function ensureMimeBlob(blob, ext) {
  const mimeMap = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    avif: "image/avif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    mp4: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    txt: "text/plain",
    log: "text/plain",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript"
  };
  const expected = mimeMap[ext];
  if (expected && (!blob.type || blob.type === "application/octet-stream")) {
    return new Blob([blob], { type: expected });
  }
  return blob;
}

function delimitedHtml(text, ext, escapeHtml) {
  const rows = text.split(/\r?\n/).filter(r => r.length).slice(0, 200);
  let delimiter = ext === "tsv" ? "\t" : ",";
  if (ext === "csv" && rows.length && !rows[0].includes(",") && rows[0].includes(";")) {
    delimiter = ";";
  }
  const cells = rows.map(row => {
    const out = [];
    let cell = "", quoted = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i], next = row[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === delimiter && !quoted) { out.push(cell); cell = ""; continue; }
      cell += ch;
    }
    out.push(cell);
    return out.slice(0, 40);
  });
  if (!cells.length) return `<div class="preview-placeholder"><strong>Empty ${esc(ext.toUpperCase(), escapeHtml)} file</strong></div>`;
  const maxCols = Math.max(1, Math.min(40, cells.reduce((m, r) => Math.max(m, r.length), 0)));
  return `<div class="record-preview-table-wrap"><table class="record-preview-table"><tbody>${cells.map((row, i) => `<tr>${Array.from({ length: maxCols }, (_, j) => `<${i === 0 ? "th" : "td"}>${esc(row[j] ?? "", escapeHtml)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function renderSpreadsheet(zip, name, container, escapeHtml) {
  const shared = [];
  const sharedEntry = getZipEntry(zip, "xl/sharedStrings.xml");
  if (sharedEntry) {
    const sDoc = xmlDoc(await sharedEntry.async("text"));
    for (const si of [...sDoc.getElementsByTagNameNS("*", "si")]) {
      const str = [...si.getElementsByTagNameNS("*", "t")].map(t => t.textContent || "").join("");
      shared.push(str);
    }
  }

  const wb = xmlDoc(await readZipText(zip, "xl/workbook.xml"));
  const relsEntry = getZipEntry(zip, "xl/_rels/workbook.xml.rels");
  const relMap = new Map();
  if (relsEntry) {
    const rDoc = xmlDoc(await relsEntry.async("text"));
    for (const r of [...rDoc.getElementsByTagNameNS("*", "Relationship")]) {
      relMap.set(attr(r, "Id"), attr(r, "Target"));
    }
  }

  const sheets = [...wb.getElementsByTagNameNS("*", "sheet")].map(s => ({
    name: attr(s, "name") || "Sheet",
    rid: s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || attr(s, "r:id") || attr(s, "id")
  }));
  if (!sheets.length) throw new Error("Workbook contains no sheets");

  async function loadSheetHtml(targetPath, activeSheetName) {
    let normalized = targetPath.replace(/\\/g, "/").replace(/^\//, "");
    if (!normalized.toLowerCase().startsWith("xl/")) normalized = `xl/${normalized}`;
    const sheetXml = xmlDoc(await readZipText(zip, normalized));
    const rows = [];
    let maxCols = 0;

    for (const row of [...sheetXml.getElementsByTagNameNS("*", "row")].slice(0, 180)) {
      const cells = [];
      for (const c of [...row.getElementsByTagNameNS("*", "c")]) {
        const ref = attr(c, "r");
        const m = ref.match(/([A-Z]+)/);
        const col = m ? m[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : cells.length;
        let value = "";
        const t = attr(c, "t");
        const vNode = c.getElementsByTagNameNS("*", "v")[0];
        if (t === "s") {
          value = shared[Number(vNode?.textContent || -1)] ?? "";
        } else if (t === "inlineStr") {
          value = [...c.getElementsByTagNameNS("*", "t")].map(x => x.textContent || "").join("");
        } else if (t === "b") {
          value = vNode?.textContent === "1" ? "TRUE" : "FALSE";
        } else if (t === "e") {
          value = vNode?.textContent || "#ERROR";
        } else {
          value = vNode?.textContent || [...c.getElementsByTagNameNS("*", "t")].map(x => x.textContent || "").join("");
          if (!value) {
            const fNode = c.getElementsByTagNameNS("*", "f")[0];
            if (fNode?.textContent) value = `=${fNode.textContent}`;
          }
        }
        cells[col] = value;
      }
      maxCols = Math.max(maxCols, cells.length);
      rows.push(cells);
    }

    maxCols = Math.max(1, Math.min(35, maxCols));
    const sheetOptions = sheets.map(s => `<option value="${esc(relMap.get(s.rid) || `worksheets/sheet1.xml`, escapeHtml)}" ${s.name === activeSheetName ? "selected" : ""}>${esc(s.name, escapeHtml)}</option>`).join("");
    return `<div class="record-preview-table-wrap">
      <div class="preview-office-toolbar">
        <strong>${esc(name, escapeHtml)}</strong>
        <div class="preview-sheet-switch">
          <span>Sheets (${sheets.length}):</span>
          <select class="settings-select preview-sheet-select">${sheetOptions}</select>
        </div>
      </div>
      ${rows.length ? `<table class="record-preview-table spreadsheet-preview"><tbody>${rows.map((row, i) => `<tr>${Array.from({ length: maxCols }, (_, j) => `<${i === 0 ? "th" : "td"}>${esc(row[j] ?? "", escapeHtml)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table>` : `<div class="preview-placeholder"><strong>No readable cells found in this sheet</strong></div>`}
    </div>`;
  }

  const initialTarget = relMap.get(sheets[0].rid) || "worksheets/sheet1.xml";
  container.innerHTML = await loadSheetHtml(initialTarget, sheets[0].name);

  container.querySelector(".preview-sheet-select")?.addEventListener("change", async e => {
    const selectedTarget = e.target.value;
    const selectedName = sheets.find(s => (relMap.get(s.rid) || "worksheets/sheet1.xml") === selectedTarget)?.name || "Sheet";
    container.innerHTML = `<div class="preview-placeholder"><i class="fa-solid fa-spinner fa-spin"></i><strong>Switching sheet…</strong></div>`;
    container.innerHTML = await loadSheetHtml(selectedTarget, selectedName);
  });
}

async function renderDocx(zip, name, container, escapeHtml) {
  const xml = xmlDoc(await readZipText(zip, "word/document.xml"));
  const body = xml.getElementsByTagNameNS("*", "body")[0];
  const blocks = [];

  for (const child of [...(body?.children || [])]) {
    const tag = child.localName;
    if (tag === "tbl") {
      const rows = [...child.getElementsByTagNameNS("*", "tr")].map(r => {
        return [...r.getElementsByTagNameNS("*", "tc")].map(c => {
          return [...c.getElementsByTagNameNS("*", "t")].map(t => t.textContent || "").join("");
        });
      });
      blocks.push(`<table class="record-preview-table"><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c, escapeHtml)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (tag === "p") {
      let pText = "";
      for (const node of [...child.getElementsByTagNameNS("*", "*")]) {
        if (node.localName === "t") pText += node.textContent || "";
        else if (node.localName === "br" || node.localName === "cr") pText += "\n";
        else if (node.localName === "tab") pText += "\t";
      }
      if (!pText.trim()) continue;
      const pStyle = child.getElementsByTagNameNS("*", "pStyle")[0];
      const sVal = pStyle?.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val") || attr(pStyle, "w:val") || attr(pStyle, "val");
      let nodeTag = "p";
      if (/heading\s*1/i.test(sVal)) nodeTag = "h1";
      else if (/heading\s*2/i.test(sVal)) nodeTag = "h2";
      else if (/heading\s*3/i.test(sVal)) nodeTag = "h3";
      blocks.push(`<${nodeTag}>${esc(pText, escapeHtml)}</${nodeTag}>`);
    }
  }

  container.innerHTML = `<article class="record-preview-docx">
    <div class="preview-office-toolbar"><strong>${esc(name, escapeHtml)}</strong><span>DOCX</span></div>
    <div class="docx-content">${blocks.join("") || "<p>No readable document content found.</p>"}</div>
  </article>`;
}

async function renderPptx(zip, name, container, escapeHtml) {
  const presentation = xmlDoc(await readZipText(zip, "ppt/presentation.xml"));
  const size = presentation.getElementsByTagNameNS("*", "sldSz")[0];
  const cx = parseEmu(attr(size, "cx")) || 12192000;
  const cy = parseEmu(attr(size, "cy")) || 6858000;

  const paths = Object.keys(zip.files)
    .filter(p => /^ppt[\\/]slides[\\/]slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
      return na - nb;
    });

  if (!paths.length) throw new Error("No readable PPTX slides found");

  const slides = [];
  for (let i = 0; i < paths.length; i++) {
    const xml = xmlDoc(await readZipText(zip, paths[i]));
    const items = [];

    for (const shape of [...xml.getElementsByTagNameNS("*", "sp")]) {
      const paras = [...shape.getElementsByTagNameNS("*", "p")];
      const lines = [];
      for (const p of paras) {
        const text = [...p.getElementsByTagNameNS("*", "t")].map(t => t.textContent || "").join("");
        if (text.trim()) lines.push(text.trim());
      }
      const fullText = lines.join("\n");
      if (!fullText) continue;

      const xfrm = shape.getElementsByTagNameNS("*", "xfrm")[0];
      const off = xfrm?.getElementsByTagNameNS("*", "off")[0];
      const ext = xfrm?.getElementsByTagNameNS("*", "ext")[0];
      const extX = parseEmu(attr(ext, "cx"));
      const extY = parseEmu(attr(ext, "cy"));
      let boxStyle = "position:relative;margin:8px auto;width:94%;";
      if (extX > 0 && extY > 0 && cx > 0 && cy > 0) {
        const left = Math.max(0, Math.min(95, (parseEmu(attr(off, "x")) / cx) * 100));
        const top = Math.max(0, Math.min(95, (parseEmu(attr(off, "y")) / cy) * 100));
        const width = Math.max(5, Math.min(100 - left, (extX / cx) * 100));
        const height = Math.max(3, Math.min(100 - top, (extY / cy) * 100));
        boxStyle = `position:absolute;left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;`;
      }
      items.push(`<div class="pptx-text-box" style="${boxStyle}">${esc(fullText, escapeHtml)}</div>`);
    }

    for (const tbl of [...xml.getElementsByTagNameNS("*", "tbl")]) {
      const rows = [...tbl.getElementsByTagNameNS("*", "tr")].map(r => {
        return [...r.getElementsByTagNameNS("*", "tc")].map(c => {
          return [...c.getElementsByTagNameNS("*", "t")].map(t => t.textContent || "").join(" ").trim();
        });
      });
      if (rows.length && rows.some(r => r.some(Boolean))) {
        items.push(`<div class="pptx-table-wrap" style="position:relative;margin:10px auto;width:94%;"><table class="record-preview-table"><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c, escapeHtml)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      }
    }

    slides.push(`<section class="pptx-slide-preview">
      <div class="pptx-slide-number">SLIDE ${i + 1}</div>
      <div class="pptx-slide-canvas" style="aspect-ratio:${cx}/${cy}">${items.join("") || '<div class="pptx-empty-slide">No text or renderable text shapes found on this slide.</div>'}</div>
    </section>`);
  }

  container.innerHTML = `<div class="record-preview-pptx"><div class="preview-office-toolbar"><strong>${esc(name, escapeHtml)}</strong><span>${slides.length} slide${slides.length === 1 ? "" : "s"}</span></div>${slides.join("")}</div>`;
}

async function renderZipManifest(zip, name, container, escapeHtml) {
  const files = Object.values(zip.files).filter(x => !x.dir).slice(0, 300);
  container.innerHTML = `<div class="record-preview-table-wrap">
    <div class="preview-office-toolbar"><strong>${esc(name, escapeHtml)}</strong><span>${files.length} file${files.length === 1 ? "" : "s"} in archive</span></div>
    <table class="record-preview-table">
      <thead><tr><th>Path</th><th>Compressed</th><th>Uncompressed</th></tr></thead>
      <tbody>${files.map(x => `<tr><td>${esc(x.name, escapeHtml)}</td><td>${esc(x._data?.compressedSize ? `${(x._data.compressedSize / 1024).toFixed(1)} KB` : "—", escapeHtml)}</td><td>${esc(x._data?.uncompressedSize ? `${(x._data.uncompressedSize / 1024).toFixed(1)} KB` : "—", escapeHtml)}</td></tr>`).join("")}</tbody>
    </table>
  </div>`;
}

async function renderOpenDocument(zip, name, ext, container, escapeHtml) {
  const xml = xmlDoc(await readZipText(zip, "content.xml"));
  if (ext === "ods") {
    const rows = [];
    for (const r of [...xml.getElementsByTagNameNS("*", "table-row")].slice(0, 160)) {
      const vals = [...r.getElementsByTagNameNS("*", "table-cell")].map(c => [...c.getElementsByTagNameNS("*", "p")].map(p => p.textContent || "").join(" ").trim());
      if (vals.some(Boolean)) rows.push(vals);
    }
    const cols = Math.min(30, rows.reduce((m, r) => Math.max(m, r.length), 0));
    container.innerHTML = `<div class="record-preview-table-wrap"><div class="preview-office-toolbar"><strong>${esc(name, escapeHtml)}</strong><span>ODS Spreadsheet</span></div><table class="record-preview-table"><tbody>${rows.map((r, i) => `<tr>${Array.from({ length: cols }, (_, j) => `<${i === 0 ? "th" : "td"}>${esc(r[j] ?? "", escapeHtml)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return;
  }

  const body = xml.getElementsByTagNameNS("*", "body")[0];
  const items = [];
  for (const node of [...(body?.getElementsByTagNameNS("*", "*") || [])]) {
    if (node.localName === "h") {
      const txt = node.textContent?.trim();
      if (txt) items.push(`<h2>${esc(txt, escapeHtml)}</h2>`);
    } else if (node.localName === "p") {
      const txt = node.textContent?.trim();
      if (txt) items.push(`<p>${esc(txt, escapeHtml)}</p>`);
    }
  }

  container.innerHTML = `<article class="record-preview-docx"><div class="preview-office-toolbar"><strong>${esc(name, escapeHtml)}</strong><span>${ext.toUpperCase()}</span></div><div class="docx-content">${items.join("") || "<p>No readable OpenDocument content found.</p>"}</div></article>`;
}

function detect(ext, mime) {
  if (IMAGE.has(ext) || mime.startsWith("image/")) return "image";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (AUDIO.has(ext) || mime.startsWith("audio/")) return "audio";
  if (VIDEO.has(ext) || mime.startsWith("video/")) return "video";
  if (ext === "csv" || ext === "tsv" || mime.includes("csv") || mime.includes("tab-separated")) return "table";
  if (TEXT.has(ext) || mime.startsWith("text/")) return "text";
  if (SHEETS.has(ext)) return "spreadsheet";
  if (DOCS.has(ext)) return "document";
  if (PPTS.has(ext)) return "presentation";
  if (["odt", "ods", "odp"].includes(ext)) return "opendocument";
  if (ARCHIVES.has(ext) || mime === "application/zip" || mime === "application/epub+zip") return "archive";
  return "fallback";
}

function isZipFormat(ext, mime) {
  return OFFICE_ZIP.has(ext) || ARCHIVES.has(ext) || mime === "application/zip" || mime === "application/epub+zip";
}

function fallbackHtml(name, type, escapeHtml) {
  return `<div class="preview-placeholder preview-file-fallback">
    <i class="fa-solid fa-file-lines"></i>
    <strong>${esc(type, escapeHtml)} file</strong>
    <span class="preview-fallback-name">${esc(name, escapeHtml)}</span>
    <span>No safe in-browser renderer is available for this format. You can download the intact file directly to your system.</span>
    <div class="preview-fallback-actions">
      <button type="button" class="btn btn-dark" data-preview-download><i class="fa-solid fa-download"></i> Download File</button>
    </div>
  </div>`;
}

export async function resolvePreviewFile(baseKey) {
  const canonical = String(baseKey || "").split("::v::")[0];
  if (!canonical) throw new Error("Preview file identity is missing");
  let record = await getLatestFile(canonical);
  if (!record?.blob) record = await getFile(baseKey);
  if (!record?.blob && baseKey !== canonical) record = await getFile(canonical);
  if (!record?.blob) throw new Error("Stored binary is unavailable for this document slot");
  return { ...record, key: record.key || canonical, baseKey: canonical };
}

export async function renderPreview({ blob, name, container, escapeHtml, onDownload }) {
  if (!blob || !container) throw new Error("Preview target is unavailable");
  clearPreviewContainer(container);

  const ext = extOf(name);
  const mime = (blob.type || "").toLowerCase();
  const normalizedBlob = ensureMimeBlob(blob, ext);
  const kind = detect(ext, normalizedBlob.type?.toLowerCase() || mime);

  const objectUrl = () => {
    const url = URL.createObjectURL(normalizedBlob);
    container.dataset.previewObjectUrl = url;
    return url;
  };

  let zipPackage = null;
  if (isZipFormat(ext, mime)) {
    try {
      const buf = await normalizedBlob.arrayBuffer();
      zipPackage = await zipLib().loadAsync(buf);
    } catch (err) {
      console.warn("Package is not a standard ZIP archive", err);
    }
  }

  if (kind === "image") {
    container.innerHTML = `<img class="record-preview-image" src="${objectUrl()}" alt="${esc(name, escapeHtml)}">`;
    return { kind, ext };
  }
  if (kind === "pdf") {
    container.innerHTML = `<iframe class="record-preview-frame" src="${objectUrl()}" title="PDF preview"></iframe>`;
    return { kind, ext };
  }
  if (kind === "audio") {
    container.innerHTML = `<div class="preview-media"><i class="fa-solid fa-volume-high"></i><strong>${esc(name, escapeHtml)}</strong><audio controls preload="metadata" src="${objectUrl()}"></audio></div>`;
    return { kind, ext };
  }
  if (kind === "video") {
    container.innerHTML = `<div class="preview-media"><video controls preload="metadata" src="${objectUrl()}"></video><strong>${esc(name, escapeHtml)}</strong></div>`;
    return { kind, ext };
  }
  if (kind === "table") {
    container.innerHTML = delimitedHtml(await normalizedBlob.text(), ext || "csv", escapeHtml);
    return { kind, ext };
  }
  if (kind === "text") {
    let raw = (await normalizedBlob.text()).slice(0, 300000);
    if (ext === "json") {
      try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
    }
    container.innerHTML = `<pre class="record-preview-text">${esc(raw, escapeHtml)}</pre>`;
    return { kind, ext };
  }

  if (zipPackage) {
    if (kind === "spreadsheet") {
      await renderSpreadsheet(zipPackage, name, container, escapeHtml);
      return { kind, ext };
    }
    if (kind === "document") {
      await renderDocx(zipPackage, name, container, escapeHtml);
      return { kind, ext };
    }
    if (kind === "presentation") {
      await renderPptx(zipPackage, name, container, escapeHtml);
      return { kind, ext };
    }
    if (kind === "opendocument") {
      await renderOpenDocument(zipPackage, name, ext, container, escapeHtml);
      return { kind, ext };
    }
    if (kind === "archive") {
      await renderZipManifest(zipPackage, name, container, escapeHtml);
      return { kind, ext };
    }
  }

  container.innerHTML = fallbackHtml(name, (ext || mime.split("/").pop() || "file").toUpperCase(), escapeHtml);
  container.querySelector("[data-preview-download]")?.addEventListener("click", () => onDownload?.());
  return { kind, ext };
}

export function clearPreviewContainer(container) {
  if (!container) return;
  const url = container.dataset.previewObjectUrl;
  if (url) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  delete container.dataset.previewObjectUrl;
  container.innerHTML = "";
}
