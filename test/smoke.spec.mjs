/**
 * Automated smoke test (Playwright, system Edge).
 *
 * Covers, in one end-to-end flow against the fixture IFC:
 *   - file loads, element count > 0, no console errors
 *   - Pset dropdown populated; pset+property+value selection filters elements
 *   - click select / ctrl+click deselect on the canvas
 *   - shift+drag box select
 *   - Hide / Hide Unselected / Unhide Selected / Unhide All
 *   - projection toggle + standard view buttons
 *   - SZC-ARMF rows persist across a page reload (localStorage)
 *   - Export downloads valid STEP text that re-parses with web-ifc and has
 *     the SZC-ARMF pset attached to the correct GlobalId
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE = "C:\\Users\\ASinha\\OneDrive - Laing ORourke\\Documents\\SWC\\Job\\Solving Dataset\\2hwx0208ac1_run\\input\\2HWX0208AC1.ifc";
const BASE = "http://localhost:8177";

test.beforeAll(() => {
  if (!fs.existsSync(FIXTURE)) throw new Error(`Fixture IFC not found: ${FIXTURE}`);
});

async function loadModel(page) {
  await page.setInputFiles("#file-input", FIXTURE);
  await page.waitForFunction(
    () => window.ifcModel && window.ifcModel.elements.size > 0,
    null,
    { timeout: 90_000 },
  );
}

test("end-to-end smoke", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(BASE);

  let elementCount = 0;
  await test.step("model loads with elements", async () => {
    await loadModel(page);
    elementCount = await page.evaluate(() => window.ifcModel.elements.size);
    expect(elementCount).toBeGreaterThan(0);
    await expect(page.locator("#status-elements")).toHaveText(`${elementCount} elements`);
  });

  await test.step("pset dropdown is populated", async () => {
    const options = page.locator("#pset-select option");
    expect(await options.count()).toBeGreaterThan(1);
    const names = await options.allTextContents();
    expect(names).toContain("Bylor");
  });

  let pickedGid, pickedExpressID, filterSelectedCount;
  await test.step("selecting pset + property + value filters elements", async () => {
    await page.selectOption("#pset-select", "Bylor");
    // pick the first real property of the pset
    const propValue = await page.locator("#prop-select option:nth-child(2)").getAttribute("value");
    expect(propValue).toBeTruthy();
    await page.selectOption("#prop-select", propValue);
    const firstValue = page.locator("#value-list li").first();
    await expect(firstValue).toBeVisible();
    await firstValue.click();

    filterSelectedCount = await page.evaluate(() => window.ifcModel.selection().length);
    expect(filterSelectedCount).toBeGreaterThan(0);
    await expect(page.locator("#status-selected")).toHaveText(`${filterSelectedCount} selected`);

    [pickedGid, pickedExpressID] = await page.evaluate(() => {
      const id = window.ifcModel.state.lastSelected;
      return [window.ifcModel.elements.get(id).globalId, id];
    });
    expect(pickedGid).toBeTruthy();
  });

  await test.step("visibility toolbar", async () => {
    await page.click("#btn-hide");
    expect(await page.evaluate(() => window.ifcModel.hidden().length)).toBe(filterSelectedCount);

    await page.click("#btn-unhide-selected");
    expect(await page.evaluate(() => window.ifcModel.hidden().length)).toBe(0);

    await page.click("#btn-hide-unselected");
    expect(await page.evaluate(() => window.ifcModel.hidden().length)).toBe(elementCount - filterSelectedCount);
    // hidden meshes are actually invisible in the scene
    expect(await page.evaluate(() =>
      [...window.ifcModel.viewer.meshes.values()].filter((m) => !m.visible).length,
    )).toBe(elementCount - filterSelectedCount);

    await page.click("#btn-unhide-all");
    expect(await page.evaluate(() => window.ifcModel.hidden().length)).toBe(0);
  });

  await test.step("click select and ctrl+click deselect", async () => {
    // find a canvas pixel that actually hits an element (raycast in-page)
    const pixel = await page.evaluate(() => {
      const el = document.querySelector("#viewport canvas").getBoundingClientRect();
      for (let fx = 0.3; fx <= 0.7; fx += 0.05) {
        for (let fy = 0.3; fy <= 0.7; fy += 0.05) {
          const x = el.left + el.width * fx, y = el.top + el.height * fy;
          if (window.ifcModel.viewer.pick(x, y) !== null) return { x, y };
        }
      }
      return null;
    });
    expect(pixel).not.toBeNull();

    await page.mouse.click(pixel.x, pixel.y);
    expect(await page.evaluate(() => window.ifcModel.selection().length)).toBe(1);

    await page.keyboard.down("Control");
    await page.mouse.click(pixel.x, pixel.y);
    await page.keyboard.up("Control");
    expect(await page.evaluate(() => window.ifcModel.selection().length)).toBe(0);
  });

  await test.step("shift+drag box select", async () => {
    const box = await page.locator("#viewport canvas").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.keyboard.down("Shift");
    await page.mouse.move(cx - 150, cy - 150);
    await page.mouse.down();
    await page.mouse.move(cx + 150, cy + 150, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    expect(await page.evaluate(() => window.ifcModel.selection().length)).toBeGreaterThan(0);
  });

  await test.step("orbit, pan and zoom change the camera without selecting", async () => {
    const camPos = () => page.evaluate(() => window.ifcModel.viewer.camera.position.toArray());
    const selCount = () => page.evaluate(() => window.ifcModel.selection().length);
    const box = await page.locator("#viewport canvas").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const selBefore = await selCount();

    const beforeOrbit = await camPos();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 60, { steps: 6 });
    await page.mouse.up();
    expect(await camPos()).not.toEqual(beforeOrbit);

    const beforePan = await camPos();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(cx + 80, cy + 40, { steps: 6 });
    await page.mouse.up({ button: "right" });
    expect(await camPos()).not.toEqual(beforePan);

    const distBefore = await page.evaluate(() =>
      window.ifcModel.viewer.camera.position.distanceTo(window.ifcModel.viewer.controls.target));
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(100);
    const distAfter = await page.evaluate(() =>
      window.ifcModel.viewer.camera.position.distanceTo(window.ifcModel.viewer.controls.target));
    expect(distAfter).toBeLessThan(distBefore);

    expect(await selCount()).toBe(selBefore); // camera moves never select
  });

  await test.step("projection toggle and standard views", async () => {
    await expect(page.locator("#btn-projection")).toHaveText("Perspective");
    await page.click("#btn-projection");
    await expect(page.locator("#btn-projection")).toHaveText("Orthographic");
    expect(await page.evaluate(() => window.ifcModel.viewer.isOrthographic)).toBe(true);
    await page.click("#btn-projection");
    await expect(page.locator("#btn-projection")).toHaveText("Perspective");

    for (const view of ["top", "bottom", "left", "right", "front", "back", "iso"]) {
      await page.click(`#btn-view-${view}`);
    }
    // camera ends up along the iso diagonal relative to the model centre
    const dir = await page.evaluate(() => {
      const v = window.ifcModel.viewer;
      return v.camera.position.clone().sub(v.modelCenter).normalize().toArray();
    });
    expect(dir[0]).toBeGreaterThan(0.5);
    expect(dir[1]).toBeLessThan(-0.5);
    expect(dir[2]).toBeGreaterThan(0.5);
  });

  await test.step("SZC-ARMF rows autosave and survive a reload", async () => {
    await page.evaluate((id) => window.ifcModel.state.setSelection([id]), pickedExpressID);
    await page.click('#tabs .tab[data-tab="SZC-ARMF"]');
    await expect(page.locator("#armf-table")).toBeVisible();
    await expect(page.locator("#armf-table td.fixed-module")).toHaveText("Part Type 2");

    await page.fill("#armf-table tbody tr:nth-child(1) .armf-value-input", "F1F2");
    await page.click("#armf-add-row");
    await page.fill("#armf-table tbody tr:nth-child(2) .armf-module-input", "Checked By");
    await page.fill("#armf-table tbody tr:nth-child(2) .armf-value-input", "AS");

    await page.reload();
    await loadModel(page);
    await page.evaluate((id) => window.ifcModel.state.setSelection([id]), pickedExpressID);
    await page.click('#tabs .tab[data-tab="SZC-ARMF"]');
    await expect(page.locator("#armf-table tbody tr:nth-child(1) .armf-value-input")).toHaveValue("F1F2");
    await expect(page.locator("#armf-table tbody tr:nth-child(2) .armf-module-input")).toHaveValue("Checked By");
    await expect(page.locator("#armf-table tbody tr:nth-child(2) .armf-value-input")).toHaveValue("AS");
  });

  let exportedPath;
  await test.step("export downloads <name>-SZC.ifc with valid STEP text", async () => {
    const downloadPromise = page.waitForEvent("download");
    await page.click("#btn-export");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("2HWX0208AC1-SZC.ifc");
    exportedPath = path.join(os.tmpdir(), `szc-export-${Date.now()}.ifc`);
    await download.saveAs(exportedPath);

    const text = fs.readFileSync(exportedPath, "utf-8");
    expect(text.startsWith("ISO-10303-21")).toBe(true);
    expect(text).toContain("SZC-ARMF");
    expect(text.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
  });

  await test.step("exported file re-parses; SZC-ARMF pset attached to correct GlobalId", async () => {
    const WebIFC = require("../lib/web-ifc-api-node.js");
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const modelID = api.OpenModel(new Uint8Array(fs.readFileSync(exportedPath)));

    // collect SZC-ARMF psets and the GlobalIds they are related to
    const armfByGid = new Map();
    const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < rels.size(); i++) {
      const rel = api.GetLine(modelID, rels.get(i));
      const pdefID = rel.RelatingPropertyDefinition?.value;
      if (!pdefID || api.GetLineType(modelID, pdefID) !== WebIFC.IFCPROPERTYSET) continue;
      const pset = api.GetLine(modelID, pdefID);
      if (pset.Name?.value !== "SZC-ARMF") continue;
      const props = {};
      for (const h of pset.HasProperties) {
        const p = api.GetLine(modelID, h.value);
        props[p.Name.value] = p.NominalValue?.value;
      }
      for (const ref of rel.RelatedObjects) {
        const gid = api.GetLine(modelID, ref.value).GlobalId?.value;
        armfByGid.set(gid, props);
      }
    }

    expect(armfByGid.size).toBe(1);
    expect(armfByGid.has(pickedGid)).toBe(true);
    expect(armfByGid.get(pickedGid)).toEqual({ "Part Type 2": "F1F2", "Checked By": "AS" });

    // original content is untouched: same element count, original psets intact
    const beams = api.GetLineIDsWithType(modelID, WebIFC.IFCBEAM).size();
    const bars = api.GetLineIDsWithType(modelID, WebIFC.IFCREINFORCINGBAR).size();
    expect(beams + bars).toBe(elementCount);
    api.CloseModel(modelID);
  });

  await test.step("no console errors", async () => {
    expect(consoleErrors).toEqual([]);
  });
});
