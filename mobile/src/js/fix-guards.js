const fs = require("fs");
const path = "C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js";
const content = fs.readFileSync(path, "utf8");
const lines = content.split(/\r?\n/);
const nl = content.indexOf("\r\n") >= 0 ? "\r\n" : "\n";

// Collect all line ranges to fix
const fixes = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Match: document.getElementById('...').addEventListener( or document.querySelector('...').addEventListener(
  const m = line.match(/document\.(getElementById|querySelector)\(('[^']+'|"[^"]+")\)\.addEventListener\(/);
  if (!m) continue;

  // Check if already guarded: look backwards for a var assignment for this element
  let alreadyGuarded = false;
  for (let j = Math.max(0, i - 10); j < i; j++) {
    const guardCheck = lines[j].match(
      new RegExp("var\\s+\\w+\\s*=\\s*document\\." + m[1] + "\\(" + m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\)")
    );
    if (guardCheck) {
      // Also check that the next line has "if ("
      if (j + 1 < i && lines[j + 1].includes("if (_el")) {
        alreadyGuarded = true;
        break;
      }
    }
  }
  if (alreadyGuarded) continue;

  // Find the end of this addEventListener call
  const startLine = i;

  // Check if it's a one-liner: line ends with );
  if (/\);$/.test(line)) {
    fixes.push({ start: startLine, end: startLine + 1 });
    continue;
  }

  // Multi-line: find matching end of function body
  // Check if the event handler is inline: function() { ... }
  // We need to find the closing });
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = null;
  let endLine = -1;

  for (let j = startLine; j < lines.length; j++) {
    const l = lines[j];
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      const nextCh = l[k + 1];

      // String tracking
      if (inString) {
        if (ch === "\\") { k++; continue; }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }

      // Regex literal tracking: / starts a regex if not preceded by a word char, ), ]
      if (ch === "/" && !/[\w)\]]/.test(l[k - 1] || " ")) {
        // Skip until the closing / (handle escaped \/)
        let regexEnd = -1;
        for (let r = k + 1; r < l.length; r++) {
          if (l[r] === "\\") { r++; continue; }
          if (l[r] === "/") { regexEnd = r; break; }
        }
        if (regexEnd >= 0) {
          k = regexEnd; // skip past the closing / (loop k++ will advance past flags)
          continue;
        }
      }

      if (ch === "(") parenDepth++;
      if (ch === ")") parenDepth--;
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }

    // Check if this line ends the statement
    if (braceDepth === 0 && parenDepth === 0 && l.trim().endsWith(");")) {
      endLine = j + 1;
      break;
    }
  }

  if (endLine === -1) {
    console.log("ERROR: Could not find end for:", line.substring(0, 60));
    continue;
  }

  fixes.push({ start: startLine, end: endLine });
}

console.log("Found", fixes.length, "unguarded patterns");

// Process fixes from LAST to FIRST to avoid line number shifts
fixes.reverse();

let outputLines = lines.slice(); // copy

for (const fix of fixes) {
  const startLine = fix.start;
  const endLine = fix.end;

  // Extract the original statement lines
  const stmtLines = outputLines.slice(startLine, endLine);
  const stmt = stmtLines.join(nl);

  // Determine the method and selector from the first line
  const m = stmtLines[0].match(/document\.(getElementById|querySelector)\(('[^']+'|"[^"]+")\)\.addEventListener\(/);
  if (!m) {
    console.log("ERROR: No match in:", stmtLines[0].substring(0, 60));
    continue;
  }

  const method = m[1];
  const selector = m[2];
  const id = selector.slice(1, -1);
  const varName = method === "getElementById"
    ? "_el" + id.replace(/[^a-zA-Z0-9]/g, "_")
    : "_elQuery";

  // Get indentation from first line
  const indentMatch = stmtLines[0].match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : "";

  // In the handler body, replace document.getElementById('id') with varName
  // And document.querySelector('...') with varName
  const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docRe = new RegExp(
    "document\\." + method + "\\(" + selectorEscaped + "\\)",
    "g"
  );
  const handlerLines = stmtLines.map((l) => l.replace(docRe, varName));

  // Build the guarded version
  const guardLines = [
    indent + "var " + varName + " = document." + method + "(" + selector + ");",
    indent + "if (" + varName + ") {",
  ];

  // Add the handler body with extra indentation
  // Strip original indent from first line, then add indent + "  "
  const baseIndent = indent + "  ";
  for (let h = 0; h < handlerLines.length; h++) {
    const trimmedLine = h === 0
      ? handlerLines[h].replace(/^\s+/, "") // completely strip leading whitespace from first line
      : handlerLines[h]; // keep original indentation for subsequent lines

    guardLines.push(baseIndent + trimmedLine);
  }

  guardLines.push(indent + "}");

  // Replace the lines
  const before = outputLines.slice(0, startLine);
  const after = outputLines.slice(endLine);
  outputLines = before.concat(guardLines, after);

  console.log("FIXED:", id);
}

const result = outputLines.join(nl);
fs.writeFileSync(path, result, "utf8");

// Verify
const remaining = result.match(/document\.(getElementById|querySelector)\([^)]+\)\.addEventListener\(/g);
console.log("Remaining unguarded:", remaining ? remaining.length : 0);
