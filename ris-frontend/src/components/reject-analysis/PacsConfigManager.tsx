'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Save, CheckCircle, XCircle } from 'lucide-react';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';
import { Language } from '@/types/reject-analysis';

interface PacsServer {
  id: number;
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  is_active: boolean;
  is_primary: boolean;
  include_in_reject_analysis: boolean;
  comments?: string;
  created: string;
  modified: string;
}

interface PacsConfigManagerProps {
  language?: Language;
}

const translations = {
  en: {
    title: 'Reject Analysis PACS Configuration',
    subtitle: 'Configure which PACS servers to include in reject analysis data collection',
    includeInAnalysis: 'Include in Reject Analysis',
    save: 'Save Changes',
    loading: 'Loading PACS servers...',
    saving: 'Saving...',
    error: 'Error loading PACS servers',
    success: 'Configuration updated successfully',
    noServers: 'No PACS servers configured',
    serverInfo: 'Server Information',
    analysisConfig: 'Analysis Configuration',
    enabled: 'Enabled',
    disabled: 'Disabled',
    active: 'Active',
    inactive: 'Inactive',
    primary: 'Primary'
  },
  ms: {
    title: 'Konfigurasi PACS Analisis Penolakan',
    subtitle: 'Konfigurasikan pelayan PACS mana yang disertakan dalam pengumpulan data analisis penolakan',
    includeInAnalysis: 'Sertakan dalam Analisis Penolakan',
    save: 'Simpan Perubahan',
    loading: 'Memuatkan pelayan PACS...',
    saving: 'Menyimpan...',
    error: 'Ralat memuatkan pelayan PACS',
    success: 'Konfigurasi dikemas kini berjaya',
    noServers: 'Tiada pelayan PACS dikonfigurasikan',
    serverInfo: 'Maklumat Pelayan',
    analysisConfig: 'Konfigurasi Analisis',
    enabled: 'Diaktifkan',
    disabled: 'Dilumpuhkan',
    active: 'Aktif',
    inactive: 'Tidak aktif',
    primary: 'Utama'
  }
};

export default function PacsConfigManager({ language = 'en' }: PacsConfigManagerProps) {
  const t = translations[language];
  
  const [servers, setServers] = useState<PacsServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/`
      );

      if (!response.ok) {
        throw new Error('Failed to load PACS servers');
      }

      const data = await response.json();
      setServers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const updateRejectAnalysisConfig = async (serverId: number, includeInAnalysis: boolean) => {
    try {
      setSaving(serverId);

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ include_in_reject_analysis: includeInAnalysis }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }

      const updatedServer = await response.json();
      
      // Update the server in state
      setServers(prev => 
        prev.map(server => 
          server.id === serverId 
            ? { ...server, include_in_reject_analysis: includeInAnalysis }
            : server
        )
      );

      toast.success(t.success);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update configuration';
      toast.error(errorMessage);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          {t.title}
        </CardTitle>
        <CardDescription>{t.subtitle}</CardDescription>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="text-red-500 text-center py-4 mb-4">{error}</div>
        )}
        
        {servers.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>{t.noServers}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {servers.map((server) => (
              <div key={server.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-lg">{server.name}</h3>
                      <div className="flex gap-2">
                        {server.is_primary && (
                          <Badge variant="default" className="text-xs">
                            {t.primary}
                          </Badge>
                        )}
                        <Badge 
                          variant={server.is_active ? "default" : "secondary"} 
                          className={`text-xs ${server.is_active ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}
                        >
                          {server.is_active ? t.active : t.inactive}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="text-sm text-muted-foreground mb-2">
                      <div>Orthanc: <code className="bg-muted px-1 rounded">{server.orthancurl}</code></div>
                      <div>Viewer: <code className="bg-muted px-1 rounded">{server.viewrurl}</code></div>
                      {server.comments && <div>Notes: {server.comments}</div>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.includeInAnalysis}:</span>
                      <Switch
                        checked={server.include_in_reject_analysis}
                        onCheckedChange={(checked) => updateRejectAnalysisConfig(server.id, checked)}
                        disabled={saving === server.id || !server.is_active}
                      />
                      {server.include_in_reject_analysis ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    
                    {saving === server.id && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        {t.saving}
                      </div>
                    )}
                  </div>
                </div>
                
                {!server.is_active && (
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                    This server is inactive and cannot be included in reject analysis.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}