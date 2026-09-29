# ItemRow

One item on a bill's receipt: name, a quantity badge when it isn't 1, a dotted leader to the `mono` price, and a chevron; tap to expand it into the editable fields.

- **Category, never a lone dot.** By default the item's category (its own, else the bill's) sits on a small second line under the name: an 8px dot and the name, 12px `ink-soft`; "No category" in italics when there's none; nothing at all when the group has no categories. Price, leader and chevron line up with the first line, like a receipt's detail line.
- **Grouped** (Settings > Layout > Item categories on a bill, per device): the items go under one `.item-group-head` per category, dot, name and that category's subtotal in `mono`, and the rows drop their own category line. Groups follow the order their first item appears on the receipt; "No category" comes last.
- Rows are 8px-radius bordered cards on the receipt tape, 6px apart, 14px text; long names wrap, they're never cut short.
- Consumer provides: the item (name, quantity, total), the categories and the bill's category, and which of the two layouts to use.
