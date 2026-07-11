/**
 * Persistence for SZC-ARMF user rows. localStorage, one entry per loaded
 * filename, keyed inside by element GlobalId:
 *
 *   "SZC-ARMF::<filename>" -> { "<GlobalId>": [ { module, value }, ... ] }
 *
 * Row 0 is always the fixed "Part Type 2" row. Data is only ever written by
 * the SZC-ARMF tab; the source IFC is never touched.
 */

const PREFIX = "SZC-ARMF::";

const keyFor = (filename) => PREFIX + filename;

export function loadAllArmf(filename) {
  try {
    const raw = localStorage.getItem(keyFor(filename));
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("SZC-ARMF: failed to read saved data", e);
    return {};
  }
}

export function getArmfRows(filename, globalId) {
  const all = loadAllArmf(filename);
  const rows = all[globalId];
  if (Array.isArray(rows) && rows.length) return rows;
  return [{ module: "Part Type 2", value: "" }];
}

export function saveArmfRows(filename, globalId, rows) {
  const all = loadAllArmf(filename);
  all[globalId] = rows;
  try {
    localStorage.setItem(keyFor(filename), JSON.stringify(all));
  } catch (e) {
    console.error("SZC-ARMF: failed to persist data", e);
  }
}
