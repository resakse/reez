'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/lib/toast';
import { clearPacsConfigCache } from '@/lib/pacs';
import AuthService from '@/lib/auth';
import { Plus, Edit, Trash2, Shield, Server, Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface PacsServer {
  id: number;
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  is_active: boolean;
  is_primary: boolean;
  comments?: string;
  created?: string;
  modified?: string;
}

interface PacsServerFormData {
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  comments: string;
}

export default function PacsServerManager() {
  const { user } = useAuth();
  const [servers, setServers] = useState<PacsServer[]>([]);
  const [editingServer, setEditingServer] = useState<PacsServer | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperuser = user?.is_superuser || false;

  useEffect(() => {
    if (isSuperuser) {
      fetchServers();
    } else {
      setError('Access denied. Only superusers can manage PACS servers.');
      setLoading(false);
    }
  }, [isSuperuser]);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/`
      );

      if (response.ok) {
        const data = await response.json();
        
        
        // Handle both direct array and paginated response
        if (Array.isArray(data)) {
          setServers(data);
        } else if (data.results && Array.isArray(data.results)) {
          // Django REST framework paginated response
          setServers(data.results);
        } else if (data && typeof data === 'object') {
          // Handle case where data might be a single object instead of array
          setServers([data]);
        } else {
          console.error('Unexpected response format:', data);
          throw new Error(`Invalid response format from server. Received: ${typeof data}`);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: Failed to fetch PACS servers`);
      }
    } catch (err) {
      console.error('Error fetching PACS servers:', err);
      
      // Check if this is an authentication/permission error
      if (err instanceof Error) {
        if (err.message.includes('403') || err.message.includes('Forbidden')) {
          setError('Access denied. Only superusers can manage PACS servers.');
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          setError('Please log in to access PACS server management.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load PACS servers');
      }
      
      toast.error('Failed to load PACS servers');
      // Ensure servers is always an array
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (serverId: number, isActive: boolean) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: isActive })
        }
      );

      if (response.ok) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, is_active: isActive } : s
        ));
        toast.success(`PACS server ${isActive ? 'activated' : 'deactivated'}`);
        clearPacsConfigCache();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update server');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update PACS server status');
    }
  };

  const handleSetPrimary = async (serverId: number) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/set_primary/`,
        { method: 'POST' }
      );

      if (response.ok) {
        setServers(prev => prev.map(s => ({
          ...s,
          is_primary: s.id === serverId
        })));
        toast.success('Primary PACS server updated');
        clearPacsConfigCache();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set primary server');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set primary PACS server');
    }
  };

  const handleSaveServer = async (data: PacsServerFormData) => {
    try {
      const url = editingServer 
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${editingServer.id}/`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/`;
      
      const method = editingServer ? 'PATCH' : 'POST';

      const response = await AuthService.authenticatedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const savedServer = await response.json();
        
        if (editingServer) {
          setServers(prev => prev.map(s => s.id === editingServer.id ? savedServer : s));
          toast.success('PACS server updated successfully');
        } else {
          setServers(prev => [...prev, savedServer]);
          toast.success('PACS server added successfully');
        }

        setShowAddForm(false);
        setEditingServer(null);
        clearPacsConfigCache();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save server');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save PACS server');
    }
  };

  const handleDeleteServer = async (serverId: number) => {
    if (!confirm('Are you sure you want to delete this PACS server?')) {
      return;
    }

    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        const result = await response.json();
        
        if (result.soft_deleted) {
          // Server was soft deleted - refresh the list
          fetchServers();
          toast.warning(`${result.message}`);
        } else {
          // Server was hard deleted - remove from list
          setServers(prev => prev.filter(s => s.id !== serverId));
          toast.success('PACS server deleted successfully');
        }
        
        clearPacsConfigCache();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete server');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete PACS server');
    }
  };

  const PacsServerForm = ({ server, onSave, onCancel }: {
    server?: PacsServer | null;
    onSave: (data: PacsServerFormData) => void;
    onCancel: () => void;
  }) => {
    const [localFormData, setLocalFormData] = useState<PacsServerFormData>(
      server ? {
        name: server.name,
        orthancurl: server.orthancurl,
        viewrurl: server.viewrurl,
        endpoint_style: server.endpoint_style,
        comments: server.comments || ''
      } : {
        name: '',
        orthancurl: '',
        viewrurl: '',
        endpoint_style: 'dicomweb',
        comments: ''
      }
    );

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSave(localFormData);
    };

    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {server ? 'Edit PACS Server' : 'Add New PACS Server'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Server Name *</Label>
              <Input
                id="name"
                value={localFormData.name}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Unraid Orthanc, Main Hospital PACS"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="orthancurl">Orthanc URL *</Label>
              <Input
                id="orthancurl"
                type="url"
                value={localFormData.orthancurl}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, orthancurl: e.target.value }))}
                placeholder="e.g., http://10.0.1.0:8042"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="viewrurl">DICOM Viewer URL *</Label>
              <Input
                id="viewrurl"
                type="url"
                value={localFormData.viewrurl}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, viewrurl: e.target.value }))}
                placeholder="e.g., http://localhost:3000/viewer"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="endpoint_style">Endpoint Style</Label>
              <Select 
                value={localFormData.endpoint_style} 
                onValueChange={(value) => setLocalFormData(prev => ({ ...prev, endpoint_style: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dicomweb">DICOMweb (Recommended)</SelectItem>
                  <SelectItem value="file">File endpoint</SelectItem>
                  <SelectItem value="attachment">Attachment</SelectItem>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="comments">Comments & Usage Notes</Label>
              <Textarea
                id="comments"
                value={localFormData.comments}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, comments: e.target.value }))}
                placeholder="e.g., This is only for CT Scan images, Archive server for studies older than 1 year"
                rows={3}
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button type="submit">
                {server ? 'Update Server' : 'Add Server'}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle>PACS Servers</CardTitle>
          </div>
          <CardDescription>Loading PACS server configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle>PACS Servers</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(showAddForm || editingServer) && (
        <PacsServerForm
          server={editingServer}
          onSave={handleSaveServer}
          onCancel={() => {
            setShowAddForm(false);
            setEditingServer(null);
          }}
        />
      )}
      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              <div>
                <CardTitle>PACS Servers</CardTitle>
                <CardDescription>Manage multiple PACS server connections</CardDescription>
              </div>
            </div>
            {!showAddForm && !editingServer && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add PACS Server
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.isArray(servers) && servers.map(server => (
              <div key={server.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{server.name}</h3>
                      {server.is_primary && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                      <Badge variant={server.is_active ? "outline" : "secondary"} 
                             className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {server.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    
                    {server.comments && (
                      <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 rounded">
                        <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                          {server.comments}
                        </p>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Orthanc:</span> {server.orthancurl}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Viewer:</span> {server.viewrurl}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Endpoint:</span> {server.endpoint_style}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={server.is_active}
                      onCheckedChange={(checked) => handleToggleActive(server.id, checked)}
                    />
                    {server.is_active && !server.is_primary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetPrimary(server.id)}
                      >
                        Set Primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingServer(server)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDeleteServer(server.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {(!Array.isArray(servers) || servers.length === 0) && (
              <div className="text-center py-8">
                <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No PACS Servers</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first PACS server to get started
                </p>
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add PACS Server
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}