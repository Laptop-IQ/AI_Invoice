const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { Expense } = require("../models");
const { clean } = require("../utils/serialize");
const { objectId } = require("../utils/ids");
const { todayStr, monthKey } = require("../utils/dates");
const { round2 } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const idParam = z.object({ id: objectId });
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional();

const expenseSchema = z.object({
  vendor: z.string().trim().max(160).optional(),
  category: z.string().trim().max(60).optional(),
  expense_date: dateStr,
  amount: z.coerce.number().min(0).max(100_000_000).optional(),
  currency: z.string().trim().max(8).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const num = (v) => Number(v) || 0;
const ser = (r) => ({ ...clean(r), amount: num(r.amount) });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const all = await Expense.find({ user_id: uid })
      .sort({ expense_date: -1, created_at: -1 })
      .lean();

    let list = all;
    if (req.query.category && req.query.category !== "all") {
      list = list.filter((e) => e.category === req.query.category);
    }
    if (req.query.month) {
      list = list.filter((e) => e.expense_date.slice(0, 7) === String(req.query.month));
    }

    const thisMonth = monthKey(todayStr());
    const total = all.reduce((s, e) => s + num(e.amount), 0);
    const monthTotal = all
      .filter((e) => e.expense_date.slice(0, 7) === thisMonth)
      .reduce((s, e) => s + num(e.amount), 0);

    const categories = [...new Set(all.map((e) => e.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );

    res.json({
      expenses: list.map(ser),
      totals: { total: round2(total), thisMonth: round2(monthTotal) },
      categories,
    });
  }),
);

router.post(
  "/",
  validate(expenseSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const doc = await Expense.create({
      user_id: req.user.id,
      vendor: b.vendor || "",
      category: b.category || "General",
      expense_date: b.expense_date || todayStr(),
      amount: b.amount ?? 0,
      currency: b.currency || "USD",
      notes: b.notes || "",
    });
    res.status(201).json({ expense: ser(doc.toObject()) });
  }),
);

router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(expenseSchema.partial()),
  asyncHandler(async (req, res) => {
    const set = {};
    for (const f of ["vendor", "category", "expense_date", "amount", "currency", "notes"]) {
      if (req.body[f] !== undefined) set[f] = req.body[f];
    }
    if (!Object.keys(set).length) throw ApiError.badRequest("No fields to update");

    const exp = await Expense.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { $set: set },
      { new: true },
    ).lean();
    if (!exp) throw ApiError.notFound("Expense not found");
    res.json({ expense: ser(exp) });
  }),
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const r = await Expense.deleteOne({ _id: req.params.id, user_id: req.user.id });
    if (!r.deletedCount) throw ApiError.notFound("Expense not found");
    res.json({ ok: true });
  }),
);

module.exports = router;
