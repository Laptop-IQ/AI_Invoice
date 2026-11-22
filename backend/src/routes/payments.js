const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { Payment, Invoice } = require("../models");
const { clean } = require("../utils/serialize");
const { objectId } = require("../utils/ids");
const { todayStr, monthKey } = require("../utils/dates");
const { round2, attachClients } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const idParam = z.object({ id: objectId });
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

const paymentSchema = z.object({
  invoiceId: objectId,
  amount: z.coerce.number().min(0.01).max(100_000_000),
  method: z.string().trim().max(40).optional(),
  paid_on: dateStr,
  notes: z.string().trim().max(500).optional(),
});

const num = (v) => Number(v) || 0;

// Marks the invoice paid once payments cover the total; reverts if they no longer do.
async function reconcileInvoice(invoiceId) {
  const inv = await Invoice.findById(invoiceId).lean();
  if (!inv) return;

  const [agg] = await Payment.aggregate([
    { $match: { invoice_id: inv._id } },
    { $group: { _id: null, paid: { $sum: "$amount" } } },
  ]);
  const paid = round2(agg ? agg.paid : 0);
  const total = round2(inv.total);

  if (paid >= total && total > 0) {
    await Invoice.updateOne(
      { _id: inv._id },
      { $set: { status: "paid", paid_at: inv.paid_at || new Date() } },
    );
  } else if (inv.status === "paid") {
    await Invoice.updateOne({ _id: inv._id }, { $set: { status: "sent", paid_at: null } });
  }
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = clean(
      await Payment.find({ user_id: req.user.id })
        .sort({ paid_on: -1, created_at: -1 })
        .lean(),
    );

    const invoices = clean(
      await Invoice.find({ _id: { $in: rows.map((p) => p.invoice_id) } })
        .select("invoice_number total client_id")
        .lean(),
    );
    await attachClients(invoices);
    const invById = new Map(invoices.map((i) => [i.id, i]));

    const thisMonth = monthKey(todayStr());
    const total = rows.reduce((s, p) => s + num(p.amount), 0);
    const monthTotal = rows
      .filter((p) => p.paid_on.slice(0, 7) === thisMonth)
      .reduce((s, p) => s + num(p.amount), 0);

    res.json({
      payments: rows.map((p) => {
        const inv = invById.get(p.invoice_id);
        return {
          ...p,
          amount: num(p.amount),
          invoice_number: inv ? inv.invoice_number : null,
          invoice_total: inv ? num(inv.total) : 0,
          client_name: inv ? inv.client_name : null,
        };
      }),
      totals: { total: round2(total), thisMonth: round2(monthTotal) },
    });
  }),
);

router.post(
  "/",
  validate(paymentSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const invoice = await Invoice.exists({ _id: b.invoiceId, user_id: req.user.id });
    if (!invoice) throw ApiError.notFound("Invoice not found");

    const doc = await Payment.create({
      user_id: req.user.id,
      invoice_id: b.invoiceId,
      amount: b.amount,
      method: b.method || "",
      paid_on: b.paid_on || todayStr(),
      notes: b.notes || "",
    });
    await reconcileInvoice(b.invoiceId);

    const payment = clean(doc.toObject());
    res.status(201).json({ payment: { ...payment, amount: num(payment.amount) } });
  }),
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const existing = await Payment.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!existing) throw ApiError.notFound("Payment not found");

    await Payment.deleteOne({ _id: existing._id });
    await reconcileInvoice(existing.invoice_id);

    res.json({ ok: true });
  }),
);

module.exports = router;
