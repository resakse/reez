'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Brain, Server, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
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

interface AIModel {
  name: string;
  size: string;
  type: 'vision' | 'medical' | 'qa';
  description: string;
}

const DEFAULT_MODELS: AIModel[] = [
  { name: 'llava-med:7b', size: '4.1GB', type: 'vision', description: 'Medical imaging vision-language model' },
  { name: 'llava:7b', size: '4.1GB', type: 'vision', description: 'General vision-language model' },
  { name: 'meditron:7b', size: '3.8GB', type: 'medical', description: 'Medical knowledge LLM' },
  { name: 'medllama2:7b', size: '3.8GB', type: 'medical', description: 'Medical fine-tuned LLaMA2' },
  { name: 'medichat-llama3:8b', size: '4.7GB', type: 'medical', description: 'Medical chat LLaMA3' },
  { name: 'medalpaca:7b', size: '3.8GB', type: 'qa', description: 'Medical QA and validation' }
];

export default function AISettingsManager() {
  const [settings, setSettings] = useState<AISettings>({
    enabled: false,
    ollama_url: 'http://localhost:11434',
    vision_model: 'llava-med:7b',
    medical_llm: 'meditron:7b',
    qa_model: 'medalpaca:7b',
    max_concurrent_requests: 5,
    confidence_threshold: 0.8
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/config/`);
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
        if (data.enable_ai_reporting && data.ollama_server_url) {
          testConnection(data.ollama_server_url, false);
        }
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/config/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enable_ai_reporting: settings.enabled,
          ollama_server_url: settings.ollama_url,
          vision_model: settings.vision_model,
          medical_llm_model: settings.medical_llm,
          qa_model: settings.qa_model,
          max_concurrent_requests: settings.max_concurrent_requests,
          confidence_threshold: settings.confidence_threshold
        })
      });

      if (response.ok) {
        toast.success('AI settings saved successfully');
      } else {
        toast.error('Failed to save AI settings');
      }
    } catch (error) {
      toast.error('Failed to save AI settings');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async (url?: string, showToast = true) => {
    const testUrl = url || settings.ollama_url;
    setIsTesting(true);
    
    try {
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ai-reporting/config/test/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollama_url: testUrl })
      });

      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus('connected');
        setAvailableModels(result.models || []);
        if (showToast) {
          toast.success('Successfully connected to Ollama server');
        }
      } else {
        setConnectionStatus('error');
        if (showToast) {
          toast.error(`Connection failed: ${result.error}`);
        }
      }
    } catch (error) {
      setConnectionStatus('error');
      if (showToast) {
        toast.error('Failed to test connection');
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSettingChange = (key: keyof AISettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    
    // Reset connection status when URL changes
    if (key === 'ollama_url') {
      setConnectionStatus('unknown');
      setAvailableModels([]);
    }
  };

  const getModelsByType = (type: 'vision' | 'medical' | 'qa') => {
    return DEFAULT_MODELS.filter(model => model.type === type);
  };

  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Connected</span>
            <Badge variant="outline" className="text-xs">
              {availableModels.length} models available
            </Badge>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Connection failed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <Server className="h-4 w-4" />
            <span className="text-sm">Not tested</span>
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Reporting Configuration
        </CardTitle>
        <CardDescription>
          Configure AI-powered radiology reporting system settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* AI Reporting Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="ai-enabled" className="text-base">
              Enable AI Reporting
            </Label>
            <div className="text-sm text-muted-foreground">
              Turn on AI-assisted radiology report generation
            </div>
          </div>
          <Switch
            id="ai-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Ollama Server Configuration */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium">Ollama Server Configuration</h3>
              
              <div className="space-y-2">
                <Label htmlFor="ollama-url">Ollama Server URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="ollama-url"
                    type="url"
                    value={settings.ollama_url}
                    onChange={(e) => handleSettingChange('ollama_url', e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => testConnection()}
                    disabled={isTesting || !settings.ollama_url}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  {renderConnectionStatus()}
                </div>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium">AI Model Selection</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vision-model">Vision-Language Model</Label>
                  <Select
                    value={settings.vision_model}
                    onValueChange={(value) => handleSettingChange('vision_model', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vision model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsByType('vision').map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.size} - {model.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medical-llm">Medical LLM</Label>
                  <Select
                    value={settings.medical_llm}
                    onValueChange={(value) => handleSettingChange('medical_llm', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select medical model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsByType('medical').map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.size} - {model.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qa-model">Quality Assurance Model</Label>
                  <Select
                    value={settings.qa_model}
                    onValueChange={(value) => handleSettingChange('qa_model', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select QA model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelsByType('qa').map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.size} - {model.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {availableModels.length > 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Available models on server:</strong> {availableModels.join(', ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Performance Settings */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-medium">Performance Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="concurrent-requests">Max Concurrent Requests</Label>
                  <Input
                    id="concurrent-requests"
                    type="number"
                    min="1"
                    max="10"
                    value={settings.max_concurrent_requests}
                    onChange={(e) => handleSettingChange('max_concurrent_requests', parseInt(e.target.value))}
                  />
                  <div className="text-xs text-muted-foreground">
                    Number of simultaneous AI requests (1-10)
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confidence-threshold">Confidence Threshold</Label>
                  <Input
                    id="confidence-threshold"
                    type="number"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={settings.confidence_threshold}
                    onChange={(e) => handleSettingChange('confidence_threshold', parseFloat(e.target.value))}
                  />
                  <div className="text-xs text-muted-foreground">
                    Minimum confidence for AI suggestions (0.1-1.0)
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={saveSettings} 
            disabled={isLoading}
            className="min-w-32"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>

        {/* Information Alert */}
        {!settings.enabled && (
          <Alert>
            <Brain className="h-4 w-4" />
            <AlertDescription>
              AI reporting is currently disabled. Enable it above to start using AI-assisted radiology reporting.
              When disabled, the reporting interface will show a simplified 2-panel layout without AI suggestions.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}