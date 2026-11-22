const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { Invoice, Client } = require("../models");
const { clean } = require("../utils/serialize");
const { todayStr, monthKey, lastMonths } = require("../utils/dates");
const { round2, serializeInvoice, attachClients } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const today = todayStr();
    const thisMonth = monthKey(today);

    const [invoices, clientCount, recent] = await Promise.all([
      Invoice.find({ user_id: uid })
        .select("status total due_date issue_date paid_at")
        .lean(),
      Client.countDocuments({ user_id: uid }),
      Invoice.find({ user_id: uid }).sort({ created_at: -1 }).limit(5).lean(),
    ]);

    let totalRevenue = 0;
    let outstanding = 0;
    let paidThisMonth = 0;
    let overdueCount = 0;
    let overdueTotal = 0;

    for (const inv of invoices) {
      const t = inv.total || 0;
      if (inv.status === "paid") {
        totalRevenue += t;
        if (monthKey(inv.paid_at || inv.issue_date) === thisMonth) paidThisMonth += t;
      } else {
        outstanding += t;
      }
      if (inv.status === "sent" && inv.due_date && inv.due_date < today) {
        overdueCount += 1;
        overdueTotal += t;
      }
    }

    const revenueSeries = lastMonths(6).map((m) => {
      const paid = invoices.filter(
        (i) => i.status === "paid" && monthKey(i.paid_at || i.issue_date) === m.key,
      );
      return {
        label: m.label,
        ym: m.key,
        revenue: round2(paid.reduce((s, i) => s + (i.total || 0), 0)),
        count: paid.length,
      };
    });

    const recentInvoices = await attachClients(clean(recent));

    res.json({
      stats: {
        totalRevenue: round2(totalRevenue),
        outstanding: round2(outstanding),
        paidThisMonth: round2(paidThisMonth),
        overdueCount,
        overdueTotal: round2(overdueTotal),
        invoiceCount: invoices.length,
        clientCount,
      },
      revenueSeries,
      recentInvoices: recentInvoices.map((r) => serializeInvoice(r)),
    });
  }),
);

module.exports = router;
