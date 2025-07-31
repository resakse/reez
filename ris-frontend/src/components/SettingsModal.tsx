'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import { toast } from '@/lib/toast';

interface DashboardConfig {
  id?: number;
  storage_root_paths: string[];
  storage_warning_threshold: number;
  storage_critical_threshold: number;
  daily_exam_target: number;
  monthly_exam_target: number;
  yearly_exam_target: number;
  modality_size_estimates: Record<string, number>;
}

interface SettingsModalProps {
  onConfigUpdate?: () => void;
}

export default function SettingsModal({ onConfigUpdate }: SettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DashboardConfig>({
    storage_root_paths: ['/var/pacs/'],
    storage_warning_threshold: 80,
    storage_critical_threshold: 95,
    daily_exam_target: 50,
    monthly_exam_target: 1500,
    yearly_exam_target: 18000,
    modality_size_estimates: {
      'X-Ray': 10,
      'CT Scan': 500,
      'MRI': 800,
      'Ultrasound': 50,
      'Mammography': 100
    }
  });
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    if (open) {
      fetchConfig();
    }
  }, [open]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${API_BASE}/api/dashboard/config/`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      setLoading(true);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${API_BASE}/api/dashboard/config/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast.success('Configuration saved successfully');
        setOpen(false);
        onConfigUpdate?.();
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const addStoragePath = () => {
    if (newPath.trim() && !config.storage_root_paths.includes(newPath.trim())) {
      setConfig(prev => ({
        ...prev,
        storage_root_paths: [...prev.storage_root_paths, newPath.trim()]
      }));
      setNewPath('');
    }
  };

  const removeStoragePath = (index: number) => {
    setConfig(prev => ({
      ...prev,
      storage_root_paths: prev.storage_root_paths.filter((_, i) => i !== index)
    }));
  };

  const updateModalityEstimate = (modality: string, size: number) => {
    setConfig(prev => ({
      ...prev,
      modality_size_estimates: {
        ...prev.modality_size_estimates,
        [modality]: size
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard Configuration</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Storage Paths Section */}
          <div>
            <Label className="text-base font-semibold">Storage Root Paths</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Configure the root directories where DICOM studies are stored
            </p>
            
            <div className="space-y-2">
              {config.storage_root_paths.map((path, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={path} readOnly className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeStoragePath(index)}
                    disabled={config.storage_root_paths.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              <div className="flex items-center gap-2">
                <Input
                  placeholder="/path/to/storage/"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addStoragePath()}
                />
                <Button variant="outline" size="sm" onClick={addStoragePath}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Storage Thresholds */}
          <div>
            <Label className="text-base font-semibold">Storage Alert Thresholds</Label>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <Label htmlFor="warning">Warning Threshold (%)</Label>
                <Input
                  id="warning"
                  type="number"
                  min="0"
                  max="100"
                  value={config.storage_warning_threshold}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    storage_warning_threshold: parseInt(e.target.value) || 80
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="critical">Critical Threshold (%)</Label>
                <Input
                  id="critical"
                  type="number"
                  min="0"
                  max="100"
                  value={config.storage_critical_threshold}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    storage_critical_threshold: parseInt(e.target.value) || 95
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Exam Targets */}
          <div>
            <Label className="text-base font-semibold">Examination Targets</Label>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div>
                <Label htmlFor="daily">Daily Target</Label>
                <Input
                  id="daily"
                  type="number"
                  min="0"
                  value={config.daily_exam_target}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    daily_exam_target: parseInt(e.target.value) || 50
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="monthly">Monthly Target</Label>
                <Input
                  id="monthly"
                  type="number"
                  min="0"
                  value={config.monthly_exam_target}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    monthly_exam_target: parseInt(e.target.value) || 1500
                  }))}
                />
              </div>
              <div>
                <Label htmlFor="yearly">Yearly Target</Label>
                <Input
                  id="yearly"
                  type="number"
                  min="0"
                  value={config.yearly_exam_target}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    yearly_exam_target: parseInt(e.target.value) || 18000
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Modality Size Estimates */}
          <div>
            <Label className="text-base font-semibold">Average Study Size (MB)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Configure estimated storage size per examination by modality
            </p>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(config.modality_size_estimates).map(([modality, size]) => (
                <div key={modality}>
                  <Label htmlFor={modality}>{modality}</Label>
                  <Input
                    id={modality}
                    type="number"
                    min="0"
                    value={size}
                    onChange={(e) => updateModalityEstimate(modality, parseInt(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveConfig} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}