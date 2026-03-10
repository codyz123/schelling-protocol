
import { chromium } from 'playwright';
import { readdir } from 'fs/promises';
import { join } from 'path';

const framesDir = '/tmp/schelling-video-delegation-model-60s-1773122455508/frames';
const files = (await readdir(framesDir)).filter(f => f.endsWith('.html')).sort();
console.log('Rendering ' + files.length + ' frames...');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

for (let i = 0; i < files.length; i++) {
  const htmlPath = join(framesDir, files[i]);
  const pngPath = htmlPath.replace('.html', '.png');
  await page.goto('file://' + htmlPath);
  await page.screenshot({ path: pngPath });
  if (i % 100 === 0) process.stdout.write('  ' + i + '/' + files.length + '\r');
}
console.log('  Done: ' + files.length + ' frames rendered');
await browser.close();
