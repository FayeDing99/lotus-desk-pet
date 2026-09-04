# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Tauri + Vite + TypeScript. The browser implementation must remain independently runnable when Rust or native-window tooling is unavailable.

## Users

One desktop user who wants a quiet companion beside everyday work rather than a high-attention game or utility dashboard.

## Product Purpose

Create a lightweight desktop companion that feels gently alive, responds to small interactions, remembers its state locally, and stays useful without interrupting focus.

## Positioning

The companion is organized around calm ambient presence and a lotus-tea character scene, with interaction revealed on demand instead of persistent app chrome.

## Operating Context

The pet lives in a small transparent always-on-top desktop window. The user drags it around, left-clicks to poke, right-clicks to reveal a compact action wheel, chats through an optional model-backed input, and occasionally checks its needs and relationship state.

## Capabilities and Constraints

- Current phase: transparent frameless always-on-top shell, draggable and scalable pet, idle movement, right-click action wheel, poke and tease reactions, local scene-based dialogue, optional model-backed chat, weather-aware lines, state panel, a small persistent food bag, basic feeding, sedentary reminders, and timed behaviors.
- State vocabulary: mood, satiety (shown to users as hunger), energy, and affection.
- Poke raises mood and affection without using a score or currency system.
- The wallet contains separate snack and prop shelves; each item can customize its name, state effects, and possible use lines, and can be used repeatedly without an inventory limit.
- AI and weather are optional and must fail safely back to the local script. There is still no complex shop or restocking flow, skeletal animation, or required remote service.
- The supplied PNG is the intended temporary character asset; it may be a single flattened image.
- The browser prototype remains independently runnable as the minimum fallback when native tooling is unavailable.

## Brand Commitments

The character should feel soft, quiet, companionable, and rooted in the existing lotus, lotus leaf, flower, tea table, and tea-drinking imagery. Motion should be gentle and never visually noisy.

## Evidence on Hand

The intended image path is `/mnt/data/Untitled_Artwork.png`, but that file was not present in the current environment at implementation time. No commercial claims or external evidence are needed.

## Product Principles

- Calm presence before attention-seeking behavior.
- Reveal controls only when the user asks for them.
- Make every small interaction feel acknowledged.
- Persist progress locally and keep rules understandable.
- Keep the first phase robust with a single flattened character image.

## Accessibility & Inclusion

Respect reduced-motion preferences, provide keyboard focus and accessible labels for controls, and keep all state information legible without relying on color alone.
