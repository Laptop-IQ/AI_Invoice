const { connectDB, disconnectDB } = require("../src/config/db");
const {
  UserModel,
  SettingsModel,
  Client,
  Invoice,
  CatalogItem,
  Expense,
  Payment,
} = require("../src/models");
const User = require("../src/models/User");
const Settings = require("../src/models/Settings");
const { computeTotals } = require("../src/utils/invoice");

const DEMO = {
  email: "alex@timetoprogram.com",
  password: "Test@1234",
  name: "Alex Chen",
};

const NUM_CLIENTS = 28;
const NUM_INVOICES = 84;
const NUM_EXPENSES = 49;
const SPREAD_DAYS = 330;

const COMPANY_NAMES = [
  "Nova Retail Group",
  "Brightline Studios",
  "Harbor & Co.",
  "Peak Fitness",
  "Summit Media",
  "Ironclad Security",
  "Lumen Analytics",
  "Copperfield Design",
  "Riverstone Legal",
  "Vantage Partners",
  "Northwind Traders",
  "Blue Orbit Labs",
  "Meridian Health",
  "Crestview Realty",
  "Palette Creative",
  "Foundry Works",
  "Cedar & Pine",
  "Quantum Foods",
  "Apex Logistics",
  "Bluepeak Ventures",
  "Sierra Robotics",
  "Willowbrook Cafe",
  "Onyx Interactive",
  "Beacon Financial",
  "Tidewater Marine",
  "Greenhouse Co",
  "Solstice Apparel",
  "Kestrel Aviation",
];
const CITIES = [
  "San Francisco, CA",
  "New York, NY",
  "Boston, MA",
  "Miami, FL",
  "Austin, TX",
  "Seattle, WA",
  "Chicago, IL",
  "Denver, CO",
  "Portland, OR",
  "Atlanta, GA",
];
const STREETS = [
  "Market St",
  "Greene St",
  "Wharf Rd",
  "Ocean Dr",
  "Congress Ave",
  "Pine St",
  "Broadway",
  "Mission St",
  "Elm Ave",
  "Harbor Blvd",
];

const CATALOG = [
  ["Brand & UI design sprint", "One-week design engagement", 3200, "project"],
  ["Frontend development", "React / TypeScript build", 95, "hour"],
  ["Backend API development", "Node / Mongo build", 110, "hour"],
  [
    "Monthly retainer — support",
    "Ongoing support & maintenance",
    1500,
    "month",
  ],
  ["Consultation & discovery", "Strategy and scoping call", 150, "hour"],
  ["Performance audit", "Full performance review", 900, "project"],
  ["UX research study", "Interviews + synthesis", 2400, "project"],
  ["Mobile app development", "React Native build", 120, "hour"],
  ["DevOps & CI/CD setup", "Pipelines and infra", 130, "hour"],
  ["SEO optimization", "Technical SEO pass", 750, "project"],
  ["Content & copywriting", "Marketing copy", 85, "hour"],
  ["Logo & brand identity", "Full identity package", 2800, "project"],
  ["Database optimization", "Query + schema tuning", 140, "hour"],
  ["Security assessment", "Pentest & report", 3500, "project"],
];

const EXPENSE_VENDORS = [
  ["Adobe", "Software", 30, 90],
  ["Figma", "Software", 12, 60],
  ["GitHub", "Software", 4, 44],
  ["Google Workspace", "Software", 12, 72],
  ["Notion", "Software", 8, 40],
  ["Linear", "Software", 8, 48],
  ["AWS", "Hosting", 80, 260],
  ["Vercel", "Hosting", 20, 150],
  ["MongoDB Atlas", "Hosting", 19, 120],
  ["Blue Bottle Coffee", "Meals", 8, 45],
  ["The Continental Bistro", "Meals", 40, 220],
  ["Chipotle", "Meals", 12, 60],
  ["Uber", "Travel", 12, 80],
  ["Delta Airlines", "Travel", 180, 650],
  ["Marriott", "Travel", 150, 420],
  ["WeWork", "Office", 250, 400],
  ["Staples", "Office", 20, 180],
  ["Apple Store", "Equipment", 99, 2200],
  ["Best Buy", "Equipment", 50, 900],
  ["Meta Ads", "Marketing", 50, 600],
  ["Google Ads", "Marketing", 60, 800],
  ["LinkedIn", "Marketing", 30, 300],
];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function phone() {
  return `+1 (${200 + rand(700)}) 555-0${100 + rand(900)}`;
}

async function run() {
  console.log(`\nSeeding demo data for ${DEMO.email}...\n`);
  await connectDB();

  const passwordHash = await User.hashPassword(DEMO.password);
  let user = await User.findByEmail(DEMO.email);
  if (user) {
    await UserModel.updateOne(
      { _id: user.id },
      { $set: { name: DEMO.name, password_hash: passwordHash } },
    );
    console.log(`User ready: ${DEMO.email} (existing)`);
  } else {
    user = await User.create({
      name: DEMO.name,
      email: DEMO.email,
      passwordHash,
    });
    console.log(`User ready: ${DEMO.email} (created)`);
  }
  const uid = user.id;

  await Settings.ensure(uid);
  await Settings.update(uid, {
    company_name: "Chen Studio",
    address: "410 Townsend St, San Francisco, CA 94107",
    email: DEMO.email,
    phone: "+1 (415) 555-0192",
    currency: "USD",
    tax_rate: 8.5,
    invoice_prefix: "INV-",
  });

  await Promise.all([
    Payment.deleteMany({ user_id: uid }),
    Expense.deleteMany({ user_id: uid }),
    CatalogItem.deleteMany({ user_id: uid }),
    Invoice.deleteMany({ user_id: uid }),
    Client.deleteMany({ user_id: uid }),
  ]);

  const clientDocs = [];
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const name = COMPANY_NAMES[i % COMPANY_NAMES.length];
    const company = name.replace(
      / (Group|Studios|Co\.?|Partners|Labs|Ventures|Interactive|Traders)$/i,
      "",
    );
    clientDocs.push({
      user_id: uid,
      name,
      email: `billing@${slug(name)}.com`,
      company,
      phone: phone(),
      address: `${100 + rand(900)} ${pick(STREETS)}, ${pick(CITIES)}`,
    });
  }
  const clients = await Client.insertMany(clientDocs);
  const clientIds = clients.map((c) => c._id);
  console.log(`Created ${clientIds.length} clients`);

  await CatalogItem.insertMany(
    CATALOG.map(([name, description, rate, unit]) => ({
      user_id: uid,
      name,
      description,
      rate,
      unit,
    })),
  );
  console.log(`Created ${CATALOG.length} catalog items`);

  const today = new Date();
  let seq = 1;
  let paidCount = 0;
  const invoiceDocs = [];
  const paymentSpecs = [];

  for (let i = 0; i < NUM_INVOICES; i++) {
    const issueDaysAgo = rand(SPREAD_DAYS);
    const issue = isoDaysAgo(issueDaysAgo);
    const due = addDays(issue, [15, 30, 30, 45][rand(4)]);

    const lineCount = 1 + rand(4);
    const items = [];
    for (let j = 0; j < lineCount; j++) {
      const [name, , rate, unit] = pick(CATALOG);
      const qty = unit === "hour" ? pick([8, 12, 16, 20, 24, 32, 40]) : 1;
      items.push({ description: name, quantity: qty, rate });
    }

    const taxRate = Math.random() < 0.7 ? 8.5 : 0;
    const discount = Math.random() < 0.15 ? [50, 100, 150, 200][rand(4)] : 0;
    const totals = computeTotals(items, taxRate, discount);

    const roll = Math.random();
    let status;
    if (roll < 0.6) status = "paid";
    else if (roll < 0.85) status = "sent";
    else status = "draft";

    let paidOn = null;
    if (status === "paid") {
      const paidDaysAgo = Math.max(
        0,
        issueDaysAgo - rand(Math.min(35, issueDaysAgo + 1)),
      );
      paidOn = isoDaysAgo(paidDaysAgo);
      paidCount++;
    }

    const number = `INV-${String(seq).padStart(4, "0")}`;
    seq++;

    invoiceDocs.push({
      user_id: uid,
      client_id: pick(clientIds),
      invoice_number: number,
      status,
      issue_date: issue,
      due_date: due,
      currency: "USD",
      tax_rate: taxRate,
      discount: totals.discount,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total: totals.total,
      notes: "Thank you for your business.",
      terms: "Payment due within 30 days.",
      paid_at: paidOn ? new Date(paidOn) : null,
      items: totals.items,
    });
    paymentSpecs.push(
      status === "paid"
        ? {
            amount: totals.total,
            method: pick(["Bank transfer", "Credit card", "Check", "PayPal"]),
            paid_on: paidOn,
          }
        : null,
    );
  }

  const invoices = await Invoice.insertMany(invoiceDocs);
  const payments = [];
  invoices.forEach((inv, idx) => {
    const spec = paymentSpecs[idx];
    if (spec) {
      payments.push({ user_id: uid, invoice_id: inv._id, notes: "", ...spec });
    }
  });
  await Payment.insertMany(payments);

  await SettingsModel.updateOne({ user_id: uid }, { $set: { next_seq: seq } });
  console.log(`Created ${NUM_INVOICES} invoices (${paidCount} paid + payments)`);

  const expenseDocs = [];
  for (let i = 0; i < NUM_EXPENSES; i++) {
    const [vendor, category, min, max] = pick(EXPENSE_VENDORS);
    expenseDocs.push({
      user_id: uid,
      vendor,
      category,
      expense_date: isoDaysAgo(rand(SPREAD_DAYS)),
      amount: round2(min + Math.random() * (max - min)),
      notes: "",
    });
  }
  await Expense.insertMany(expenseDocs);
  console.log(`Created ${NUM_EXPENSES} expenses`);

  console.log("\n✅ Seed complete.");
  console.log("   Login:    " + DEMO.email);
  console.log("   Password: " + DEMO.password + "\n");
}

run()
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
