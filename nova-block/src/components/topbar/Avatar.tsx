import React from 'react';

/** 顶栏圆形头像，支持用户上传后通过 localStorage 覆盖默认图。 */
export default function Avatar() {
  const [src, setSrc] = React.useState<string>(() => {
    return localStorage.getItem('qz.avatar.src') || '/assets/qingzhi/avatar/default.webp';
  });

  React.useEffect(() => {
    const handler = () => setSrc(localStorage.getItem('qz.avatar.src')
      || '/assets/qingzhi/avatar/default.webp');
    window.addEventListener('storage', handler);
    window.addEventListener('qz:avatar-changed', handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('qz:avatar-changed', handler as EventListener);
    };
  }, []);

  return (
    <div className="qz-avatar" title="个人">
      <img src={src} alt="头像" />
    </div>
  );
}
