# Music Player UI & Interaction Fixes Implementation Plan
> **For agent:** REQUIRED SUB-SKILL: Use Section 4 or Section 5 to implement this plan.
**Goal:** Fix vinyl cover mapping, snapping logic, and playlist popover occlusion in `nova_repo`.
**Architecture:** Use `createPortal` for `PlaylistPopover` to avoid overflow clipping; adjust thresholds and logic in `FloatingMusicCapsule` for smoother snapping; synchronize `MusicPlayerComponent` with `MusicContext`.
**Tech Stack:** React, Framer Motion, Tiptap, Lucide React.

## Task 1: Refactor `PlaylistPopover.tsx` to use React Portal
**Files:**
- Modify: `nova_repo/nova-block/src/components/widgets/PlaylistPopover.tsx`
**Step 1:** Add `portal` and `anchorRect` props to `PlaylistPopoverProps`.
**Step 2:** Use `createPortal` from `react-dom` to render the popover to `document.body` if `portal` is true.
**Step 3:** Implement dynamic positioning logic if `anchorRect` is provided (to position it relative to the trigger button).

## Task 2: Fix `FloatingMusicCapsule.tsx` Snapping and Cover
**Files:**
- Modify: `nova_repo/nova-block/src/components/widgets/FloatingMusicCapsule.tsx`
**Step 1:** Reduce `SNAP_THRESHOLD_PX` from `150` to `80`.
**Step 2:** Update `handleDragEnd` to better determine snapping side based on center point.
**Step 3:** Use a consistent macaron gradient fallback for the vinyl cover.
**Step 4:** Pass its button's `getBoundingClientRect()` to the portalled `PlaylistPopover`.

## Task 3: Fix `MusicPlayerComponent.tsx` Occlusion and Cover
**Files:**
- Modify: `nova_repo/nova-block/src/components/widgets/MusicPlayerComponent.tsx`
**Step 1:** Use the unified macaron gradient fallback for the vinyl cover.
**Step 2:** Prefer `currentTrack.cover` if `isCurrent` is true.
**Step 3:** Pass the list button's `getBoundingClientRect()` to `PlaylistPopover` and enable `portal`.

## Task 4: Final Verification
- Run local lint check (if applicable).
- Verify all changes match the user's feedback.
- Commit with: `fix(music): 修复黑胶封面映射、右侧吸附阈值及列表被编辑器遮挡的问题`
- Push to `main` branch.
