/**
 * The editable "SZC-ARMF" tab: a Module | Value table where row 1's Module is
 * the fixed label "Part Type 2" and every other cell is free text. "+" adds a
 * row. Every keystroke autosaves to localStorage keyed by filename+GlobalId
 * (storage.js) — no save button, and a page reload restores the data.
 * Purely additive: source IFC metadata is never touched.
 */
import { getArmfRows, saveArmfRows } from "../storage.js";

export function renderArmfTab(state, el) {
  const wrap = document.createElement("div");
  const rows = getArmfRows(state.filename, el.globalId);

  const table = document.createElement("table");
  table.className = "props";
  table.id = "armf-table";
  table.innerHTML = `<thead><tr><th>Module</th><th>Value</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const save = () => {
    const collected = [...tbody.rows].map((tr, i) => ({
      module: i === 0 ? "Part Type 2" : tr.querySelector(".armf-module-input").value,
      value: tr.querySelector(".armf-value-input").value,
    }));
    saveArmfRows(state.filename, el.globalId, collected);
  };

  const addRow = (row, isFirst) => {
    const tr = document.createElement("tr");

    const tdModule = document.createElement("td");
    if (isFirst) {
      tdModule.className = "fixed-module";
      tdModule.textContent = "Part Type 2";
    } else {
      const input = document.createElement("input");
      input.className = "armf-module-input";
      input.placeholder = "Module";
      input.value = row.module ?? "";
      input.addEventListener("input", save);
      tdModule.appendChild(input);
    }

    const tdValue = document.createElement("td");
    const valueInput = document.createElement("input");
    valueInput.className = "armf-value-input";
    valueInput.placeholder = "Value";
    valueInput.value = row.value ?? "";
    valueInput.addEventListener("input", save);
    tdValue.appendChild(valueInput);

    tr.append(tdModule, tdValue);
    tbody.appendChild(tr);
  };

  rows.forEach((row, i) => addRow(row, i === 0));

  const addBtn = document.createElement("button");
  addBtn.className = "btn";
  addBtn.id = "armf-add-row";
  addBtn.textContent = "+";
  addBtn.title = "Add a row";
  addBtn.addEventListener("click", () => {
    addRow({ module: "", value: "" }, false);
    save();
  });

  const note = document.createElement("p");
  note.className = "armf-note";
  note.textContent = "Autosaved locally per element. Rows with both cells filled are written to the exported IFC as an SZC-ARMF property set.";

  wrap.append(table, addBtn, note);
  return wrap;
}
