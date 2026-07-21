const fs = require('fs');
const path = 'C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js';
let content = fs.readFileSync(path, 'utf8');

// Single pass: replace all unguarded document.getElementById(id).addEventListener(...)
// with var _el = document.getElementById(id); if (_el) { _el.addEventListener(...) }
// and similarly for document.querySelector

// Strategy: process the file character by character.
// When we see "document.getElementById('X').addEventListener(" or "document.querySelector('X').addEventListener(",
// find the matching closing ");" by tracking paren/brace depth,
// then replace the whole statement with a guarded version.

function findMatchingParen(content, start) {
  var depth = 1;
  var i = start + 1;
  var inString = null;
  var escape = false;
  while (i < content.length) {
    var ch = content[i];
    if (escape) { escape = false; i++; continue; }
    if (ch === '\\' && inString) { escape = true; i++; continue; }
    if ((ch === '"' || ch === "'" || ch === '`') && !escape) {
      if (inString === ch) inString = null;
      else if (!inString) inString = ch;
      i++; continue;
    }
    if (inString) { i++; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === '{') depth = depth + 1000; // count braces as very deep
    if (ch === '}') depth = depth - 1000;
    if (depth === 0) return i;
    i++;
  }
  return -1;
}

function findStatementEnd(content, start) {
  // Find the end of statement starting with document.getElementById(...).addEventListener(...)
  // Count all parentheses and braces
  var i = start;
  var parenDepth = 0;
  var braceDepth = 0;
  var inString = null;
  var escape = false;

  while (i < content.length) {
    var ch = content[i];
    if (escape) { escape = false; i++; continue; }
    if (ch === '\\' && inString) { escape = true; i++; continue; }
    if ((ch === '"' || ch === "'" || ch === '`') && !escape) {
      if (inString === ch) inString = null;
      else if (!inString) inString = ch;
      i++; continue;
    }
    if (inString) { i++; continue; }
    if (ch === '(') { parenDepth++; i++; continue; }
    if (ch === ')') { parenDepth--; i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (ch === ';' && parenDepth === 0 && braceDepth === 0) {
      return i + 1;
    }
    i++;
  }
  return content.length;
}

// Match pattern: document.getElementById('...').addEventListener( ... );
// Or: document.querySelector('...').addEventListener( ... );
// The regex captures: method (getElementById|querySelector), fullSelector ('...'|"...")
var pattern = /document\.(getElementById|querySelector)\(('[^']*?'|"[^"]*?")\)/g;

// Track positions already processed to avoid re-processing inside generated code
var processed = new Set();
var result = '';
var lastEnd = 0;
var match;

pattern.lastIndex = 0;

while ((match = pattern.exec(content)) !== null) {
  var fullMatch = match[0]; // e.g., document.getElementById('chat-input')
  var method = match[1];
  var selector = match[2];
  var id = selector.slice(1, -1); // strip quotes
  var matchStart = match.index;
  
  // Only process if followed by .addEventListener(
  var afterMatch = content.substring(matchStart + fullMatch.length);
  if (!afterMatch.startsWith('.addEventListener(')) continue;
  
  // Check if already inside a processed block (skip these)
  var alreadyProcessed = false;
  for (var p of processed) {
    if (matchStart >= p.start && matchStart < p.end) {
      alreadyProcessed = true;
      break;
    }
  }
  if (alreadyProcessed) continue;
  
  // Find the full statement end
  var stmtEnd = findStatementEnd(content, matchStart);
  var stmt = content.substring(matchStart, stmtEnd);
  
  // Get indentation
  var lineStart = content.lastIndexOf('\n', matchStart - 1) + 1;
  if (lineStart < 0) lineStart = 0;
  var linePrefix = content.substring(lineStart, matchStart);
  var indentMatch = linePrefix.match(/^(\s*)/);
  var indent = indentMatch ? indentMatch[1] : '';
  
  // Build replacement with varName replacing document.getElementById/querySelector in the body
  var varName = method === 'getElementById'
    ? '_el' + id.replace(/[^a-zA-Z0-9]/g, '_')
    : '_elQs';
  
  // Replace the getElementById/querySelector with varName in the handler body
  var selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var reGet = new RegExp('document\\.' + method + '\\(' + selectorEscaped + '\\)', 'g');
  var handlerStmt = stmt.replace(reGet, varName);
  
  // Build guarded version
  var replacement;
  if (method === 'getElementById') {
    replacement = indent + 'var ' + varName + ' = document.getElementById(' + selector + ');\r\n';
    replacement += indent + 'if (' + varName + ') {\r\n';
    replacement += indent + '  ' + handlerStmt.replace(/\r\n/g, '\r\n' + indent + '  ').replace(/\n/g, '\n' + indent + '  ');
    replacement += '\r\n' + indent + '}';
  } else {
    replacement = indent + 'var ' + varName + ' = document.querySelector(' + selector + ');\r\n';
    replacement += indent + 'if (' + varName + ') {\r\n';
    replacement += indent + '  ' + handlerStmt.replace(/\r\n/g, '\r\n' + indent + '  ').replace(/\n/g, '\n' + indent + '  ');
    replacement += '\r\n' + indent + '}';
  }
  
  // Add text before this match, then the replacement
  result += content.substring(lastEnd, matchStart);
  result += replacement;
  lastEnd = stmtEnd;
  processed.add({ start: matchStart, end: lastEnd });
  
  console.log('Fixed:', id);
}

result += content.substring(lastEnd);
content = result;

fs.writeFileSync(path, content, 'utf8');
// Verify
var remaining = content.match(/document\.(getElementById|querySelector)\([^)]+\)\.addEventListener\(/g);
console.log('Remaining unguarded:', remaining ? remaining.length : 0);
if (remaining) for (var r of remaining) console.log('  ', r.substring(0, 70));
