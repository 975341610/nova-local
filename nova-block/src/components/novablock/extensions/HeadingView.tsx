import React from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

export const HeadingView = ({ node, updateAttributes }: any) => {
  const { level, collapsed, id } = node.attrs;
  const isCollapsed = collapsed === true;

  const toggleCollapse = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateAttributes({ collapsed: !isCollapsed });
  };

  const CustomTag = `h${level}` as any;

  return (
    <NodeViewWrapper id={id} className={`group/heading relative mt-6 mb-2 pl-[2.2rem] -ml-[2.2rem] ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div 
        className={`absolute left-2 top-0 bottom-0 w-[1.6rem] z-10 cursor-pointer transition-all duration-100
          ${isCollapsed ? 'opacity-100' : 'opacity-0 group-hover/heading:opacity-100'}
        `}
        onClick={toggleCollapse}
        contentEditable={false}
        title={isCollapsed ? '展开' : '收起'}
      >
        <div className="absolute left-0 top-[0.35em] p-1 rounded-md hover:bg-stone-200/50 dark:hover:bg-stone-700/50 flex items-center justify-center">
          <svg 
            viewBox="0 0 24 24" 
            width="14" 
            height="14" 
            fill="currentColor"
            className={`text-stone-400 hover:text-stone-600 transition-transform duration-100 ${!isCollapsed ? 'rotate-90' : ''}`}
          >
            <path d="M9 6l6 6-6 6z" />
          </svg>
        </div>
      </div>
      <CustomTag>
        <NodeViewContent className="inline-block w-full" />
      </CustomTag>
    </NodeViewWrapper>
  );
};
