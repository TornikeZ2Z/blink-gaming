// Draws the LED textures the Blender kit needs into blender/: every face, the power-on steps and the chest numbers.
// Serve the repo root (python -m http.server 8000), then: node textures.mjs http://localhost:8000/ [outdir]
// Needs puppeteer-core (npm i puppeteer-core) and Chrome.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const base = process.argv[2] || 'http://localhost:8000/', out = process.argv[3] || fileURLToPath(new URL('./blender/', import.meta.url));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(base + 'Brainer%203D/textures.html', { waitUntil: 'networkidle0' }); await page.waitForFunction(() => document.title === 'ready');
const save = (name, data) => fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
for (const ex of ['rest', 'happy', 'wink', 'excited', 'amazed', 'love', 'proud', 'think', 'calm', 'wise', 'focus'])
  save(`face_pixel_${ex}_bg.png`, await page.evaluate(e => window.face(e), ex));
for (const [name, p] of [['off', 0], ['dot', 0.13], ['line', 0.3], ['open', 0.44], ['grid', 0.62], ['face', 0.8], ['on', 1]])
  save(`face_power_${name}_bg.png`, await page.evaluate(q => window.face('happy', q), p));
for (let n = 1; n <= 10; n++) save(`num_${n}.png`, await page.evaluate(k => window.number(k), n));
await browser.close(); console.log('textures saved to', out);
