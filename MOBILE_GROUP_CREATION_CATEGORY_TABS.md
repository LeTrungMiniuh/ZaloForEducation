# Mobile Group Creation - Category Tabs Feature Update

## What's New

The group creation screen now displays contacts with **two tabs** just like Zalo:

- **GẮN ĐẬY** (Recent) - Shows recent contacts from your chat history
- **DANH BẠ** (All Contacts) - Shows all accepted friends

## Features Added

### 1. **Category Filtering**

- **Recent Contacts Tab**: Only shows people you've recently chatted with
  - Automatically extracted from your recent conversations
  - Updates in real-time based on chat history
- **All Contacts Tab**: Shows your complete friend list
  - Displays all accepted friends from the backend
  - Can be searched and filtered

### 2. **Smart Contact Loading**

- Contacts are fetched from:
  - **Recent**: From `conversations` array (direct message threads)
  - **All**: From backend `/friends` API endpoint

### 3. **Search & Filter**

- Search works across both tabs
- Type name or email to filter contacts
- Case-insensitive matching

### 4. **Visual Indicators**

- **Phone Layout**:
  - Underlined tab shows active selection
  - Blue border under selected tab
  - Text color changes (gray → primary blue)

- **Tablet Layout**:
  - Solid colored buttons instead of underlines
  - Active tab has primary blue background
  - Inactive tabs have light gray background

## Technical Implementation

### State Management

```typescript
const [selectedCategory, setSelectedCategory] = useState<"recent" | "all">(
  "recent",
);
```

### Contact Categorization

```typescript
// Recent contacts from conversations
const recentEmails = new Set<string>();
conversations.forEach((conv: any) => {
  if (conv.type === "direct" && conv.members) {
    const partner = conv.members.find((m: string) => m !== user?.email);
    if (partner) recentEmails.add(partner.toLowerCase());
  }
});

// Filter by category
if (selectedCategory === "recent") {
  filtered = friends.filter((f) => recentEmails.has(f.email.toLowerCase()));
}
```

### UI Components

**Phone Layout** - Category tabs with underline indicator:

```
┌─────────────────────────────────────┐
│ GẮN ĐẬY  |  DANH BẠ                │ ← Tabs
│ ┃─────────┃                         │    Active has underline
├─────────────────────────────────────┤
│ 👤 Tín Trầu          ○             │
│ 👤 chị 2 tui        ○             │
│ ...                                 │
└─────────────────────────────────────┘
```

**Tablet Layout** - Category tabs as buttons:

```
┌────────────────────────────────────────┐
│ [GẮN ĐẬY] [DANH BẠ]    [🔍 Search] │
├────────────────────────────────────────┤
│ 👤 Tín Trầu          ✓               │
│ 👤 chị 2 tui        ○               │
└────────────────────────────────────────┘
```

## User Flow

1. **Open Create Group** → HomeScreen menu → "Tạo nhóm"
2. **Default View** → Shows "GẮN ĐẬY" (Recent contacts) first
3. **Switch Tabs** → Tap "DANH BẠ" to see all contacts
4. **Search** → Use search bar to filter within selected tab
5. **Select Members** → Tap checkboxes to add members
6. **Create Group** → Once 2+ members selected + name entered

## Styling

### Colors

- **Active Tab**: Primary blue (`Colors.primary`)
- **Inactive Tab**: Gray (`#94a3b8`)
- **Background**: Light gray (`#f1f5f9`)

### Typography

- Tab text: 13px, 600 weight, uppercase
- Active text: Bold (700 weight)

### Spacing

- Tab padding: 12px vertical, 12px horizontal
- Gap between tabs: 8px (tablet only)
- Margin: 12px top/bottom

## API Usage

### Fetching Friends

```typescript
// Initial load
const res = await chatGet("/friends");
// Returns: { ok: true, data: { friendships: [...] } }
```

### Contact Categories

- **Recent**: Extracted from `conversations` (Zustand store)
- **All**: From API response after filtering by status

## Browser/Device Support

✅ **Phone** (< 768px width)

- Horizontal tab layout with underline
- Touch-friendly sizes

✅ **Tablet** (≥ 768px width)

- Button-style tabs in search area
- More compact layout

✅ **Web** (if using React Native Web)

- Responsive design adapts automatically

## Future Enhancements

- [ ] Pinned/favorite contacts
- [ ] Contact search suggestions
- [ ] Quick add from recent
- [ ] Contact import
- [ ] QR code contact sharing
- [ ] Contact groups/categories

## Testing Checklist

- [ ] Recent contacts tab shows only chatted users
- [ ] All contacts tab shows all friends
- [ ] Switch between tabs works smoothly
- [ ] Search filters contacts in active tab
- [ ] Tab styling looks correct on phone
- [ ] Tab styling looks correct on tablet
- [ ] Empty states show appropriate messages
- [ ] Member selection works from both tabs
- [ ] Group creation with recent contacts
- [ ] Group creation with all contacts

## Performance Notes

- Recent contacts are efficiently filtered from existing conversations
- No additional API calls when switching tabs
- Memoization prevents unnecessary re-renders
- Search is case-insensitive and real-time

## Backward Compatibility

✅ Fully compatible with existing backend APIs
✅ Uses existing `/friends` endpoint
✅ Uses existing `conversations` store
✅ No database schema changes required
