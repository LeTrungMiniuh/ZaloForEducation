const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'screens');

const mapping = {
  'AuthScreen.js': 'auth',
  'ForgotPasswordScreen.js': 'auth',
  'LoginOtpScreen.js': 'auth',
  'LoginScreen.js': 'auth',
  'RegisterScreen.js': 'auth',
  'ResetPasswordScreen.js': 'auth',

  'HomeScreen.js': 'main',
  'ContactsScreen.js': 'main',
  'SessionsScreen.js': 'main',

  'ProfileScreen.js': 'profile',
  'ProfileMoreScreen.js': 'profile',
  'SettingsScreen.js': 'profile',
  'ChangePasswordScreen.js': 'profile',
  'StatusPickerScreen.js': 'profile',
  'QRScannerScreen.js': 'profile',
};

// Create dirs
const dirs = [...new Set(Object.values(mapping))];
dirs.forEach(d => {
  const p = path.join(srcDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

for (const [file, destFolder] of Object.entries(mapping)) {
  const oldPath = path.join(srcDir, file);
  if (!fs.existsSync(oldPath)) {
    console.log(`Skipping missing ${file}`);
    continue;
  }
  
  let content = fs.readFileSync(oldPath, 'utf8');

  // Fix relative imports going UP from screens/
  // Replace `from '../` with `from '../../`
  // Replace `require('../` with `require('../../`
  content = content.replace(/from\s+['"]\.\.\//g, "from '../../");
  content = content.replace(/require\(['"]\.\.\//g, "require('../../");

  // Fix peer imports `from './SomeScreen'`
  // We need to look up where `SomeScreen` is mapped.
  content = content.replace(/from\s+['"](\.\/[a-zA-Z0-9_-]+)['"]/g, (match, p1) => {
    // p1 is something like './LoginScreen'
    const importedFile = p1.substring(2) + '.js';  // 'LoginScreen.js'
    const targetFolder = mapping[importedFile];
    
    if (targetFolder) {
      if (targetFolder === destFolder) {
        // still in same folder
        return `from '${p1}'`;
      } else {
        // moving to different folder: e.g. from auth to main => '../main/HomeScreen'
        return `from '../${targetFolder}/${p1.substring(2)}'`;
      }
    }
    return match;
  });

  const newPath = path.join(srcDir, destFolder, file);
  fs.writeFileSync(newPath, content);
  console.log(`Moved ${file} to ${destFolder}`);
}
