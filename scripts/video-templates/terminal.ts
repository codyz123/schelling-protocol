// Terminal visual with typing animation
export function terminal(opts: {
  command: string;
  output: string;
  width: number;
  height: number;
  typedChars: number; // how many chars of command are visible
  showOutput: boolean; // whether to show the output
  cursorVisible: boolean;
}): string {
  const visibleCmd = opts.command.slice(0, opts.typedChars);
  const cursor = opts.cursorVisible ? '<span class="cursor">▌</span>' : '';
  
  // Syntax highlight JSON output
  const highlighted = opts.output
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span class="str">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="num">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="bool">$1</span>');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${opts.width}px; height: ${opts.height}px;
  background: #0a0a0f;
  display: flex; justify-content: center; align-items: center;
  font-family: -apple-system, sans-serif; padding: 40px;
}
.window {
  width: 90%; max-height: 85%; background: #161b22;
  border-radius: 12px; border: 1px solid #30363d; overflow: hidden;
}
.titlebar {
  height: 40px; background: #1c2128; display: flex; align-items: center; padding: 0 16px; gap: 8px;
}
.dot { width: 12px; height: 12px; border-radius: 50%; }
.red { background: #ff5f57; } .yellow { background: #febc2e; } .green { background: #28c840; }
.title { color: #8b949e; font-size: 13px; margin-left: 12px; }
.content {
  padding: 24px; font-family: 'SF Mono', 'Menlo', monospace;
  font-size: ${opts.width > 1200 ? 18 : 15}px; line-height: 1.6; color: #e6edf3;
  white-space: pre-wrap; word-break: break-all;
}
.prompt { color: #58a6ff; }
.cursor { color: #58a6ff; animation: none; }
.output { margin-top: 16px; color: #c9d1d9; }
.key { color: #79c0ff; } .str { color: #a5d6ff; } .num { color: #f0883e; } .bool { color: #7ee787; }
.logo {
  position: absolute; bottom: 40px; right: 50px;
  font-size: 20px; color: #30363d; font-weight: 600;
  font-family: -apple-system, sans-serif;
}
</style></head><body>
<div class="window">
  <div class="titlebar">
    <div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div>
    <span class="title">Terminal</span>
  </div>
  <div class="content"><span class="prompt">$</span> ${visibleCmd.replace(/&/g,'&amp;').replace(/</g,'&lt;')}${cursor}${opts.showOutput ? `\n\n<span class="output">${highlighted}</span>` : ''}</div>
</div>
<div class="logo">◉ Schelling Protocol</div>
</body></html>`;
}
