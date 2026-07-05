// Minimal CSV parser → array of objects keyed by the (lower-cased) header row.
// Handles quoted fields, escaped quotes ("") and commas/newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false, i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => { const o = {}; headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); }); return o; });
}

// Trigger a browser download of some text content.
export function downloadText(filename, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
