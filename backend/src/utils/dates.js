const pad = (n) => String(n).padStart(2, "0");

// Local date as YYYY-MM-DD
function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM" from a YYYY-MM-DD string or a Date
function monthKey(v) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 7);
  return todayStr(v).slice(0, 7);
}

// Last n months (oldest first) as [{ key: "2026-11", label: "Nov" }]
function lastMonths(n = 6) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleString("en-US", { month: "short" }),
    });
  }
  return out;
}

// Whole days from `earlier` to `later` (both YYYY-MM-DD)
function daysBetween(later, earlier) {
  const p = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(later) - p(earlier)) / 86_400_000);
}

module.exports = { todayStr, monthKey, lastMonths, daysBetween };
