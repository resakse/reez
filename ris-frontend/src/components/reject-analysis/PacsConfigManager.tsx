'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import Swal from 'sweetalert2';
import {
  Settings,
  Plus,
  Edit,
  Trash2,
  TestTube,
  CheckCircle,
  XCircle,
  Save,
  X,
  Server,
  AlertTriangle
} from 'lucide-react';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';
import { Language } from '@/types/reject-analysis';

interface PacsConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  aet_title: string;
  username?: string;
  password?: string;
  use_ssl: boolean;
  is_active: boolean;
  is_default: boolean;
  timeout: number;
  max_connections: number;
  description?: string;
  last_test_date?: string;
  last_test_result?: boolean;
  created: string;
  modified: string;
}

interface PacsConfigFormData {
  name: string;
  host: string;
  port: number;
  aet_title: string;
  username?: string;
  password?: string;
  use_ssl: boolean;
  is_active: boolean;
  is_default: boolean;
  timeout: number;
  max_connections: number;
  description?: string;
}

interface PacsConfigManagerProps {
  language?: Language;
}

const translations = {
  en: {
    title: 'PACS Configuration Management',
    subtitle: 'Manage PACS server configurations for reject analysis integration',
    addConfig: 'Add PACS Server',
    editConfig: 'Edit PACS Server',
    deleteConfig: 'Delete Configuration',
    testConnection: 'Test Connection',
    connectionSettings: 'Connection Settings',
    securitySettings: 'Security Settings',
    performanceSettings: 'Performance Settings',
    nameLabel: 'Server Name',
    hostLabel: 'Host/IP Address',
    portLabel: 'Port',
    aetTitleLabel: 'AE Title',
    usernameLabel: 'Username (Optional)',
    passwordLabel: 'Password (Optional)',
    useSslLabel: 'Use SSL/TLS',
    isActiveLabel: 'Active',
    isDefaultLabel: 'Default Server',
    timeoutLabel: 'Timeout (seconds)',
    maxConnectionsLabel: 'Max Connections',
    descriptionLabel: 'Description',
    save: 'Save Configuration',
    cancel: 'Cancel',
    delete: 'Delete',
    test: 'Test',
    confirmDelete: 'Are you sure you want to delete this PACS configuration?',
    confirmDeleteDesc: 'This action cannot be undone. This will permanently delete the PACS server configuration.',
    testing: 'Testing connection...',
    testSuccess: 'Connection successful',
    testFailed: 'Connection failed',
    loading: 'Loading configurations...',
    saving: 'Saving...',
    error: 'Error loading configurations',
    success: 'Configuration saved successfully',
    created: 'PACS configuration created successfully',
    updated: 'PACS configuration updated successfully',
    deleted: 'PACS configuration deleted successfully',
    noConfigs: 'No PACS configurations found',
    lastTested: 'Last tested',
    never: 'Never',
    active: 'Active',
    inactive: 'Inactive',
    default: 'Default',
    ssl: 'SSL',
    validation: {
      nameRequired: 'Server name is required',
      hostRequired: 'Host/IP address is required',
      portRequired: 'Port is required',
      portInvalid: 'Port must be between 1 and 65535',
      aetTitleRequired: 'AE Title is required',
      timeoutInvalid: 'Timeout must be between 1 and 300 seconds',
      maxConnectionsInvalid: 'Max connections must be between 1 and 100',
    },
    placeholders: {
      name: 'Main PACS Server',
      host: '192.168.1.100',
      aetTitle: 'PACS_SCP',
      username: 'pacs_user',
      description: 'Primary PACS server for reject analysis'
    }
  },
  ms: {
    title: 'Pengurusan Konfigurasi PACS',
    subtitle: 'Urus konfigurasi pelayan PACS untuk integrasi analisis penolakan',
    addConfig: 'Tambah Pelayan PACS',
    editConfig: 'Edit Pelayan PACS',
    deleteConfig: 'Padam Konfigurasi',
    testConnection: 'Uji Sambungan',
    connectionSettings: 'Tetapan Sambungan',
    securitySettings: 'Tetapan Keselamatan',
    performanceSettings: 'Tetapan Prestasi',
    nameLabel: 'Nama Pelayan',
    hostLabel: 'Host/Alamat IP',
    portLabel: 'Port',
    aetTitleLabel: 'AE Title',
    usernameLabel: 'Nama Pengguna (Pilihan)',
    passwordLabel: 'Kata Laluan (Pilihan)',
    useSslLabel: 'Guna SSL/TLS',
    isActiveLabel: 'Aktif',
    isDefaultLabel: 'Pelayan Lalai',
    timeoutLabel: 'Timeout (saat)',
    maxConnectionsLabel: 'Sambungan Maksimum',
    descriptionLabel: 'Keterangan',
    save: 'Simpan Konfigurasi',
    cancel: 'Batal',
    delete: 'Padam',
    test: 'Uji',
    confirmDelete: 'Adakah anda pasti ingin memadam konfigurasi PACS ini?',
    confirmDeleteDesc: 'Tindakan ini tidak boleh dibuat asal. Ini akan memadam konfigurasi pelayan PACS secara kekal.',
    testing: 'Menguji sambungan...',
    testSuccess: 'Sambungan berjaya',
    testFailed: 'Sambungan gagal',
    loading: 'Memuatkan konfigurasi...',
    saving: 'Menyimpan...',
    error: 'Ralat memuatkan konfigurasi',
    success: 'Konfigurasi disimpan berjaya',
    created: 'Konfigurasi PACS dicipta berjaya',
    updated: 'Konfigurasi PACS dikemas kini berjaya',
    deleted: 'Konfigurasi PACS dipadam berjaya',
    noConfigs: 'Tiada konfigurasi PACS dijumpai',
    lastTested: 'Terakhir diuji',
    never: 'Tidak pernah',
    active: 'Aktif',
    inactive: 'Tidak aktif',
    default: 'Lalai',
    ssl: 'SSL',
    validation: {
      nameRequired: 'Nama pelayan diperlukan',
      hostRequired: 'Host/alamat IP diperlukan',
      portRequired: 'Port diperlukan',
      portInvalid: 'Port mestilah antara 1 dan 65535',
      aetTitleRequired: 'AE Title diperlukan',
      timeoutInvalid: 'Timeout mestilah antara 1 dan 300 saat',
      maxConnectionsInvalid: 'Sambungan maksimum mestilah antara 1 dan 100',
    },
    placeholders: {
      name: 'Pelayan PACS Utama',
      host: '192.168.1.100',
      aetTitle: 'PACS_SCP',
      username: 'pacs_user',
      description: 'Pelayan PACS utama untuk analisis penolakan'
    }
  }
};

export default function PacsConfigManager({ language = 'en' }: PacsConfigManagerProps) {
  const t = translations[language];
  
  const [configs, setConfigs] = useState<PacsConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<PacsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState<PacsConfigFormData>({
    name: '',
    host: '',
    port: 11112,
    aet_title: '',
    username: '',
    password: '',
    use_ssl: false,
    is_active: true,
    is_default: false,
    timeout: 30,
    max_connections: 10,
    description: ''
  });

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PacsConfigFormData, string>>>({});

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-config/`
      );

      if (!response.ok) {
        throw new Error('Failed to load PACS configurations');
      }

      const data = await response.json();
      setConfigs(data.results || data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(`${t.error}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof PacsConfigFormData, string>> = {};

    if (!formData.name.trim()) {
      errors.name = t.validation.nameRequired;
    }

    if (!formData.host.trim()) {
      errors.host = t.validation.hostRequired;
    }

    if (!formData.port) {
      errors.port = t.validation.portRequired;
    } else if (formData.port < 1 || formData.port > 65535) {
      errors.port = t.validation.portInvalid;
    }

    if (!formData.aet_title.trim()) {
      errors.aet_title = t.validation.aetTitleRequired;
    }

    if (formData.timeout < 1 || formData.timeout > 300) {
      errors.timeout = t.validation.timeoutInvalid;
    }

    if (formData.max_connections < 1 || formData.max_connections > 100) {
      errors.max_connections = t.validation.maxConnectionsInvalid;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      host: '',
      port: 11112,
      aet_title: '',
      username: '',
      password: '',
      use_ssl: false,
      is_active: true,
      is_default: false,
      timeout: 30,
      max_connections: 10,
      description: ''
    });
    setFormErrors({});
    setEditingConfig(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (config: PacsConfig) => {
    setFormData({
      name: config.name,
      host: config.host,
      port: config.port,
      aet_title: config.aet_title,
      username: config.username || '',
      password: '', // Don't prefill password for security
      use_ssl: config.use_ssl,
      is_active: config.is_active,
      is_default: config.is_default,
      timeout: config.timeout,
      max_connections: config.max_connections,
      description: config.description || ''
    });
    setEditingConfig(config);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setSaving(true);

      const url = editingConfig
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-config/${editingConfig.id}/`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-config/`;

      const method = editingConfig ? 'PUT' : 'POST';

      // Only include password if it's being changed
      const submitData = { ...formData };
      if (editingConfig && !submitData.password) {
        delete submitData.password;
      }

      const response = await AuthService.authenticatedFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        throw new Error('Failed to save PACS configuration');
      }

      const message = editingConfig ? t.updated : t.created;
      toast.success(message);

      setIsDialogOpen(false);
      resetForm();
      loadConfigs();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (config: PacsConfig) => {
    const result = await Swal.fire({
      title: t.confirmDelete,
      text: t.confirmDeleteDesc,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: t.delete,
      cancelButtonText: t.cancel,
      reverseButtons: true
    });

    if (result.isConfirmed) {
      try {
        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-config/${config.id}/`,
          { method: 'DELETE' }
        );

        if (!response.ok) {
          throw new Error('Failed to delete PACS configuration');
        }

        toast.success(t.deleted);
        loadConfigs();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        toast.error(errorMessage);
      }
    }
  };

  const handleTestConnection = async (config: PacsConfig) => {
    try {
      setTesting(config.id);

      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-config/${config.id}/test/`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Connection test failed');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success(t.testSuccess);
      } else {
        toast.error(`${t.testFailed}: ${result.error || 'Unknown error'}`);
      }

      loadConfigs(); // Reload to update last test result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      toast.error(`${t.testFailed}: ${errorMessage}`);
    } finally {
      setTesting(null);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return t.never;
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return t.never;
    }
  };

  const getStatusBadge = (config: PacsConfig) => {
    if (!config.is_active) {
      return <Badge variant="secondary">{t.inactive}</Badge>;
    }

    if (config.last_test_result === true) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t.active}
        </Badge>
      );
    } else if (config.last_test_result === false) {
      return (
        <Badge className="bg-red-100 text-red-800">
          <XCircle className="h-3 w-3 mr-1" />
          {t.testFailed}
        </Badge>
      );
    }

    return <Badge variant="outline">{t.active}</Badge>;
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
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {t.title}
          </CardTitle>
          <CardDescription>{t.subtitle}</CardDescription>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              {t.addConfig}
            </Button>
          </DialogTrigger>
          
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingConfig ? t.editConfig : t.addConfig}
              </DialogTitle>
              <DialogDescription>
                {editingConfig 
                  ? 'Modify the PACS server configuration below'
                  : 'Add a new PACS server configuration to the system'
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Connection Settings */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t.connectionSettings}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t.nameLabel}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t.placeholders.name}
                    />
                    {formErrors.name && (
                      <p className="text-sm text-red-500">{formErrors.name}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="host">{t.hostLabel}</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder={t.placeholders.host}
                    />
                    {formErrors.host && (
                      <p className="text-sm text-red-500">{formErrors.host}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="port">{t.portLabel}</Label>
                    <Input
                      id="port"
                      type="number"
                      min="1"
                      max="65535"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                    />
                    {formErrors.port && (
                      <p className="text-sm text-red-500">{formErrors.port}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="aet_title">{t.aetTitleLabel}</Label>
                    <Input
                      id="aet_title"
                      value={formData.aet_title}
                      onChange={(e) => setFormData({ ...formData, aet_title: e.target.value })}
                      placeholder={t.placeholders.aetTitle}
                    />
                    {formErrors.aet_title && (
                      <p className="text-sm text-red-500">{formErrors.aet_title}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <Label htmlFor="description">{t.descriptionLabel}</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t.placeholders.description}
                  />
                </div>
              </div>

              <Separator />

              {/* Security Settings */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t.securitySettings}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">{t.usernameLabel}</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder={t.placeholders.username}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">{t.passwordLabel}</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingConfig ? "Leave blank to keep current" : ""}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="use_ssl"
                        checked={formData.use_ssl}
                        onCheckedChange={(checked) => setFormData({ ...formData, use_ssl: checked })}
                      />
                      <Label htmlFor="use_ssl">{t.useSslLabel}</Label>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Performance Settings */}
              <div>
                <h4 className="text-sm font-medium mb-3">{t.performanceSettings}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeout">{t.timeoutLabel}</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min="1"
                      max="300"
                      value={formData.timeout}
                      onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 30 })}
                    />
                    {formErrors.timeout && (
                      <p className="text-sm text-red-500">{formErrors.timeout}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="max_connections">{t.maxConnectionsLabel}</Label>
                    <Input
                      id="max_connections"
                      type="number"
                      min="1"
                      max="100"
                      value={formData.max_connections}
                      onChange={(e) => setFormData({ ...formData, max_connections: parseInt(e.target.value) || 10 })}
                    />
                    {formErrors.max_connections && (
                      <p className="text-sm text-red-500">{formErrors.max_connections}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">{t.isActiveLabel}</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_default"
                      checked={formData.is_default}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                    />
                    <Label htmlFor="is_default">{t.isDefaultLabel}</Label>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                {t.cancel}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? t.saving : t.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="text-red-500 text-center py-4 flex items-center justify-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        )}
        
        {configs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
            {t.noConfigs}
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div key={config.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{config.name}</h4>
                        {config.is_default && (
                          <Badge variant="outline">{t.default}</Badge>
                        )}
                        {config.use_ssl && (
                          <Badge variant="outline">{t.ssl}</Badge>
                        )}
                        {getStatusBadge(config)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {config.host}:{config.port} ({config.aet_title})
                      </p>
                      {config.description && (
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t.lastTested}: {formatDate(config.last_test_date)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(config)}
                      disabled={testing === config.id}
                    >
                      <TestTube className="h-4 w-4 mr-1" />
                      {testing === config.id ? t.testing : t.test}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(config)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(config)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}