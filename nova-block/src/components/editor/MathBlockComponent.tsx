import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Sigma, Edit3, Check } from 'lucide-react';

export function MathBlockComponent({ node, updateAttributes, selected }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [latex, setLatex] = useState(node.attrs.latex || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    updateAttributes({ latex });
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      setLatex(node.attrs.latex || '');
      setIsEditing(false);
    }
  };

  const renderMath = () => {
    try {
      return (
        <div 
          dangerouslySetInnerHTML={{ 
            __html: katex.renderToString(latex || '\\text{点击编辑数学公式}', {
              displayMode: true,
              throwOnError: false
            }) 
          }} 
        />
      );
    } catch (e) {
      return <div className="text-red-500 text-sm">LaTeX 语法错误</div>;
    }
  };

  return (
    <NodeViewWrapper className={`math-block-wrapper my-8 relative group ${selected ? 'ring-2 ring-blue-100 rounded-lg' : ''}`}>
      <div 
        className={`relative overflow-hidden transition-all duration-300 border rounded-xl 
          ${isEditing 
            ? 'bg-white border-blue-400 shadow-lg ring-4 ring-blue-50' 
            : 'bg-stone-50/30 border-stone-200/60 hover:border-stone-300 hover:bg-white hover:shadow-md cursor-pointer'
          }`}
        onClick={() => !isEditing && setIsEditing(true)}
      >
        {/* Header Indicator */}
        <div className="absolute top-2 left-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" contentEditable={false}>
          <Sigma size={12} className="text-stone-400" />
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Math Block</span>
        </div>

        {isEditing ? (
          <div className="p-4 pt-8" contentEditable={false}>
            <textarea
              ref={textareaRef}
              className="w-full bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 min-h-[100px] resize-y transition-all"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              placeholder="输入 LaTeX 代码，例如: E = mc^2"
            />
            <div className="flex justify-between items-center mt-3">
              <span className="text-[10px] text-stone-400 font-medium">
                Tip: <kbd className="px-1 rounded bg-stone-100 border border-stone-200">Cmd/Ctrl + Enter</kbd> 保存
              </span>
              <button 
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-all shadow-sm shadow-blue-200 active:scale-95"
              >
                <Check size={14} />
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 flex justify-center items-center min-h-[80px]" contentEditable={false}>
            <div className="transition-transform duration-300 transform group-hover:scale-[1.02]">
              {renderMath()}
            </div>
            
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="p-1.5 bg-white border border-stone-200 rounded-md shadow-sm text-stone-400 hover:text-blue-600">
                <Edit3 size={14} />
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
