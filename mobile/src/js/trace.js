const fs = require('fs');
const lines = fs.readFileSync('C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js', 'utf8').split(/\r?\n/);

let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("document.getElementById('members-content').addEventListener('click'")) {
    startLine = i;
    break;
  }
}
console.log('Start:', startLine+1);

let brace = 0, paren = 0, inStr = null;

// Track where inStr changes
for (let i = 0; i < startLine; i++) {
  const l = lines[i];
  for (let k = 0; k < l.length; k++) {
    const ch = l[k];
    if (inStr) {
      if (ch === '\\') { k++; continue; }
      if (ch === inStr) { inStr = null; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '/' && !/[\w)\]}]/.test(l[k-1] || ' ')) {
      let reEnd = -1;
      for (let r = k+1; r < l.length; r++) {
        if (l[r] === '\\') { r++; continue; }
        if (l[r] === '/') { reEnd = r; break; }
      }
      if (reEnd >= 0) { k = reEnd; continue; }
    }
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') brace++;
    if (ch === '}') brace--;
  }
}

console.log('At handler start: brace=' + brace + ' paren=' + paren + ' inStr=' + inStr);
