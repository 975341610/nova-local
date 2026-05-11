import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, formatUrl } from '../lib/api';

export interface Track {
  url: string;
  title: string;
  artist?: string;
  cover?: string;
  source?: 'local' | 'network';
}

interface MusicControlsContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  playlist: Track[];
  volume: number;
  play: (track: Track) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  stop: () => void;
  setPlaylist: (tracks: Track[]) => void;
  refreshPlaylist: () => Promise<void>;
  playlistPopoverAnchor: DOMRect | null;
  togglePlaylist: (anchor: HTMLElement | null) => void;
  closePlaylist: () => void;
}

interface MusicProgressContextType {
  progress: number;
  duration: number;
  setProgress: (v: number) => void;
}

const MusicControlsContext = createContext<MusicControlsContextType | undefined>(undefined);
const MusicProgressContext = createContext<MusicProgressContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgressState] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [volume, setVolume] = useState(0.8);
  const [playlistPopoverAnchor, setPlaylistPopoverAnchor] = useState<DOMRect | null>(null);
  const playlistAnchorRef = useRef<HTMLElement | null>(null);

  // 让 audio 标签在顶层常驻（避免因组件隐藏/重渲染导致音频中断）
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextRef = useRef<() => void>(() => {});

  const togglePlaylist = useCallback((anchor: HTMLElement | null) => {
    if (!anchor) {
      playlistAnchorRef.current = null;
      setPlaylistPopoverAnchor(null);
      return;
    }

    if (playlistAnchorRef.current === anchor) {
      playlistAnchorRef.current = null;
      setPlaylistPopoverAnchor(null);
      return;
    }

    playlistAnchorRef.current = anchor;
    window.requestAnimationFrame(() => {
      if (playlistAnchorRef.current !== anchor) {
        return;
      }
      setPlaylistPopoverAnchor(anchor.getBoundingClientRect());
    });
  }, []);

  const closePlaylist = useCallback(() => {
    playlistAnchorRef.current = null;
    setPlaylistPopoverAnchor(null);
  }, []);

  // 监听滚动自动关闭
  useEffect(() => {
    const handleScroll = (e: Event) => {
      // 忽略弹窗内部的滚动事件，防止歌单过长时一滑动就消失
      if (e.target && (e.target as HTMLElement).closest?.('.playlist-popover-container')) {
        return;
      }
      closePlaylist();
    };
    window.addEventListener('scroll', handleScroll, { capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [closePlaylist]);

  const play = useCallback(
    (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (currentTrack?.url === track.url) {
        if (!isPlaying) {
          audio.play().catch(console.error);
          setIsPlaying(true);
        }
        return;
      }

      setCurrentTrack(track);
      audio.src = track.url;
      audio.play().catch(console.error);
      setIsPlaying(true);
    },
    [currentTrack, isPlaying],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(console.error);
    setIsPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      resume();
    }
  }, [isPlaying, currentTrack, pause, resume]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    }
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgressState(0);
    setDuration(0);
  }, []);

  const next = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return;
    const index = playlist.findIndex(t => t.url === currentTrack.url);
    const nextIndex = (index + 1) % playlist.length;
    play(playlist[nextIndex]);
  }, [playlist, currentTrack, play]);

  const prev = useCallback(() => {
    if (playlist.length === 0 || !currentTrack) return;
    const index = playlist.findIndex(t => t.url === currentTrack.url);
    const prevIndex = (index - 1 + playlist.length) % playlist.length;
    play(playlist[prevIndex]);
  }, [playlist, currentTrack, play]);

  const setProgress = useCallback((v: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      const time = v * audio.duration;
      audio.currentTime = time;
      setProgressState(v);
    }
  }, []);

  const refreshPlaylist = useCallback(async () => {
    try {
      const data = await api.listMusicLibrary();
      if (Array.isArray(data)) {
        const tracks = data.map((track: any) => ({
          ...track,
          url: typeof track.url === 'string' ? formatUrl(track.url) : '',
          cover: typeof track.cover === 'string' ? formatUrl(track.cover) : track.cover,
          // 判断来源
          source: track.source || (typeof track.url === 'string' && /^https?:\/\//i.test(track.url) ? 'network' : 'local'),
        }));
        setPlaylist(tracks);
        console.log(`[MusicContext] Library refreshed, ${tracks.length} tracks found.`);
      }
    } catch (err) {
      console.error('Failed to fetch music library:', err);
    }
  }, []);

  // Fetch local library
  useEffect(() => {
    refreshPlaylist();
  }, [refreshPlaylist]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgressState(audio.currentTime / audio.duration);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      nextRef.current();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const controlsValue = useMemo<MusicControlsContextType>(
    () => ({
      currentTrack,
      isPlaying,
      playlist,
      volume,
      play,
      pause,
      resume,
      toggle,
      next,
      prev,
      setVolume,
      stop,
      setPlaylist,
      refreshPlaylist,
      playlistPopoverAnchor,
      togglePlaylist,
      closePlaylist,
    }),
    [
      currentTrack,
      isPlaying,
      playlist,
      volume,
      play,
      pause,
      resume,
      toggle,
      next,
      prev,
      stop,
      refreshPlaylist,
      playlistPopoverAnchor,
      togglePlaylist,
      closePlaylist,
    ],
  );

  const progressValue = useMemo<MusicProgressContextType>(
    () => ({
      progress,
      duration,
      setProgress,
    }),
    [progress, duration, setProgress],
  );

  return (
    <MusicControlsContext.Provider value={controlsValue}>
      <MusicProgressContext.Provider value={progressValue}>
        <audio ref={audioRef} preload="metadata" />
        {children}
      </MusicProgressContext.Provider>
    </MusicControlsContext.Provider>
  );
};

export const useMusicControls = () => {
  const context = useContext(MusicControlsContext);
  if (!context) {
    throw new Error('useMusicControls must be used within a MusicProvider');
  }
  return context;
};

export const useMusicProgress = () => {
  const context = useContext(MusicProgressContext);
  if (!context) {
    throw new Error('useMusicProgress must be used within a MusicProvider');
  }
  return context;
};

export const useMusic = () => {
  return {
    ...useMusicControls(),
    ...useMusicProgress(),
  };
};
