// Title card HTML template
export function titleCard(opts: {
  headline: string;
  subhead?: string;
  width: number;
  height: number;
  logo?: boolean;
}): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${opts.width}px; height: ${opts.height}px;
  background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%);
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  color: #e6edf3; padding: 60px;
}
.headline {
  font-size: ${opts.width > 1200 ? 72 : 56}px; font-weight: 700;
  text-align: center; line-height: 1.2; max-width: 90%;
  background: linear-gradient(135deg, #ffffff 0%, #58a6ff 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.subhead {
  font-size: ${opts.width > 1200 ? 32 : 26}px; font-weight: 400;
  text-align: center; color: #8b949e; margin-top: 30px; max-width: 80%;
}
.logo {
  position: absolute; bottom: 60px;
  font-size: 24px; color: #58a6ff; font-weight: 600;
}
.dot { font-size: 28px; }
</style></head><body>
<div class="headline">${opts.headline}</div>
${opts.subhead ? `<div class="subhead">${opts.subhead}</div>` : ''}
${opts.logo !== false ? '<div class="logo"><span class="dot">◉</span> Schelling Protocol</div>' : ''}
</body></html>`;
}
