const { Client } = require("../models");
const { todayStr } = require("./dates");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function computeTotals(items, taxRate = 0, discount = 0) {
  const normItems = (items || []).map((it, i) => {
    const quantity = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    return {
      description: (it.description || "").toString(),
      quantity,
      rate,
      amount: round2(quantity * rate),
      position: it.position ?? i,
    };
  });

  const subtotal = round2(normItems.reduce((s, it) => s + it.amount, 0));
  const disc = Math.min(round2(Number(discount) || 0), subtotal);
  const taxableBase = round2(subtotal - disc);
  const taxAmount = round2((taxableBase * (Number(taxRate) || 0)) / 100);
  const total = round2(taxableBase + taxAmount);

  return { items: normItems, subtotal, discount: disc, taxAmount, total };
}

function effectiveStatus(invoice) {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "sent" && invoice.due_date) {
    if (String(invoice.due_date).slice(0, 10) < todayStr()) return "overdue";
  }
  return invoice.status;
}

// `row` must already be cleaned (see utils/serialize.js)
function serializeInvoice(row, withItems = false) {
  const { items, ...rest } = row;
  const num = (v) => (v == null ? 0 : Number(v));
  const base = {
    ...rest,
    tax_rate: num(rest.tax_rate),
    discount: num(rest.discount),
    subtotal: num(rest.subtotal),
    tax_amount: num(rest.tax_amount),
    total: num(rest.total),
  };
  base.effective_status = effectiveStatus(base);
  if (withItems) {
    base.items = (items || [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((it) => ({
        ...it,
        quantity: num(it.quantity),
        rate: num(it.rate),
        amount: num(it.amount),
      }));
  }
  return base;
}

// Adds client_name / client_company (and email + address when `full`)
// to already-cleaned invoice rows. Replaces the old SQL LEFT JOIN.
async function attachClients(rows, { full = false } = {}) {
  const ids = [...new Set(rows.map((r) => r.client_id).filter(Boolean))];
  const clients = ids.length
    ? await Client.find({ _id: { $in: ids } }).lean()
    : [];
  const byId = new Map(clients.map((c) => [String(c._id), c]));

  for (const r of rows) {
    const c = r.client_id ? byId.get(String(r.client_id)) : null;
    r.client_name = c ? c.name : null;
    r.client_company = c ? c.company : null;
    if (full) {
      r.client_email = c ? c.email : null;
      r.client_address = c ? c.address : null;
    }
  }
  return rows;
}

module.exports = {
  round2,
  computeTotals,
  effectiveStatus,
  serializeInvoice,
  attachClients,
};
