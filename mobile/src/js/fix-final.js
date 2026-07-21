const fs = require("fs");
const path = "C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js";
let content = fs.readFileSync(path, "utf8");

// Find and fix the two remaining members-content handlers
// Use simple brace counting (count ALL { and }, strings don't contain them here)

const lines = content.split(/\r?\n/);

// First, find the guard start lines
let clickGuardStart = -1;
let changeGuardStart = -1;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes("_elmembers_content = document.getElementById('members-content')"))
    clickGuardStart = i;
  if (l.includes("_elmembers_content_ch = document.getElementById('members-content')"))
    changeGuardStart = i;
}

console.log("Click guard:", clickGuardStart, "Change guard:", changeGuardStart);

function findHandlerEnd(lines, startFrom) {
  let brace = 0;
  let foundBody = false;
  for (let i = startFrom; i < lines.length; i++) {
    const l = lines[i];
    // Count all { and } in line (simple, no string tracking needed)
    let lineBrace = 0;
    for (let k = 0; k < l.length; k++) {
      if (l[k] === "{") lineBrace++;
      if (l[k] === "}") lineBrace--;
    }
    // Only start counting after we enter the event handler function
    // Check if this line contains the addEventListener function opening
    if (!foundBody && l.includes("addEventListener(") && l.includes("function") && l.includes("{")) {
      foundBody = true;
      brace = 1; // The function opening {
      // Account for any other { on this line
      const match = l.match(/\{/g);
      brace = match ? match.length : 1;
      // Account for } on this line
      const closeMatch = l.match(/\}/g);
      brace -= closeMatch ? closeMatch.length : 0;
      continue;
    }
    if (foundBody) {
      brace += lineBrace;
      if (brace === 0 && l.trim() === "});") {
        return i;
      }
    }
  }
  return -1;
}

if (clickGuardStart >= 0) {
  const clickEnd = findHandlerEnd(lines, clickGuardStart + 2);
  console.log("Click end:", clickEnd);
  if (clickEnd > 0) {
    // Add 2 spaces indent to lines from clickGuardStart+3 to clickEnd-1
    for (let i = clickGuardStart + 3; i < clickEnd; i++) {
      lines[i] = "  " + lines[i];
    }
    // Add closing } for if block after clickEnd
    lines.splice(clickEnd + 1, 0, "      }");
  }
}

// Re-split
content = lines.join("\n");
const lines2 = content.split(/\r?\n/);

if (changeGuardStart >= 0) {
  // Find new position of change guard
  let chStart = -1;
  for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].includes("_elmembers_content_ch = document.getElementById('members-content')")) {
      chStart = i;
      break;
    }
  }
  console.log("Change guard new pos:", chStart);
  if (chStart >= 0) {
    const chEnd = findHandlerEnd(lines2, chStart + 2);
    console.log("Change end:", chEnd);
    if (chEnd > 0) {
      for (let i = chStart + 3; i < chEnd; i++) {
        lines2[i] = "  " + lines2[i];
      }
      lines2.splice(chEnd + 1, 0, "  }");
    }
  }
}

fs.writeFileSync(path, lines2.join("\n"), "utf8");
console.log("Done");
