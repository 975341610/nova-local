import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Music, Play, ExternalLink } from 'lucide-react'

import { useMusicControls } from '../../contexts/MusicContext'
import { computePlaylistPopoverPosition } from '../../lib/playlistPopoverPosition'
import { formatUrl } from '../../lib/api'

interface PlaylistPopoverProps {
  onClose: () => void
  anchorRect?: DOMRect
  portal?: boolean
}

export const PlaylistPopover: React.FC<PlaylistPopoverProps> = ({ onClose, anchorRect, portal = false }) => {
  const { playlist, currentTrack, play } = useMusicControls()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [measuredPosition, setMeasuredPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!portal || !anchorRect || !containerRef.current) {
      setMeasuredPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      setMeasuredPosition(
        computePlaylistPopoverPosition(
          anchorRect,
          window.innerWidth,
          window.innerHeight,
          rect.width,
          rect.height,
        ),
      )
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [anchorRect, portal, playlist.length])

  const content = (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      className={`${portal ? 'fixed' : 'absolute bottom-full right-0 mb-4'} w-72 max-h-[400px] overflow-hidden bg-white/90 backdrop-blur-xl border border-white/40 shadow-2xl rounded-3xl flex flex-col z-[1000] playlist-popover-container`}
      style={portal && anchorRect
        ? (measuredPosition ?? computePlaylistPopoverPosition(anchorRect, window.innerWidth, window.innerHeight))
        : {}}
    >
      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-gradient-to-r from-pink-50 to-blue-50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-pink-400 rounded-lg text-white">
            <Music size={16} />
          </div>
          <span className="font-bold text-gray-800">播放列表</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-black/5 rounded-full text-gray-500 font-medium">
          {playlist.length} 首
        </span>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[300px] p-2 space-y-1 custom-scrollbar">
        {playlist.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            暂无歌曲
          </div>
        ) : (
          playlist.map((track, index) => {
            const isActive = currentTrack?.url === track.url
            return (
              <button
                key={`${track.url}-${index}`}
                onClick={() => play(track)}
                className={`w-full flex items-center gap-3 p-2 rounded-2xl transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-100 to-purple-100 shadow-sm'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="relative w-10 h-10 shrink-0 rounded-xl overflow-hidden shadow-sm">
                  {track.cover ? (
                    <img src={formatUrl(track.cover)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-400">
                      <Music size={16} />
                    </div>
                  )}
                  {isActive && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <Play size={14} fill="white" className="text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className={`text-sm font-bold truncate ${isActive ? 'text-pink-600' : 'text-gray-700'}`}>
                    {track.title}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                    {track.source === 'local' ? (
                      '本地文件'
                    ) : (
                      <><ExternalLink size={10} /> 网络直链</>
                    )}
                  </div>
                </div>

                {isActive && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full bg-pink-500 mr-2"
                  />
                )}
              </button>
            )
          })
        )}
      </div>

      <div className="p-3 bg-gray-50/50 text-center">
        <button
          onClick={onClose}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          关闭
        </button>
      </div>
    </motion.div>
  )

  if (portal) {
    return createPortal(content, document.body)
  }

  return content
}
