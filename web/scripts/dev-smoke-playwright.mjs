import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:5205/_app/";
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push([m.type(), m.text()]));
page.on("pageerror", (e) =>
  logs.push(["pageerror", `${e.message}\n${e.stack ?? ""}`]),
);
await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(4000);
const len = await page.evaluate(
  () => document.getElementById("root")?.innerHTML?.length ?? -1,
);
const hasSidebar = await page.evaluate(() => !!document.querySelector("aside"));
const hasConnecting = await page.evaluate(() =>
  document.body?.innerText?.includes("Connecting"),
);
const hasPair = await page.evaluate(() => document.body?.innerText?.includes("Pair"));
console.log(
  JSON.stringify(
    { url, rootInnerLen: len, hasSidebar, hasConnecting, hasPair, logs: logs.slice(0, 40) },
    null,
    2,
  ),
);
await browser.close();
