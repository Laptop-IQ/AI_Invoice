// Converts Mongo lean documents into the JSON shape the frontend expects:
// `_id` -> `id`, ObjectIds -> strings, `__v` removed.
function clean(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(clean);
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v._bsontype === "ObjectId" || v._bsontype === "ObjectID") return v.toString();
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === "__v") continue;
      if (k === "_id") {
        out.id = String(val);
        continue;
      }
      out[k] = clean(val);
    }
    return out;
  }
  return v;
}

module.exports = { clean };
