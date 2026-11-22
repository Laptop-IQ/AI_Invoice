const mongoose = require("mongoose");
const { z } = require("zod");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const isValidId = (id) => mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(String(id));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { objectId, isValidId, escapeRegex };
