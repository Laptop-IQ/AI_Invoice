const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { Invoice, Client, Payment } = require("../models");
const Settings = require("../models/Settings");
const { clean } = require("../utils/serialize");
const { objectId, isValidId, escapeRegex } = require("../utils/ids");
const { todayStr } = require("../utils/dates");
const { computeTotals, serializeInvoice, attachClients } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const idParam = z.object({ id: objectId });
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

const itemSchema = z.object({
  description: z.string().trim().max(500).default(""),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  rate: z.coerce.number().min(0).max(100_000_000).default(0),
});

// Fields without defaults (used as-is for PATCH so omitted fields stay untouched)
const invoiceFields = {
  client_id: objectId.nullish(),
  invoice_number: z.string().trim().max(40).optional(),
  status: z.enum(["draft", "sent", "paid"]),
  issue_date: dateStr,
  due_date: dateStr,
  currency: z.string().trim().max(8),
  tax_rate: z.coerce.number().min(0).max(100),
  discount: z.coerce.number().min(0).max(100_000_000),
  notes: z.string().trim().max(4000),
  terms: z.string().trim().max(2000),
  items: z.array(itemSchema),
};

const invoiceSchema = z.object({
  ...invoiceFields,
  status: invoiceFields.status.default("draft"),
  currency: invoiceFields.currency.default("USD"),
  tax_rate: invoiceFields.tax_rate.default(0),
  discount: invoiceFields.discount.default(0),
  notes: invoiceFields.notes.default(""),
  terms: invoiceFields.terms.default(""),
  items: invoiceFields.items.default([]),
});

const invoicePatchSchema = z.object(invoiceFields).partial();

async function loadInvoice(userId, id) {
  const row = await Invoice.findOne({ _id: id, user_id: userId }).lean();
  if (!row) throw ApiError.notFound("Invoice not found");
  const [invoice] = await attachClients([clean(row)], { full: true });
  return serializeInvoice(invoice, true);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, client_id, search, sort = "issue_date", order = "desc" } = req.query;

    const filter = { user_id: req.user.id };
    const and = [];
    const today = todayStr();

    if (client_id) {
      if (!isValidId(client_id)) throw ApiError.badRequest("Invalid client_id");
      filter.client_id = client_id;
    }

    if (status && status !== "all") {
      if (status === "overdue") {
        filter.status = "sent";
        filter.due_date = { $lt: today };
      } else if (status === "sent") {
        filter.status = "sent";
        and.push({ $or: [{ due_date: null }, { due_date: { $gte: today } }] });
      } else {
        filter.status = String(status);
      }
    }

    if (search) {
      const re = new RegExp(escapeRegex(String(search)), "i");
      const clientIds = await Client.find({ user_id: req.user.id, name: re }).distinct("_id");
      and.push({ $or: [{ invoice_number: re }, { client_id: { $in: clientIds } }] });
    }
    if (and.length) filter.$and = and;

    const sortCol = ["issue_date", "total", "due_date", "created_at"].includes(sort)
      ? sort
      : "issue_date";
    const sortSpec = { [sortCol]: order === "asc" ? 1 : -1 };
    if (sortCol !== "created_at") sortSpec.created_at = -1;

    const rows = await Invoice.find(filter).sort(sortSpec).lean();
    const invoices = await attachClients(clean(rows));

    res.json({ invoices: invoices.map((r) => serializeInvoice(r)) });
  }),
);

router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(req.user.id, req.params.id);
    res.json({ invoice });
  }),
);

router.post(
  "/",
  validate(invoiceSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;

    if (b.client_id) {
      const owns = await Client.exists({ _id: b.client_id, user_id: req.user.id });
      if (!owns) throw ApiError.badRequest("Referenced record does not exist");
    }

    const totals = computeTotals(b.items, b.tax_rate, b.discount);
    const invoiceNumber = b.invoice_number || (await Settings.nextInvoiceNumber(req.user.id));

    const doc = await Invoice.create({
      user_id: req.user.id,
      client_id: b.client_id || null,
      invoice_number: invoiceNumber,
      status: b.status,
      issue_date: b.issue_date || todayStr(),
      due_date: b.due_date || null,
      currency: b.currency,
      tax_rate: b.tax_rate,
      discount: totals.discount,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
      notes: b.notes,
      terms: b.terms,
      paid_at: b.status === "paid" ? new Date() : null,
      items: totals.items,
    });

    res.status(201).json({ invoice: await loadInvoice(req.user.id, doc._id) });
  }),
);

router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(invoicePatchSchema),
  asyncHandler(async (req, res) => {
    const existing = await Invoice.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!existing) throw ApiError.notFound("Invoice not found");

    const b = req.body;
    const taxRate = b.tax_rate ?? Number(existing.tax_rate);
    const discount = b.discount ?? Number(existing.discount);

    if (b.client_id) {
      const owns = await Client.exists({ _id: b.client_id, user_id: req.user.id });
      if (!owns) throw ApiError.badRequest("Referenced record does not exist");
    }

    let totals = null;
    if (b.items) totals = computeTotals(b.items, taxRate, discount);
    else if (b.tax_rate !== undefined || b.discount !== undefined) {
      totals = computeTotals(existing.items || [], taxRate, discount);
    }

    const set = {};
    if (b.client_id !== undefined) set.client_id = b.client_id || null;
    if (b.invoice_number !== undefined) set.invoice_number = b.invoice_number;
    if (b.status !== undefined) {
      set.status = b.status;
      set.paid_at = b.status === "paid" ? new Date() : null;
    }
    if (b.issue_date !== undefined) set.issue_date = b.issue_date;
    if (b.due_date !== undefined) set.due_date = b.due_date || null;
    if (b.currency !== undefined) set.currency = b.currency;
    if (b.notes !== undefined) set.notes = b.notes;
    if (b.terms !== undefined) set.terms = b.terms;
    if (totals) {
      set.tax_rate = taxRate;
      set.discount = totals.discount;
      set.subtotal = totals.subtotal;
      set.tax_amount = totals.taxAmount;
      set.total = totals.total;
      if (b.items) set.items = totals.items;
    }

    if (Object.keys(set).length) {
      await Invoice.updateOne({ _id: existing._id }, { $set: set });
    }

    res.json({ invoice: await loadInvoice(req.user.id, existing._id) });
  }),
);

router.patch(
  "/:id/status",
  validate(idParam, "params"),
  validate(z.object({ status: z.enum(["draft", "sent", "paid"]) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const updated = await Invoice.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { $set: { status, paid_at: status === "paid" ? new Date() : null } },
      { new: true },
    ).lean();
    if (!updated) throw ApiError.notFound("Invoice not found");
    res.json({ invoice: await loadInvoice(req.user.id, req.params.id) });
  }),
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const result = await Invoice.deleteOne({ _id: req.params.id, user_id: req.user.id });
    if (!result.deletedCount) throw ApiError.notFound("Invoice not found");
    // same as ON DELETE CASCADE
    await Payment.deleteMany({ invoice_id: req.params.id });
    res.json({ ok: true });
  }),
);

module.exports = router;
