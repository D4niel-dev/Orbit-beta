const fs = require("fs");
const path = "C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js";
const content = fs.readFileSync(path, "utf8");
const lines = content.split(/\r?\n/);

// Find members-content click handler and trace brace tracking
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("document.getElementById('members-content').addEventListener('click'")) {
    startLine = i;
    break;
  }
}
if (startLine < 0) { console.log("Not found"); process.exit(1); }
console.log("Start line:", startLine + 1, lines[startLine].substring(0, 80));

let braceDepth = 0;
let parenDepth = 0;
let inString = null;
let endLine = -1;

for (let j = startLine; j < lines.length; j++) {
  const l = lines[j];
  for (let k = 0; k < l.length; k++) {
    const ch = l[k];
    const nextCh = l[k + 1];

    if (inString) {
      if (ch === "\\") { k++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }

    // Regex literal
    if (ch === "/" && !/[\w)\]}]/.test(l[k - 1] || " ")) {
      let regexEnd = -1;
      for (let r = k + 1; r < l.length; r++) {
        if (l[r] === "\\") { r++; continue; }
        if (l[r] === "/") { regexEnd = r; break; }
      }
      if (regexEnd >= 0) { k = regexEnd - 0; continue; }
    }

    if (ch === "(") parenDepth++;
    if (ch === ")") parenDepth--;
    if (ch === "{") braceDepth++;
    if (ch === "}") braceDepth--;
  }

  if (j < startLine + 5 || j > 5400) {
    const ws = l.trimStart().substring(0, 40);
    console.log(`Line ${j + 1}: brace=${braceDepth} paren=${parenDepth} | ${ws}`);
  }

  if (braceDepth === 0 && parenDepth === 0 && l.trim().endsWith(");")) {
    endLine = j + 1;
    console.log("END FOUND at line", j + 1, ":", l.trim().substring(0, 60));
    break;
  }

  if (j > startLine + 550) {
    console.log("Hit limit, no end found");
    break;
  }
}

if (endLine === -1) {
  console.log("FAILED to find end. Final brace=" + braceDepth + " paren=" + parenDepth);
}
