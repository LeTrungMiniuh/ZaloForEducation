const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'screens');

const folders = ['auth', 'main', 'profile'];

function scanAndFix() {
  for (const folder of folders) {
    const dir = path.join(srcDir, folder);
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (!f.endsWith('.js')) continue;
      const fullPath = path.join(dir, f);
      let content = fs.readFileSync(fullPath, 'utf8');

      // Fix mismatched quotes: from '../../..." or require('../../...")
      content = content.replace(/from\s+'(\.\.\/[\w/.-]+)"/g, 'from \'$1\'');
      content = content.replace(/from\s+"(\.\.\/[\w/.-]+)'/g, 'from "$1"');
      content = content.replace(/require\('(\.\.\/[\w/.-]+)"\)/g, 'require(\'$1\')');
      content = content.replace(/require\("(\.\.\/[\w/.-]+)'\)/g, 'require("$1")');

      // Do it safely for anything I hardcoded 
      // Actually just fix explicitly what broke: from '../../constants/Theme"; => from '../../constants/Theme';
      content = content.replace(/from '\.\.\/\.\.\/([\w/.-]+)"/g, "from '../../$1'");
      content = content.replace(/require\('\.\.\/\.\.\/([\w/.-]+)"\)/g, "require('../../$1')");

      fs.writeFileSync(fullPath, content);
    }
  }
}

scanAndFix();
console.log("Fixed quotes");
