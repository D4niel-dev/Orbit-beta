/**
 * Find variables that are used outside the scope they were declared in.
 *
 * This is the bug that broke the updater twice: `total` and then `received` were declared
 * inside one promise callback and read in a later one. Both are separate function scopes, so
 * the read throws a ReferenceError at runtime — and `node --check` cannot see it, because the
 * syntax is perfectly valid.
 *
 * Method: parse each file, build the scope chain (function scopes for `var`, block scopes for
 * `let`/`const`), then resolve every identifier reference from where it appears. A reference
 * that resolves to nothing is fine if it is a global — so only names that ARE declared
 * somewhere in the file are reported. That is exactly the shape of this bug class: declared
 * here, read there, unreachable in between.
 *
 * Usage: node scripts/check-scope.js mobile/src desktop/src shared
 *
 * Needs acorn (npm i -D acorn). Worth running after touching any promise chain: this class of
 * bug is invisible to node --check, because the syntax is valid and only the scope is wrong.
 */
const fs = require('fs');
const path = require('path');
let acorn;
try {
  acorn = require('acorn');
} catch (e) {
  try {
    acorn = require('../desktop/node_modules/acorn');
  } catch (e2) {
    console.error('This check needs acorn:  npm i -D acorn');
    process.exit(2);
  }
}

function walkFiles(target, out) {
  const st = fs.statSync(target);
  if (st.isFile()) {
    if (/\.js$/.test(target) && !/\.min\.js$/.test(target)) out.push(target);
    return out;
  }
  for (const name of fs.readdirSync(target)) {
    if (name === 'node_modules' || name === 'vendor' || name === 'dist' || name === 'build') continue;
    walkFiles(path.join(target, name), out);
  }
  return out;
}

// ── scope handling ─────────────────────────────────────────────────────────
function Scope(parent, isFunction) {
  this.parent = parent;
  this.isFunction = isFunction;
  this.names = new Map();          // name -> declaration line
}
Scope.prototype.declare = function (name, line) {
  if (name && !this.names.has(name)) this.names.set(name, line);
};
Scope.prototype.functionScope = function () {
  let s = this;
  while (s && !s.isFunction) s = s.parent;
  return s || this;
};
Scope.prototype.resolve = function (name) {
  let s = this;
  while (s) {
    if (s.names.has(name)) return s;
    s = s.parent;
  }
  return null;
};

function isFunctionNode(n) {
  return n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' ||
    n.type === 'ArrowFunctionExpression');
}

function analyse(file) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
  } catch (e) {
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (e2) {
      return { file, parseError: e2.message };
    }
  }

  const declaredInFile = new Set();     // every name declared anywhere in the file
  const refs = [];                      // { name, line, scope }

  function collectDeclared(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
      declaredInFile.add(node.id.name);
    }
    if (isFunctionNode(node) && node.id && node.id.type === 'Identifier') declaredInFile.add(node.id.name);
    if (node.type === 'FunctionDeclaration' && node.id) declaredInFile.add(node.id.name);
    if (node.type === 'ClassDeclaration' && node.id) declaredInFile.add(node.id.name);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(collectDeclared);
      else if (v && typeof v === 'object' && typeof v.type === 'string') collectDeclared(v);
    }
  }
  collectDeclared(ast);

  function visit(node, scope) {
    if (!node || typeof node !== 'object') return;

    let current = scope;
    if (isFunctionNode(node)) {
      current = new Scope(scope, true);
      for (const p of node.params) declarePattern(p, current, node.loc.start.line);
      if (node.id && node.id.type === 'Identifier') current.declare(node.id.name, node.loc.start.line);
      if (node.type === 'FunctionDeclaration' && node.id) scope.declare(node.id.name, node.loc.start.line);
    } else if (node.type === 'BlockStatement') {
      current = new Scope(scope, false);
    }

    // Classes and imports bind names too. Missing these was my own false-positive generator:
    // a class declaration and an import were reported as unreachable because I never declared
    // them anywhere, which is the same "declared but not in scope" shape the tool looks for.
    if (node.type === 'ClassDeclaration' && node.id && node.id.type === 'Identifier') {
      scope.declare(node.id.name, node.loc.start.line);
    }
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        if (spec.local && spec.local.name) scope.declare(spec.local.name, node.loc.start.line);
      }
      return;   // the source string is not a reference
    }

    if (node.type === 'VariableDeclaration') {
      const target = node.kind === 'var' ? current.functionScope() : current;
      for (const d of node.declarations) declarePattern(d.id, target, d.loc.start.line);
    }

    if (node.type === 'CatchClause' && node.param) {
      current = new Scope(scope, false);
      declarePattern(node.param, current, node.loc.start.line);
    }

    // a reference: an Identifier that is not a declaration or a non-computed property
    if (node.type === 'Identifier') {
      refs.push({ name: node.name, line: node.loc.start.line, scope: current });
      return;
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) {
        for (const c of v) {
          if (c && typeof c === 'object' && typeof c.type === 'string') visit(c, current);
        }
      } else if (v && typeof v === 'object' && typeof v.type === 'string') {
        // skip non-computed property keys and member properties: they are not references
        if ((node.type === 'MemberExpression' && k === 'property' && !node.computed)) continue;
        if ((node.type === 'Property' && k === 'key' && !node.computed)) continue;
        visit(v, current);
      }
    }
  }

  function declarePattern(node, scope, line) {
    if (!node) return;
    if (node.type === 'Identifier') scope.declare(node.name, line);
    else if (node.type === 'ObjectPattern') node.properties.forEach(p => declarePattern(p.value || p.argument, scope, line));
    else if (node.type === 'ArrayPattern') node.elements.forEach(e => declarePattern(e, scope, line));
    else if (node.type === 'AssignmentPattern') declarePattern(node.left, scope, line);
    else if (node.type === 'RestElement') declarePattern(node.argument, scope, line);
  }

  visit(ast, new Scope(null, true));

  // the finding: a name declared in this file, referenced where it cannot be resolved
  const findings = [];
  for (const r of refs) {
    if (!declaredInFile.has(r.name)) continue;      // a global or an import — not our business
    if (!r.scope.resolve(r.name)) findings.push(r);
  }
  return { file, findings };
}

const targets = process.argv.slice(2);
const files = [];
for (const t of targets) walkFiles(t, files);

let total = 0, withFindings = 0, parseErrors = 0;
for (const f of files) {
  const r = analyse(f);
  if (r.parseError) { parseErrors++; continue; }
  if (r.findings.length) {
    withFindings++;
    console.log('\n' + r.file.replace(/\\/g, '/').replace(/^.*Orbit Beta\//, ''));
    const seen = new Set();
    for (const x of r.findings) {
      const key = x.name + ':' + x.line;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      console.log('   line ' + x.line + ':  ' + x.name + '  (declared in this file, but not in scope here)');
    }
  }
}
console.log('\n---');
console.log('files scanned: ' + files.length + '   parse errors: ' + parseErrors);
console.log('files with findings: ' + withFindings + '   findings: ' + total);
