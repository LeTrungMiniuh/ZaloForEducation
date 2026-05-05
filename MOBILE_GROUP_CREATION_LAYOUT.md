# Mobile Group Creation - Layout Diagrams

## Phone Layout (< 768px width)

```
┌─────────────────────────────────────┐
│  ✕    Nhóm mới          Tạo    │  ← Header (Primary Blue)
├─────────────────────────────────────┤
│ [📷]  ┌──────────────────┐          │
│       │ Tên nhóm         │ 0/50    │  ← Avatar + Name Input
│       │ [________________] │          │
├─────────────────────────────────────┤
│ 🔍 Tìm tên hoặc email      │
├─────────────────────────────────────┤
│ Đã chọn 3                          │
│  [👤₁ Hùng ✕] [👤₂ Hà ✕] [👤₃] │  ← Selected Members Scroll
├─────────────────────────────────────┤
│                                      │
│  👤 Nguyễn Văn A         ✓           │  ← Friend List
│     nguyena@example.com              │
│                                      │
│  👤 Phạm Thị B                      │
│     phamb@example.com                │
│                                      │
│  👤 Trần Minh C          ✓           │
│     tranc@example.com                │
│                                      │
│  [... more friends ...]              │
│                                      │
└─────────────────────────────────────┘
```

## Tablet Layout (≥ 768px width)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Tạo nhóm                                                  [Close] │
├──────────────────────────┬────────────────────────────────────────┤
│                          │                                        │
│ THÔNG TIN NHÓM           │ CHỌN THÀNH VIÊN                      │
│                          │                                        │
│        [          ]      │ 🔍 Tìm tên hoặc email      │
│      [ 📷 Avatar ]       │                                        │
│     (100x100 px)         │ ┌────────────────────────────────────┐│
│                          │ │ 👤 Nguyễn Văn A         ✓ │
│ Tên nhóm                 │ │    nguyena@example.com    │
│ ┌──────────────────────┐ │ ├────────────────────────────────────┤
│ │ [Group Name] 12/50   │ │ │ 👤 Phạm Thị B                 │
│ └──────────────────────┘ │ │    phamb@example.com    │
│                          │ ├────────────────────────────────────┤
│                          │ │ 👤 Trần Minh C          ✓ │
│                          │ │    tranc@example.com    │
│                          │ ├────────────────────────────────────┤
│                          │ │ [... more friends ...]    │
│                          │ └────────────────────────────────────┘
│                          │
│                          │ Đã chọn: 2
│                          │ [Tag: Nguyễn ✕] [Tag: Trần ✕]
│                          │
├──────────────────────────┴────────────────────────────────────────┤
│  [Hủy]                              [➕ Tạo nhóm]               │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flow

```
HomeScreen
    │
    └─→ Add Menu Button
         │
         └─→ "Tạo nhóm" TouchableOpacity
              │
              └─→ Navigate to "CreateGroup"
                   │
                   ├─ Load Friends
                   │   └─→ GET /friends
                   │
                   ├─ User Actions:
                   │   ├─ Pick Avatar → chatUpload()
                   │   ├─ Enter Name (max 50 chars)
                   │   ├─ Search & Filter Friends
                   │   └─ Select/Deselect Members
                   │
                   └─→ Create Group Button
                        │
                        ├─ Upload Avatar (if selected)
                        │   └─→ POST /chat/uploads
                        │
                        ├─ Create Group Conversation
                        │   └─→ POST /chat/conversations/group
                        │
                        ├─ Refresh Conversations
                        │   └─→ fetchConversations()
                        │
                        └─→ Navigate to Chat Screen
                             └─→ Display New Group
```

## State Transitions

```
┌─────────────┐
│   IDLE      │  ← Initial state
└──────┬──────┘
       │ User picks avatar
       ▼
┌─────────────────┐
│ AVATAR_SELECTED │
└──────┬──────────┘
       │ User enters name & selects members
       ▼
┌──────────────────┐
│ FORM_VALID       │ ← Create button enabled
└──────┬───────────┘
       │ User clicks Create
       ▼
┌──────────────────┐
│ CREATING         │ ← Loading state
└──────┬───────────┘
       │
       ├─ Success → Navigate to Chat → IDLE
       │
       └─ Error → Show Alert → FORM_VALID
```

## Key Visual Elements

### Avatar Placeholder (Phone)

```
┌──────────────┐
│   📷         │  ← 50x50px
│   Camera     │     Blue border (2px)
│   Icon       │     Tap to pick image
└──────────────┘
```

### Selected Member Chip

```
[👤 Name ✕]  ← Primary blue background
              ← White text
              ← Close icon to remove
```

### Friend List Item (Selected)

```
👤 Name                    ✓
   email@example.com        ← Blue checkbox background
┃─────────────────────────────┃ ← Light blue highlight
```

### Form Validation States

**Valid State:**

- Name: 1-50 characters ✓
- Members: ≥ 2 selected ✓
- Create button: **ENABLED** (Blue, clickable)

**Invalid State:**

- Name: Empty ✗
- Members: < 2 ✗
- Create button: **DISABLED** (Gray, opacity 0.6)

## Color Coding

```
Primary Blue:    Used for headers, active buttons, badges
Light Gray:      Input backgrounds, borders
Dark Gray:       Text content
Success:         Checkmarks on selected items
Error:           Alert messages (if any)
```

## Responsive Breakpoint

- **< 768px**: Phone layout (vertical stack)
- **≥ 768px**: Tablet layout (two columns)

Detection: `useWindowDimensions()` hook monitors screen width

---

## Animation Flow

1. **Avatar Selection**: Scale animation (1.0 → 0.95 → 1.0)
2. **Member Selection**: Background color smooth transition
3. **Create Button**: Normal state to loading with spinner

All animations use `Animated` API with native driver for smooth 60fps performance.
