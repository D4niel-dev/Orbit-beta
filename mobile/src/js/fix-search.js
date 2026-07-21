const fs = require('fs');
const path = 'C:\\Users\\Windows\\Desktop\\Orbit Beta\\mobile\\src\\js\\app.js';
let content = fs.readFileSync(path, 'utf8');
const oldCode = `  // Search inputs\r\n  document.getElementById('search-input').addEventListener('input', function() {\r\n    searchFilter = this.value;\r\n    renderChatList();\r\n  });`;
const newCode = `  // Search inputs\r\n  var searchInputEl = document.getElementById('search-input');\r\n  if (searchInputEl) {\r\n    searchInputEl.addEventListener('input', function() {\r\n      searchFilter = this.value;\r\n      renderChatList();\r\n    });\r\n  }`;
if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Fixed search-input null guard');
} else {
  console.log('Old code not found with CRLF');
}
