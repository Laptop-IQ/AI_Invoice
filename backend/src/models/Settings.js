const { SettingsModel } = require("./index");
const { clean } = require("../utils/serialize");

const ALLOWED = [
  "company_name",
  "logo_url",
  "address",
  "email",
  "phone",
  "currency",
  "tax_rate",
  "invoice_prefix",
  "accent_color",
];

async function upsert(userId, set = {}) {
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  const update = { $setOnInsert: { user_id: userId } };
  if (Object.keys(set).length) update.$set = set;
  try {
    return await SettingsModel.findOneAndUpdate({ user_id: userId }, update, opts).lean();
  } catch (err) {
    // two parallel first requests can race on the unique index; retry once
    if (err.code === 11000) {
      return SettingsModel.findOneAndUpdate({ user_id: userId }, update, opts).lean();
    }
    throw err;
  }
}

async function ensure(userId) {
  return clean(await upsert(userId));
}

async function update(userId, fields) {
  const set = {};
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) set[key] = fields[key];
  }
  return clean(await upsert(userId, set));
}

// Atomic counter: returns the number *before* the increment
async function nextInvoiceNumber(userId) {
  await upsert(userId);
  const before = await SettingsModel.findOneAndUpdate(
    { user_id: userId },
    { $inc: { next_seq: 1 } },
    { new: false },
  ).lean();
  return `${before.invoice_prefix}${String(before.next_seq).padStart(4, "0")}`;
}

module.exports = { ensure, update, nextInvoiceNumber };
