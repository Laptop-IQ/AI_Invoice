const bcrypt = require("bcrypt");
const { UserModel } = require("./index");
const { clean } = require("../utils/serialize");
const { isValidId } = require("../utils/ids");

const PUBLIC_FIELDS = "email name created_at updated_at";

function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Includes password_hash (used by login)
async function findByEmail(email) {
  return clean(await UserModel.findOne({ email: String(email).toLowerCase() }).lean());
}

async function findById(id) {
  if (!isValidId(id)) return null;
  return clean(await UserModel.findById(id).select(PUBLIC_FIELDS).lean());
}

async function findByIdWithHash(id) {
  if (!isValidId(id)) return null;
  return clean(await UserModel.findById(id).lean());
}

async function create({ name, email, passwordHash }) {
  const doc = await UserModel.create({ name, email, password_hash: passwordHash });
  return findById(doc._id);
}

async function updateName(id, name) {
  return clean(
    await UserModel.findByIdAndUpdate(id, { $set: { name } }, { new: true })
      .select(PUBLIC_FIELDS)
      .lean(),
  );
}

async function updatePassword(id, passwordHash) {
  await UserModel.updateOne({ _id: id }, { $set: { password_hash: passwordHash } });
}

module.exports = {
  hashPassword,
  comparePassword,
  findByEmail,
  findById,
  findByIdWithHash,
  create,
  updateName,
  updatePassword,
};
