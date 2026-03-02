// Match results cards with animated score bars
export function matchResults(opts: {
  candidates: Array<{ label: string; score: number; traits: string[]; price: string; }>;
  width: number;
  height: number;
  fillPercent: number; // 0-1, how much of the score bars are filled
}): string {
  const cards = opts.candidates.map((c, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const barWidth = Math.round(c.score * opts.fillPercent * 100);
    const scoreDisplay = (c.score * opts.fillPercent).toFixed(2);
    return `
    <div class="card">
      <div class="rank">${medals[i] || ''}</div>
      <div class="info">
        <div class="label">${c.label}</div>
        <div class="traits">${c.traits.join(' · ')} · ${c.price}</div>
        <div class="bar-bg"><div class="bar-fill" style="width:${barWidth}%"></div></div>
      </div>
      <div class="score">${scoreDisplay}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${opts.width}px; height: ${opts.height}px;
  background: #0a0a0f;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  font-family: -apple-system, sans-serif; color: #e6edf3; padding: 60px; gap: 24px;
}
.title { font-size: 36px; font-weight: 700; color: #58a6ff; margin-bottom: 20px; }
.card {
  width: 85%; background: #161b22; border: 1px solid #30363d; border-radius: 12px;
  padding: 24px 30px; display: flex; align-items: center; gap: 20px;
}
.rank { font-size: 36px; }
.info { flex: 1; }
.label { font-size: 22px; font-weight: 600; }
.traits { font-size: 15px; color: #8b949e; margin-top: 4px; }
.bar-bg { height: 8px; background: #30363d; border-radius: 4px; margin-top: 10px; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #58a6ff, #f0883e); border-radius: 4px; transition: none; }
.score { font-size: 32px; font-weight: 700; color: #f0883e; min-width: 80px; text-align: right; }
.logo { position: absolute; bottom: 40px; font-size: 20px; color: #30363d; font-weight: 600; }
</style></head><body>
<div class="title">Match Results</div>
${cards}
<div class="logo">◉ Schelling Protocol</div>
</body></html>`;
}
