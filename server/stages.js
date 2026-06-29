// Shared status-flow definitions used across the backend.
const STAGES = [
  { key: 'inquiry',        label: 'Inquiry',                 owner: 'admin' },
  { key: 'quotation',      label: 'Quotation',               owner: 'admin' },
  { key: 'confirmed',      label: 'Confirmed',               owner: 'admin' },
  { key: 'layout_pattern', label: 'Layout / Pattern',        owner: 'graphic_artist' },
  { key: 'purchasing',     label: 'Purchasing',              owner: 'purchasing' },
  { key: 'printing',       label: 'Printing',                owner: 'printing' },
  { key: 'cutting_sewing', label: 'Cutting & Sewing',        owner: 'cutting_sewing' },
  { key: 'qa',             label: 'Quality Check',           owner: 'qa' },
  { key: 'ready',          label: 'Ready for Pickup/Delivery', owner: 'admin' },
  { key: 'delivered',      label: 'Delivered',               owner: 'admin' },
  { key: 'for_payment',    label: 'For Payment',             owner: 'finance' },
  { key: 'paid',           label: 'Paid',                    owner: 'finance' },
];

const STAGE_KEYS = STAGES.map((s) => s.key);

function nextStage(current) {
  const idx = STAGE_KEYS.indexOf(current);
  if (idx === -1 || idx === STAGE_KEYS.length - 1) return null;
  return STAGE_KEYS[idx + 1];
}

function stageMeta(key) {
  return STAGES.find((s) => s.key === key) || null;
}

module.exports = { STAGES, STAGE_KEYS, nextStage, stageMeta };
