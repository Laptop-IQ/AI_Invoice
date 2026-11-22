const mongoose = require("mongoose");

const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const withTimestamps = {
  timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  versionKey: false,
};

const str = (def = "") => ({ type: String, default: def });
const num = (def = 0) => ({ type: Number, default: def });

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  withTimestamps,
);

const settingsSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true, unique: true },
    company_name: str(),
    logo_url: str(),
    address: str(),
    email: str(),
    phone: str(),
    currency: str("USD"),
    tax_rate: num(0),
    invoice_prefix: str("INV-"),
    next_seq: num(1),
    accent_color: str(),
  },
  { ...withTimestamps, collection: "company_settings" },
);

const clientSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    email: str(),
    company: str(),
    phone: str(),
    address: str(),
    notes: str(),
  },
  withTimestamps,
);

const invoiceItemSchema = new Schema({
  description: str(),
  quantity: num(1),
  rate: num(0),
  amount: num(0),
  position: num(0),
});

const invoiceSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true },
    client_id: { type: ObjId, ref: "Client", default: null },
    invoice_number: { type: String, required: true },
    status: { type: String, enum: ["draft", "sent", "paid"], default: "draft" },
    issue_date: { type: String, required: true }, // YYYY-MM-DD
    due_date: { type: String, default: null }, // YYYY-MM-DD
    currency: str("USD"),
    tax_rate: num(0),
    discount: num(0),
    subtotal: num(0),
    tax_amount: num(0),
    total: num(0),
    notes: str(),
    terms: str(),
    paid_at: { type: Date, default: null },
    items: { type: [invoiceItemSchema], default: [] },
  },
  withTimestamps,
);
invoiceSchema.index({ user_id: 1, invoice_number: 1 }, { unique: true });
invoiceSchema.index({ user_id: 1, client_id: 1 });

const catalogItemSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    description: str(),
    rate: num(0),
    unit: str(),
  },
  { ...withTimestamps, collection: "catalog_items" },
);

const expenseSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true, index: true },
    vendor: str(),
    category: str("General"),
    expense_date: { type: String, required: true }, // YYYY-MM-DD
    amount: num(0),
    currency: str("USD"),
    notes: str(),
  },
  withTimestamps,
);

const paymentSchema = new Schema(
  {
    user_id: { type: ObjId, ref: "User", required: true, index: true },
    invoice_id: { type: ObjId, ref: "Invoice", required: true, index: true },
    amount: num(0),
    method: str(),
    paid_on: { type: String, required: true }, // YYYY-MM-DD
    notes: str(),
  },
  { timestamps: { createdAt: "created_at", updatedAt: false }, versionKey: false },
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  UserModel: model("User", userSchema),
  SettingsModel: model("CompanySettings", settingsSchema),
  Client: model("Client", clientSchema),
  Invoice: model("Invoice", invoiceSchema),
  CatalogItem: model("CatalogItem", catalogItemSchema),
  Expense: model("Expense", expenseSchema),
  Payment: model("Payment", paymentSchema),
};
