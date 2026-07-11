/**
 * Manual-QA helper: loads the fixture and captures screenshots of the main
 * states (iso view, filter selection highlight, hide unselected, top view,
 * orthographic) into test/qa-screenshots/.
 *
 * Usage: node qa-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";

const FIXTURE = "C:\\Users\\ASinha\\OneDrive - Laing ORourke\\Documents\\SWC\\Job\\Solving Dataset\\2hwx0208ac1_run\\input\\2HWX0208AC1.ifc";
const OUT = "qa-screenshots";
fs.mkdirSync(OUT, { recursive: true });

const server = spawn("node", ["serve.mjs", "8179"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:8179");
await page.setInputFiles("#file-input", FIXTURE);
await page.waitForFunction(() => window.ifcModel?.elements.size > 0);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/1-loaded-iso.png` });

await page.selectOption("#pset-select", "Bylor");
const prop = await page.locator("#prop-select option:nth-child(2)").getAttribute("value");
await page.selectOption("#prop-select", prop);
await page.locator("#value-list li").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/2-filter-selected.png` });

await page.click("#btn-hide-unselected");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/3-hide-unselected.png` });

await page.click("#btn-unhide-all");
await page.click("#btn-view-top");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/4-top-view.png` });

await page.click("#btn-projection");
await page.click("#btn-view-iso");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/5-ortho-iso.png` });

// SZC-ARMF tab
await page.evaluate(() => {
  const first = window.ifcModel.elements.keys().next().value;
  window.ifcModel.state.setSelection([first]);
});
await page.click('#tabs .tab[data-tab="SZC-ARMF"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/6-armf-tab.png` });

await browser.close();
server.kill();
console.log("Screenshots written to test/qa-screenshots/");
