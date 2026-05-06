# Mobile Group Creation - Quick Reference Guide

## 🚀 Quick Start

### Route Navigation

```typescript
// From any screen:
navigation.navigate("CreateGroup");

// After group creation:
navigation.replace("Chat", { conversationId: res.data.id });
```

### What Does It Do?

1. **Display** responsive group creation UI (phone/tablet)
2. **Load** user's accepted friends from backend
3. **Allow** user to:
   - Pick group avatar
   - Enter group name (max 50 chars)
   - Search and select members (min 2)
   - Remove selected members
4. **Create** group via API with all details
5. **Navigate** to new group chat

## 📋 Requirements for Group Creation

| Field         | Requirement     | Notes                       |
| ------------- | --------------- | --------------------------- |
| Group Name    | 1-50 characters | Required, shows counter     |
| Members       | Minimum 2       | At least 2 different people |
| Avatar        | Optional        | Can be selected or skipped  |
| Member Status | "accepted"      | Only shows accepted friends |

## 🎨 UI States

### Create Button States

```
Disabled (Gray):     Name empty OR Members < 2
Enabled (Blue):      Name filled AND Members ≥ 2
Loading (Spinner):   API call in progress
```

### Member Selection

```
Unselected: ○ (Empty circle)
Selected:   ✓ (Filled circle with checkmark)
```

## 🔌 Backend Dependencies

### Required Endpoints

```
GET  /friends                      → Load friends list
POST /chat/uploads                 → Upload avatar
POST /chat/conversations/group     → Create group
```

### Request Body Format

```typescript
{
  name: "Team Discussion",           // string, required
  memberEmails: [                    // string[], required (min 2)
    "user1@example.com",
    "user2@example.com"
  ],
  avatar: "https://..."              // string, optional
}
```

### Response Format

```typescript
{
  ok: true,
  data: {
    id: "group-id",                  // new group ID
    name: "Team Discussion",
    members: [...],
    avatar: "https://..."
  }
}
```

## 🎯 Key Props & Params

### Screen Props

```typescript
interface CreateGroupScreenProps {
  navigation: any; // React Navigation
}
```

### No Input Params Required

- Screen is self-contained
- Loads friends and data automatically

## 💾 State Variables

| Variable          | Type           | Purpose                |
| ----------------- | -------------- | ---------------------- |
| `groupName`       | string         | Current group name     |
| `groupNameLength` | number         | Character counter      |
| `searchText`      | string         | Friend search query    |
| `friends`         | Friend[]       | Loaded friend list     |
| `selectedEmails`  | Set<string>    | Selected member emails |
| `groupAvatar`     | string \| null | Selected avatar URI    |
| `loading`         | boolean        | Friends loading state  |
| `creating`        | boolean        | Group creation state   |
| `scaleAnim`       | Animated.Value | Avatar animation       |

## 🔄 Data Flow

```
Component Mount
    ↓
Load Friends (useEffect)
    ↓
GET /friends
    ↓
Filter accepted friends
    ↓
Display in list
    ↓
User Interaction
    ├─ Select/Deselect members
    ├─ Pick avatar
    ├─ Enter group name
    └─ Click Create
    ↓
Validation Check
    ├─ Name not empty ✓
    ├─ Members ≥ 2 ✓
    └─ Avatar optional
    ↓
Upload Avatar (if selected)
    └─ POST /chat/uploads
    ↓
Create Group
    └─ POST /chat/conversations/group
    ↓
Success
    ├─ Fetch conversations update
    └─ Navigate to Chat screen
    ↓
Error (show Alert)
    └─ Stay on screen for retry
```

## 🎮 User Interactions

### Avatar Selection

```
User Tap → Image Picker Modal → Select Image → Compress & Preview → Save URI
```

### Member Selection

```
User Tap Friend → Toggle Selection → Update selectedEmails Set → Re-render
```

### Group Creation

```
User Tap Create → Validate Form → Upload Files → API Call → Navigate
```

## 🚨 Error Handling

| Scenario             | Handling                               |
| -------------------- | -------------------------------------- |
| No group name        | Alert: "Vui lòng nhập tên nhóm"        |
| < 2 members          | Alert: "Chọn ít nhất 2 thành viên"     |
| Avatar upload fails  | Continue with no avatar                |
| Group creation fails | Alert: Error message + stay on screen  |
| No friends loaded    | Show empty state: "Bạn chưa có bạn bè" |

## 📱 Responsive Behavior

### Phone (< 768px)

- Vertical layout
- Compact avatar (50x50px)
- Full-width inputs
- Horizontal scrollable selected members

### Tablet (≥ 768px)

- Two-column layout
- Left panel fixed width (280px)
- Large avatar (100x100px)
- Right panel scrollable
- Footer with buttons

## 🎨 Styling Customization

### Key Style Variables

```typescript
Colors.primary; // Primary blue color
fontSize: 18; // Headers
fontSize: 14 - 15; // Body text
fontSize: 12; // Labels
fontWeight: 700; // Headers
fontWeight: 600; // Subheaders
fontWeight: 500; // Body
```

### Spacing Unit

- Base padding: 16px
- Small gaps: 8px
- Large gaps: 20px

## 🔍 Debug Tips

### Check Friends Loaded

```typescript
console.log("Friends:", friends);
console.log("Profiles:", userProfiles);
```

### Check Selected Members

```typescript
console.log("Selected:", Array.from(selectedEmails));
```

### Monitor State Changes

```typescript
console.log("Group Name:", groupName);
console.log("Avatar:", groupAvatar);
console.log("Creating:", creating);
```

## 📝 Testing Checklist

- [ ] Create group with 2 members + avatar
- [ ] Create group with 2 members no avatar
- [ ] Search filters friends correctly
- [ ] Avatar animation plays smoothly
- [ ] Selected members removable
- [ ] Error alerts show properly
- [ ] Loading states display
- [ ] Navigation to chat succeeds
- [ ] Phone layout looks good
- [ ] Tablet layout looks good
- [ ] Character limit enforced
- [ ] Disabled state prevents creation

## 🔗 Related Components

- **HomeScreen**: Entry point
- **ChatScreen**: Destination after creation
- **ChatStore**: For data persistence
- **AuthContext**: For user data

## 📚 Files Modified/Created

```
✅ apps/mobile/src/screens/main/CreateGroup.tsx (Enhanced)
✅ MOBILE_GROUP_CREATION_DOCS.md (Documentation)
✅ MOBILE_GROUP_CREATION_LAYOUT.md (Visual guide)
```

## 🎯 Next Steps (Optional Enhancements)

- [ ] Add recent contacts quick add
- [ ] Support group description field
- [ ] Allow member role assignment
- [ ] Add rich text formatting for name
- [ ] Support QR code sharing after creation
- [ ] Add group creation templates
- [ ] Support invite via link
