const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// 1. Xác định các đường dẫn root
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// 2. Khởi tạo config mặc định từ Expo
const config = getDefaultConfig(projectRoot);

// 3. Monorepo: Theo dõi toàn bộ thư mục root để thấy node_modules chung
config.watchFolders = [monorepoRoot];

// 4. Resolver: Ưu tiên tìm modules trong app rồi mới lên root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 5. [SENIOR FIX] BlockList - Né các thư mục rác gây lỗi ENOENT trên Windows
config.resolver.blockList = [
  /.*\.gradle.*/,
  /.*node_modules\/.*\/build\/.*/,
  /.*node_modules\/.*\/ios\/.*/,
  /.*node_modules\/.*\/android\/.*/,
  /.*\.expo-.*/,
];

// 6. Đảm bảo hỗ trợ New Architecture nếu cần
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
