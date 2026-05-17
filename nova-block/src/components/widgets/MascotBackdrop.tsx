

/** 在侧边栏底部叠一层渐隐立绘水印。仅在 qingzhi 主题下显示。 */
export default function MascotBackdrop() {
  // 透明度由 SettingsDialog 写入 --qz-mascot-opacity
  return <div className="qz-mascot-backdrop" aria-hidden="true" />;
}
