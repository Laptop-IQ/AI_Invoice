const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { CatalogItem } = require("../models");
const { clean } = require("../utils/serialize");
const { objectId } = require("../utils/ids");

const router = express.Router();
router.use(requireAuth);

const idParam = z.object({ id: objectId });

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  rate: z.coerce.number().min(0).max(100_000_000).optional(),
  unit: z.string().trim().max(24).optional(),
});

const ser = (r) => ({ ...clean(r), rate: Number(r.rate) });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await CatalogItem.find({ user_id: req.user.id })
      .collation({ locale: "en" })
      .sort({ name: 1 })
      .lean();
    res.json({ items: rows.map(ser) });
  }),
);

router.post(
  "/",
  validate(itemSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const doc = await CatalogItem.create({
      user_id: req.user.id,
      name: b.name,
      description: b.description || "",
      rate: b.rate ?? 0,
      unit: b.unit || "",
    });
    res.status(201).json({ item: ser(doc.toObject()) });
  }),
);

router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(itemSchema.partial()),
  asyncHandler(async (req, res) => {
    const set = {};
    for (const f of ["name", "description", "rate", "unit"]) {
      if (req.body[f] !== undefined) set[f] = req.body[f];
    }
    if (!Object.keys(set).length) throw ApiError.badRequest("No fields to update");

    const item = await CatalogItem.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { $set: set },
      { new: true },
    ).lean();
    if (!item) throw ApiError.notFound("Item not found");
    res.json({ item: ser(item) });
  }),
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const r = await CatalogItem.deleteOne({ _id: req.params.id, user_id: req.user.id });
    if (!r.deletedCount) throw ApiError.notFound("Item not found");
    res.json({ ok: true });
  }),
);

module.exports = router;
