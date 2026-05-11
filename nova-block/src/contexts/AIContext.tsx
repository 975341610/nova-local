import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { AIEngineMode } from '../lib/types';

interface AIContextType {
  isAiEnabled: boolean;
  setIsAiEnabled: (enabled: boolean) => void;
  aiMode: AIEngineMode;
  setAiMode: (mode: AIEngineMode) => void;
  contextLength: number;
  setContextLength: (length: number) => void;
  refreshAiStatus: () => Promise<void>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [aiMode, setAiMode] = useState<AIEngineMode>('remote');
  const [contextLength, setContextLength] = useState(8192);

  const refreshAiStatus = async () => {
    try {
      const status = await api.getAIPluginStatus() as any;
      setIsAiEnabled(status.enabled);
      setAiMode(status.ai_mode === 'local' ? 'local' : 'remote');
      if (status.num_ctx) {
        setContextLength(status.num_ctx);
      }
    } catch (err) {
      console.error('Failed to fetch AI status:', err);
    }
  };

  useEffect(() => {
    refreshAiStatus();
  }, []);

  return (
    <AIContext.Provider value={{ 
      isAiEnabled, 
      setIsAiEnabled, 
      aiMode,
      setAiMode,
      contextLength, 
      setContextLength, 
      refreshAiStatus 
    }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};
