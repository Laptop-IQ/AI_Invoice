const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { Invoice, Expense, Client } = require("../models");
const { todayStr, monthKey, lastMonths, daysBetween } = require("../utils/dates");
const { round2 } = require("../utils/invoice");

const router = express.Router();
router.use(requireAuth);

const num = (v) => Number(v) || 0;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const today = todayStr();

    const [invoices, expenses] = await Promise.all([
      Invoice.find({ user_id: uid })
        .select("status total due_date issue_date paid_at client_id")
        .lean(),
      Expense.find({ user_id: uid }).select("amount expense_date").lean(),
    ]);

    const isOverdue = (i) => i.status === "sent" && i.due_date && i.due_date < today;
    const sum = (list, fn = (i) => i.total) => round2(list.reduce((s, i) => s + num(fn(i)), 0));

    const revenue = sum(invoices.filter((i) => i.status === "paid"));
    const outstanding = sum(invoices.filter((i) => i.status !== "paid"));
    const expensesTotal = sum(expenses, (e) => e.amount);

    const monthly = lastMonths(6).map((m) => ({
      label: m.label,
      ym: m.key,
      revenue: sum(
        invoices.filter((i) => i.status === "paid" && monthKey(i.paid_at || i.issue_date) === m.key),
      ),
      expenses: sum(
        expenses.filter((e) => e.expense_date.slice(0, 7) === m.key),
        (e) => e.amount,
      ),
    }));

    // Aging of sent (unpaid) invoices by days past due
    const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    for (const i of invoices.filter((x) => x.status === "sent")) {
      const days = i.due_date ? daysBetween(today, i.due_date) : 0;
      const t = num(i.total);
      if (days < 1) aging.current += t;
      else if (days <= 30) aging.d30 += t;
      else if (days <= 60) aging.d60 += t;
      else if (days <= 90) aging.d90 += t;
      else aging.d90plus += t;
    }

    // Top clients
    const byClient = new Map();
    for (const i of invoices) {
      if (!i.client_id) continue;
      const key = String(i.client_id);
      const c = byClient.get(key) || { billed: 0, paid: 0 };
      c.billed += num(i.total);
      if (i.status === "paid") c.paid += num(i.total);
      byClient.set(key, c);
    }
    const top = [...byClient.entries()].sort((a, b) => b[1].billed - a[1].billed).slice(0, 5);
    const clientDocs = top.length
      ? await Client.find({ _id: { $in: top.map(([id]) => id) } }).select("name").lean()
      : [];
    const names = new Map(clientDocs.map((c) => [String(c._id), c.name]));

    const statusSum = (fn) => sum(invoices.filter(fn));

    res.json({
      totals: {
        revenue,
        expenses: expensesTotal,
        netProfit: round2(revenue - expensesTotal),
        outstanding,
        invoiceCount: invoices.length,
      },
      monthly,
      aging: [
        { bucket: "Current", value: round2(aging.current) },
        { bucket: "1–30d", value: round2(aging.d30) },
        { bucket: "31–60d", value: round2(aging.d60) },
        { bucket: "61–90d", value: round2(aging.d90) },
        { bucket: "90d+", value: round2(aging.d90plus) },
      ],
      topClients: top.map(([id, c]) => ({
        id,
        name: names.get(id) || "Unknown",
        billed: round2(c.billed),
        paid: round2(c.paid),
      })),
      statusBreakdown: [
        { name: "Draft", value: statusSum((i) => i.status === "draft"), key: "draft" },
        {
          name: "Sent",
          value: statusSum((i) => i.status === "sent" && !isOverdue(i)),
          key: "sent",
        },
        { name: "Overdue", value: statusSum(isOverdue), key: "overdue" },
        { name: "Paid", value: statusSum((i) => i.status === "paid"), key: "paid" },
      ],
    });
  }),
);

module.exports = router;
