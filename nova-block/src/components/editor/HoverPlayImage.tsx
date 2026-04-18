import React, { useState } from 'react';

interface HoverPlayImageProps {
  src: string;
  thumbSrc: string;
  alt?: string;
  className?: string;
}

export const HoverPlayImage: React.FC<HoverPlayImageProps> = ({ src, thumbSrc, alt, className }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`relative w-full h-full cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 缩略图 (第一帧) */}
      <img
        src={thumbSrc}
        alt={alt}
        className={`w-full h-full object-contain ${isHovered ? 'hidden' : 'block'}`}
        loading="lazy"
      />
      
      {/* 动画原图 (Hover时显示) */}
      {isHovered && (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain block"
        />
      )}
    </div>
  );
};
