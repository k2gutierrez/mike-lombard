import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const S = [];
const ok = (n, v) => S.push({ [n]: v === true ? "PASS" : v });
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 90)));
for (const [name, path, marker] of [["portada","/","Selected works"],["obras","/works","Works and projects"],["nfts","/nfts","NFTs"],["biografía","/biography","Biography"],["carrera","/career","Career"],["mint","/mint","Mint registration"]]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,100));} window.scrollTo(0,0); });
  await page.waitForTimeout(1400);
  const t = await page.locator("body").innerText();
  ok(`${name}: renderiza`, t.includes(marker));
  ok(`${name}: sin otra marca`, !/mingles/i.test(t));
  ok(`${name}: imágenes OK`, await page.locator("img").evaluateAll((e) => e.every((x) => x.naturalWidth > 0)));
}
await browser.close();
const failed = S.filter((s) => Object.values(s)[0] !== "PASS");
console.log(JSON.stringify({ comprobaciones: S.length, pasan: S.length - failed.length, fallos: failed, errores: [...new Set(errs)] }, null, 1));
