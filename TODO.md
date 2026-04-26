# Search V2 Implementation TODO

## Approved Plan Phases (Step-by-step execution)

### Phase 1: Backend (chat.service.ts)
- [x] Standardize globalSearch response to {type: 'CONTACT'|'MESSAGE'|'FILE', id, conversationId?, sender: {name, avatar?}, content?, ...}
- [x] Limit 10-20 results per category
- [x] Test endpoint /chat/search?q=test



### Phase 2: searchStore.js
- [x] Update search() to call /chat/search?q=
- [x] Add activeId state, setActiveId(id), handleSelect(item) with nav logic
- [x] Compute sections: [{title: 'Contacts', data: []}, {title: 'Messages', data:[]}, {title: 'Files', data:[] }]

### Phase 3: SearchScreen.js UI
- [x] Switch to SectionList with sections from store
- [x] Create SearchItem component: TouchableOpacity with conditional golden border (#FFD700, width:2)
- [x] Debounce search input 300ms
- [x] Update handleSelectResult to store.handleSelect(item)

### Completed
- [x] All phases: Backend standardized, store updated, UI SectionList + golden border + debounce, nav logic, ChatScreen deep scroll.

### Post-Implementation
- [ ] Test full flow
- [ ] Keyword highlight in content
- [ ] attempt_completion

Progress will be updated after each step completion.

