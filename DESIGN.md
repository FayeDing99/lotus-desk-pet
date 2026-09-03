# Design System

<!-- impeccable:design-schema 1 -->

## Direction

The interface is a warm watercolor lotus vignette arranged around the pet, not a conventional application window. The original illustration remains the visual center; controls appear as small round lotus ornaments, a speech bubble, and a parchment scroll only when requested.

## Palette

- Ivory paper `#FFFDF5`
- Lotus green `#A7C8A0`
- Deep lotus ink `#354C57`
- Mist blue `#7489A8`
- Petal blush `#E9B7AE`
- Tea brown `#806957`
- Seal red `#A94D42`, reserved for point feedback and important limits

## Typography

Use Noto Serif SC for the original P2-style speech, section titles, and short action labels; use Noto Sans SC for small supporting copy and numeric state. Numbers use tabular spacing.

## Materials and Components

- Speech appears in one softly irregular ivory bubble with a small leaf sprig and short tail.
- Toolbar actions are six evenly distributed round paper-and-ink medallions arranged on a loose arc around the lotus base.
- The state panel is one slightly tilted parchment scroll with ruled rows, plain linear meters, and a red seal.
- Borders are warm ink lines; shadows are soft, downward, and sparse.
- The transparent outer canvas is part of the design and must remain click-through wherever native support allows.

## Motion

The pet breathes and sways on a long, quiet loop. An ordinary click uses a small anticipate–lift–settle gesture with a faint petal bloom; poke is a slightly fuller squash-and-rebound. Dragging pauses ambient motion and adds a slight lift. Panels unfold once from their visual anchor. Reduced-motion mode removes sway and panel travel while preserving instant state changes.

## Interaction

Clicking the character toggles the orbit controls. Poke is a deliberate toolbar action so ordinary clicks do not accidentally farm points. Dialogue, feeding, bag, and state use anchored overlays that never obscure the face. Keyboard users can reach all actions, feed an item, submit dialogue, and dismiss open surfaces with Escape.

## Responsive Boundary

The intended Tauri viewport is approximately 560×700. At narrow browser widths, the status ledger moves below the character and the toolbar wraps as a single compact tray. The character remains dominant at every size.
