/**
 * Left panel — selection tree. Pset dropdown -> property dropdown -> value
 * list; clicking a value selects (and highlights) every matching element.
 * All lookups hit the prebuilt filterIndex, so nothing here scales with
 * model size beyond the number of distinct values displayed.
 */
export class FilterPanel {
  constructor(state) {
    this.state = state;
    this.psetSelect = document.getElementById("pset-select");
    this.propSelect = document.getElementById("prop-select");
    this.valueList = document.getElementById("value-list");
    this.status = document.getElementById("filter-status");
    this.clearBtn = document.getElementById("btn-clear-filter");

    this.psetSelect.addEventListener("change", () => this.#renderProps());
    this.propSelect.addEventListener("change", () => this.#renderValues());
    this.clearBtn.addEventListener("click", () => {
      this.state.clearSelection();
      this.#clearActive();
      this.status.textContent = "";
    });

    state.addEventListener("model-loaded", () => this.populate());
    state.addEventListener("model-cleared", () => this.reset());
  }

  reset() {
    this.psetSelect.innerHTML = `<option value="">— load a model —</option>`;
    this.psetSelect.disabled = true;
    this.propSelect.innerHTML = `<option value="">—</option>`;
    this.propSelect.disabled = true;
    this.valueList.innerHTML = "";
    this.status.textContent = "";
  }

  populate() {
    const psetNames = [...this.state.filterIndex.keys()].sort((a, b) => a.localeCompare(b));
    this.psetSelect.innerHTML =
      `<option value="">— choose a property set —</option>` +
      psetNames.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
    this.psetSelect.disabled = false;
    this.propSelect.disabled = false;
    this.#renderProps();
  }

  #renderProps() {
    const propIndex = this.state.filterIndex.get(this.psetSelect.value);
    const names = propIndex ? [...propIndex.keys()].sort((a, b) => a.localeCompare(b)) : [];
    this.propSelect.innerHTML =
      `<option value="">— choose a property —</option>` +
      names.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
    this.#renderValues();
  }

  #renderValues() {
    const valueIndex = this.state.filterIndex
      .get(this.psetSelect.value)?.get(this.propSelect.value);
    this.valueList.innerHTML = "";
    this.status.textContent = "";
    if (!valueIndex) return;

    const entries = [...valueIndex.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }));
    for (const [valueStr, ids] of entries) {
      const li = document.createElement("li");
      li.className = "value-item";
      li.innerHTML = `<span class="v">${escapeHtml(valueStr)}</span><span class="count">${ids.size}</span>`;
      li.addEventListener("click", () => {
        this.#clearActive();
        li.classList.add("active");
        this.state.setSelection([...ids]);
        this.status.textContent = `${ids.size} element${ids.size === 1 ? "" : "s"} selected`;
      });
      this.valueList.appendChild(li);
    }
  }

  #clearActive() {
    this.valueList.querySelectorAll("li.active").forEach((li) => li.classList.remove("active"));
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeAttr(s) { return escapeHtml(s); }
