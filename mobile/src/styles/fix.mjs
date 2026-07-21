import fs from 'fs';
const path = 'C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\styles\\mobile.css';
let css = fs.readFileSync(path, 'utf8');

css = css.replace(
  'transform 0.25s ease, border-color',
  'bottom 0.25s ease, border-color'
);
css = css.replace(
  'transform: translateY(8px);',
  'bottom: 24px;'
);

fs.writeFileSync(path, css);
console.log('OK');
