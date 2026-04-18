import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MusicPlayerComponent } from '../../../components/widgets/MusicPlayerComponent';

export const MusicPlayerNode = Node.create({
  name: 'musicPlayer',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: '',
      },
      title: {
        default: '未命名歌曲',
      },
      artist: {
        default: '未知艺术家',
      },
      cover: {
        default: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="music-player"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'music-player' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MusicPlayerComponent);
  },
});
