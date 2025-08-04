'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AuthService from '@/lib/auth';

interface AISettings {
  enabled: boolean;
  ollama_url: string;
  vision_model: string;
  medical_llm: string;
  qa_model: string;
  max_concurrent_requests: number;
  confidence_threshold: number;
}

interface AISettingsContextType {
  settings: AISettings;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
  isAIEnabled: boolean;
}

const AISettingsContext = createContext<AISettingsContextType | undefined>(undefined);

export function AISettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AISettings>({
    enabled: false,
    ollama_url: 'http://localhost:11434',
    vision_model: 'llava-med:7b',
    medical_llm: 'meditron:7b',
    qa_model: 'medalpaca:7b',
    max_concurrent_requests: 5,
    confidence_threshold: 0.8
  });
  
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await AuthService.authenticatedFetch('/api/ai-reporting/config/');
      if (response.ok) {
        const data = await response.json();
        setSettings({
          enabled: data.enable_ai_reporting,
          ollama_url: data.ollama_server_url,
          vision_model: data.vision_model,
          medical_llm: data.medical_llm_model,
          qa_model: data.qa_model,
          max_concurrent_requests: data.max_concurrent_requests,
          confidence_threshold: data.confidence_threshold
        });
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const refreshSettings = async () => {
    await loadSettings();
  };

  const value = {
    settings,
    isLoading,
    refreshSettings,
    isAIEnabled: settings.enabled
  };

  return (
    <AISettingsContext.Provider value={value}>
      {children}
    </AISettingsContext.Provider>
  );
}

export function useAISettings() {
  const context = useContext(AISettingsContext);
  if (context === undefined) {
    throw new Error('useAISettings must be used within an AISettingsProvider');
  }
  return context;
}