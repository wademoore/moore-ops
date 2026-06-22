# walmart-cart

## Purpose
Add a list of grocery or household items to the Walmart.com cart using browser automation via the Claude in Chrome extension.

## Trigger phrases
Activate this skill when the user says any of:
- "Add [items] to my Walmart cart"
- "Order [items] from Walmart"
- "Build my Walmart cart"
- "Add these to Walmart: ..."
- Or when the Weekly Review Phase 6 hands off a confirmed grocery list

## Input format
Accept items in any of these forms:
- Conversational list in the message: "Add milk, eggs, and bread"
- Numbered or bulleted list pasted into chat
- Structured text from Weekly Review output

The primary upstream source is the Weekly Review (Phase 6) running in Claude.ai, which produces a confirmed consolidated list as a copyable handoff prompt. Paste that prompt here to trigger the skill.

Parse each line as one item. Ignore quantity/notes annotations for the search query — use only the product name and brand. Example: "Ground Beef 93/7 lean, 1 lb (order 2)" → search "93/7 ground beef".

## Workflow

### 1. Confirm before starting
Echo the parsed item list back to the user and ask for confirmation before opening the browser. Example:
> "Ready to add these 18 items to your Walmart cart. Confirm?"

### 2. Open Walmart
Navigate to https://www.walmart.com. If already on Walmart, stay on the current tab.

### 3. For each item:
a. Navigate to `https://www.walmart.com/search?q=[url-encoded search query]`
b. Read the first 2–3 results
c. Select the best match — prefer Great Value house brand for generics, exact brand match for branded items
d. Click "Add to cart"
e. Confirm the item was added (look for cart count increment or confirmation toast)
f. Log the result: ✅ [item name added] or ⚠️ [item — no confident match found]

### 4. Handle no-match cases
If no confident match is found after reviewing results, skip the item and flag it in the summary. Do not add a wrong item.

### 5. Summary
After all items are processed, report:
- ✅ Added: [N items]
- ⚠️ Skipped (review manually): [list any flagged items]
- Cart link: https://www.walmart.com/cart

## Error handling
- If the browser isn't connected, stop and tell the user to open the Claude in Chrome extension first
- If Walmart shows a CAPTCHA or login wall, stop and notify the user — do not attempt to bypass
- If an item fails to add after one retry, skip and flag it

## Notes
- Do not remove existing cart items — only add
- Do not proceed to checkout
- Quantities: if the item specifies "order 2", add the item twice (search → add → search → add again)
