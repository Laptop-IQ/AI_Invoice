const express = require("express");
const { z } = require("zod");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { uploadReceipt } = require("../middleware/upload");
const { aiLimiter } = require("../middleware/rateLimit");
const { Invoice, Client } = require("../models");
const { objectId } = require("../utils/ids");
const { todayStr, monthKey, daysBetween } = require("../utils/dates");
const { round2 } = require("../utils/invoice");
const Settings = require("../models/Settings");
const gemini = require("../services/geminiService");

const router = express.Router();
router.use(requireAuth);

router.post(
  "/receipt-parse",
  aiLimiter,
  uploadReceipt("file"),
  asyncHandler(async (req, res) => {
    const data = await gemini.parseReceipt({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    res.json({ result: data });
  }),
);

router.post(
  "/business-summary",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const today = todayStr();
    const now = new Date();
    const thisMonth = monthKey(today);
    const lastMonth = monthKey(
      todayStr(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    );

    const invoices = await Invoice.find({ user_id: uid })
      .select("status total due_date issue_date paid_at invoice_number client_id")
      .lean();

    const paidIn = (key) =>
      invoices
        .filter((i) => i.status === "paid" && monthKey(i.paid_at || i.issue_date) === key)
        .reduce((s, i) => s + (i.total || 0), 0);
    const overdue = invoices.filter(
      (i) => i.status === "sent" && i.due_date && i.due_date < today,
    );

    const top = overdue.sort((a, b) => b.total - a.total).slice(0, 3);
    const clientDocs = top.length
      ? await Client.find({ _id: { $in: top.map((i) => i.client_id).filter(Boolean) } })
          .select("name")
          .lean()
      : [];
    const names = new Map(clientDocs.map((c) => [String(c._id), c.name]));

    const data = {
      revenueThisMonth: round2(paidIn(thisMonth)),
      revenueLastMonth: round2(paidIn(lastMonth)),
      outstanding: round2(
        invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.total || 0), 0),
      ),
      overdueCount: overdue.length,
      overdueTotal: round2(overdue.reduce((s, i) => s + (i.total || 0), 0)),
      topOverdue: top.map((i) => ({
        client: i.client_id ? names.get(String(i.client_id)) || null : null,
        invoice: i.invoice_number,
        amount: Number(i.total),
        daysOverdue: daysBetween(today, i.due_date),
      })),
    };

    const summary = await gemini.businessSummary(data);
    res.json({ summary, data });
  }),
);

router.post(
  "/payment-reminder",
  aiLimiter,
  validate(
    z.object({
      invoiceId: objectId,
      tone: z.enum(["friendly", "firm", "final"]).default("friendly"),
    }),
  ),
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findOne({
      _id: req.body.invoiceId,
      user_id: req.user.id,
    }).lean();
    if (!invoice) throw ApiError.notFound("Invoice not found");

    const clientDoc = invoice.client_id
      ? await Client.findById(invoice.client_id).lean()
      : null;
    invoice.client_name = clientDoc ? clientDoc.name : null;
    invoice.client_email = clientDoc ? clientDoc.email : null;
    invoice.client_company = clientDoc ? clientDoc.company : null;

    const settings = await Settings.ensure(req.user.id);
    const daysOverdue = invoice.due_date
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(invoice.due_date).getTime()) / 86_400_000,
          ),
        )
      : 0;

    const draft = await gemini.paymentReminder({
      tone: req.body.tone,
      invoice: {
        number: invoice.invoice_number,
        total: Number(invoice.total),
        currency: invoice.currency,
        dueDate: invoice.due_date,
      },
      client: {
        name: invoice.client_name,
        company: invoice.client_company,
      },
      company: { name: settings.company_name || req.user.name },
      daysOverdue,
    });

    res.json({ draft, meta: { daysOverdue, to: invoice.client_email } });
  }),
);

router.post(
  "/write-note",
  aiLimiter,
  validate(
    z.object({
      kind: z.enum(["description", "terms"]).default("description"),
      prompt: z.string().trim().max(600).optional(),
      items: z
        .array(
          z.object({
            description: z.string().optional(),
            quantity: z.coerce.number().optional(),
            rate: z.coerce.number().optional(),
          }),
        )
        .optional(),
      client: z.object({ name: z.string().optional() }).partial().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const text = await gemini.writeNote(req.body);
    res.json({ text });
  }),
);

module.exports = router;
