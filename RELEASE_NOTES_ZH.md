# Release Notes

## [0.16.3] - 2026-04-13

### 修复
- **TableOfContents**: 修复了由于 Tiptap 渲染延迟导致大纲 ID 重复引发的 React key 重复报错。
- **具体实现**: 
  - 在大纲提取逻辑中引入了包含 `pos` 和 `level` 的复合唯一 Key，确保 React Key 的绝对唯一性。
  - 增强了 `TableOfContents` 组件的列表渲染稳定性。

## [0.16.1] - 2026-04-13

### 修复
- **UI**: 修复了黑胶播放器播放列表弹出框在滚动内部内容时会自动关闭的问题。
- **具体实现**: 
  - 在 `PlaylistPopover.tsx` 中为容器增加了 `playlist-popover-container` 类名。
  - 在 `MusicContext.tsx` 的全局滚动监听中，增加了对该类名的点击/滚动拦截，确保用户在查看长播放列表时能够顺畅滚动。
