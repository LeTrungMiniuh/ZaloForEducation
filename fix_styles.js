const fs = require('fs');
const path = 'apps/mobile/src/screens/main/HomeScreen.js';
let content = fs.readFileSync(path, 'utf8');

// Update composer style
content = content.replace(
  /composer:\s*\{[^}]*flexDirection:\s*"row"[^}]*alignItems:\s*"flex-end"[^}]*gap:\s*8[^}]*\}/s,
  `composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingBottom: Platform.OS === "ios" ? 14 : 6,
  }`
);

// Update composerAction - remove background color
content = content.replace(
  /composerAction:\s*\{[^}]*width:\s*34[^}]*backgroundColor:\s*"#f1f5fa"[^}]*\}/s,
  `composerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  }`
);

// Update composerActionIcon - larger size, different color
content = content.replace(
  /composerActionIcon:\s*\{[^}]*fontSize:\s*20[^}]*color:\s*"#52627f"[^}]*\}/s,
  `composerActionIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#6b7a91",
  }`
);

// Update composerInput - remove border for cleaner look
content = content.replace(
  /composerInput:\s*\{[^}]*borderWidth:\s*1[^}]*borderColor:\s*"#dfe5ef"[^}]*borderRadius:\s*16[^}]*\}/s,
  `composerInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
    ...Typography.body,
    fontSize: 15,
    color: "#1f2631",
    backgroundColor: "#fff",
  }`
);

fs.writeFileSync(path, content);
console.log('Composer styles updated.');
