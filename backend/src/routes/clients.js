const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { Client, Invoice } = require("../models");
const { clean } = require("../utils/serialize");
const { objectId } = require("../utils/ids");
const { round2 } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const idParam = z.object({ id: objectId });

const clientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().or(z.literal("")).optional(),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const FIELDS = ["name", "email", "company", "phone", "address", "notes"];

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const [rows, invoices] = await Promise.all([
      Client.find({ user_id: uid }).sort({ created_at: -1 }).lean(),
      Invoice.find({ user_id: uid, client_id: { $ne: null } })
        .select("client_id status total")
        .lean(),
    ]);

    const stats = new Map();
    for (const inv of invoices) {
      const key = String(inv.client_id);
      const s = stats.get(key) || { invoice_count: 0, total_billed: 0, outstanding: 0 };
      s.invoice_count += 1;
      s.total_billed += inv.total || 0;
      if (inv.status !== "paid") s.outstanding += inv.total || 0;
      stats.set(key, s);
    }

    const clients = clean(rows).map((c) => {
      const s = stats.get(c.id) || { invoice_count: 0, total_billed: 0, outstanding: 0 };
      return {
        ...c,
        invoice_count: s.invoice_count,
        total_billed: round2(s.total_billed),
        outstanding: round2(s.outstanding),
      };
    });
    res.json({ clients });
  }),
);

router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const client = await Client.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!client) throw ApiError.notFound("Client not found");

    const invoices = clean(
      await Invoice.find({ client_id: req.params.id, user_id: req.user.id })
        .select("invoice_number status issue_date due_date total currency created_at")
        .sort({ issue_date: -1, created_at: -1 })
        .lean(),
    );

    const totalBilled = invoices.reduce((s, i) => s + Number(i.total), 0);
    const outstanding = invoices
      .filter((i) => i.status !== "paid")
      .reduce((s, i) => s + Number(i.total), 0);

    res.json({
      client: clean(client),
      invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })),
      stats: { totalBilled, outstanding, count: invoices.length },
    });
  }),
);

router.post(
  "/",
  validate(clientSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const doc = await Client.create({
      user_id: req.user.id,
      name: b.name,
      email: b.email || "",
      company: b.company || "",
      phone: b.phone || "",
      address: b.address || "",
      notes: b.notes || "",
    });
    res.status(201).json({ client: clean(doc.toObject()) });
  }),
);

router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(clientSchema.partial()),
  asyncHandler(async (req, res) => {
    const set = {};
    for (const f of FIELDS) if (req.body[f] !== undefined) set[f] = req.body[f];
    if (!Object.keys(set).length) throw ApiError.badRequest("No fields to update");

    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { $set: set },
      { new: true },
    ).lean();
    if (!client) throw ApiError.notFound("Client not found");
    res.json({ client: clean(client) });
  }),
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const result = await Client.deleteOne({ _id: req.params.id, user_id: req.user.id });
    if (!result.deletedCount) throw ApiError.notFound("Client not found");
    // same as ON DELETE SET NULL
    await Invoice.updateMany(
      { client_id: req.params.id, user_id: req.user.id },
      { $set: { client_id: null } },
    );
    res.json({ ok: true });
  }),
);

module.exports = router;
