'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthService from '@/lib/auth';

interface PacsConfig {
  id: number;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  endpoint_style_choices: Array<{value: string, label: string}>;
  created: string;
  modified: string;
}

interface PacsFormData {
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [pacsConfig, setPacsConfig] = useState<PacsConfig | null>(null);
  const [formData, setFormData] = useState<PacsFormData>({
    orthancurl: '',
    viewrurl: '',
    endpoint_style: 'dicomweb',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check if user is superuser
  const isSupervisor = user?.is_superuser || false;

  useEffect(() => {
    if (!isSupervisor) {
      setError('Access denied. Only supervisors can access PACS settings.');
      setLoading(false);
      return;
    }

    const fetchPacsConfig = async () => {
      try {
        const res = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/settings/pacs/current/`
        );

        if (!res.ok) {
          throw new Error('Failed to fetch PACS configuration');
        }

        const config: PacsConfig = await res.json();
        setPacsConfig(config);
        setFormData({
          orthancurl: config.orthancurl,
          viewrurl: config.viewrurl,
          endpoint_style: config.endpoint_style || 'dicomweb',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PACS configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchPacsConfig();
  }, [isSupervisor]);

  const handleInputChange = (field: keyof PacsFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear messages when user starts typing
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const url = pacsConfig 
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/settings/pacs/${pacsConfig.id}/`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/settings/pacs/`;
      
      const method = pacsConfig ? 'PATCH' : 'POST';

      const res = await AuthService.authenticatedFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to save PACS configuration');
      }

      const updatedConfig: PacsConfig = await res.json();
      setPacsConfig(updatedConfig);
      setSuccess('PACS configuration saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setSaving(false);
    }
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isFormValid = (): boolean => {
    return formData.orthancurl.trim() !== '' && 
           formData.viewrurl.trim() !== '' &&
           formData.endpoint_style.trim() !== '' &&
           isValidUrl(formData.orthancurl) && 
           isValidUrl(formData.viewrurl);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Settings
          </CardTitle>
          <CardDescription>Loading PACS configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isSupervisor) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Access denied. Only supervisors can access system settings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            PACS Configuration
          </CardTitle>
          <CardDescription>
            Configure PACS (Picture Archiving and Communication System) settings for Orthanc integration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="orthancurl">Orthanc Server URL *</Label>
              <Input
                id="orthancurl"
                type="url"
                value={formData.orthancurl}
                onChange={(e) => handleInputChange('orthancurl', e.target.value)}
                placeholder="http://localhost:8042"
                required
              />
              <p className="text-sm text-gray-600 mt-1">
                URL to the Orthanc PACS server (e.g., http://localhost:8042)
              </p>
            </div>

            <div>
              <Label htmlFor="viewrurl">DICOM Viewer URL *</Label>
              <Input
                id="viewrurl"
                type="url"
                value={formData.viewrurl}
                onChange={(e) => handleInputChange('viewrurl', e.target.value)}
                placeholder="http://localhost:3000/viewer"
                required
              />
              <p className="text-sm text-gray-600 mt-1">
                URL to the DICOM viewer application for displaying medical images
              </p>
            </div>

            <div>
              <Label htmlFor="endpoint_style">DICOM Endpoint Style *</Label>
              <Select 
                value={formData.endpoint_style} 
                onValueChange={(value) => handleInputChange('endpoint_style', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select endpoint style" />
                </SelectTrigger>
                <SelectContent>
                  {pacsConfig?.endpoint_style_choices?.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  )) || [
                    <SelectItem key="dicomweb" value="dicomweb">DICOMweb (OHIF-style) - Standard WADO-RS</SelectItem>,
                    <SelectItem key="file" value="file">File endpoint - Direct Orthanc /file</SelectItem>,
                    <SelectItem key="attachment" value="attachment">Attachment - Raw DICOM data</SelectItem>,
                    <SelectItem key="auto" value="auto">Auto-detect - Try best working endpoint</SelectItem>
                  ]}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600 mt-1">
                Choose which Orthanc endpoint to use for DICOM image retrieval. <strong>DICOMweb (OHIF-style)</strong> is recommended as it uses the same endpoints as OHIF viewer and prevents image inversion issues.
              </p>
            </div>

            <div className="flex space-x-2 pt-4">
              <Button 
                type="submit" 
                disabled={saving || !isFormValid()}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </form>

          {pacsConfig && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Configuration Info</h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="font-medium text-gray-500">Current Endpoint Style:</dt>
                  <dd className="text-gray-900 font-mono">
                    {pacsConfig.endpoint_style_choices?.find(choice => choice.value === pacsConfig.endpoint_style)?.label || pacsConfig.endpoint_style}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Created:</dt>
                  <dd className="text-gray-900">{new Date(pacsConfig.created).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Last Modified:</dt>
                  <dd className="text-gray-900">{new Date(pacsConfig.modified).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}