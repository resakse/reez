'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, AlertTriangle, Server, Plus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { usePacsConfig } from '@/hooks/usePacsConfig';
import PacsConfigManager from '@/components/reject-analysis/PacsConfigManager';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';

export default function RejectAnalysisSettingsPage() {
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const {
    pacsServers,
    loading,
    error,
    createPacsServer,
    updatePacsServer,
    deletePacsServer,
    testConnection,
  } = usePacsConfig();

  const isSuperuser = user?.is_superuser || false;

  // Redirect if not superuser
  if (!isSuperuser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">Access denied. Superuser privileges required.</p>
          <Link href="/reject-analysis">
            <Button variant="outline" className="mt-2">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reject-analysis">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reject Analysis Settings</h1>
          <p className="text-muted-foreground">
            Configure PACS servers and system settings for reject analysis
          </p>
        </div>
      </div>

      {/* PACS Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                PACS Server Configuration
              </CardTitle>
              <CardDescription>
                Configure PACS servers for reject analysis data integration
              </CardDescription>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add PACS Server
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New PACS Server</DialogTitle>
                  <DialogDescription>
                    Configure a new PACS server for reject analysis integration
                  </DialogDescription>
                </DialogHeader>
                <PacsConfigManager
                  onSubmit={async (data) => {
                    await createPacsServer(data);
                    setIsCreateDialogOpen(false);
                  }}
                  onCancel={() => setIsCreateDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : pacsServers.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No PACS servers configured</h3>
              <p className="text-muted-foreground mb-4">
                Add your first PACS server to enable reject analysis data integration
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First PACS Server
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {pacsServers.map((server) => (
                <div key={server.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-medium text-lg">{server.name}</h3>
                      <p className="text-muted-foreground text-sm">{server.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span>Host: <code className="bg-muted px-1 rounded">{server.host}:{server.port}</code></span>
                        <span>AET: <code className="bg-muted px-1 rounded">{server.ae_title}</code></span>
                        {server.is_default && (
                          <Badge variant="default">Default</Badge>
                        )}
                        <Badge variant={server.is_active ? 'default' : 'secondary'}>
                          {server.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(server.id)}
                      >
                        Test Connection
                      </Button>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit PACS Server</DialogTitle>
                            <DialogDescription>
                              Update PACS server configuration
                            </DialogDescription>
                          </DialogHeader>
                          <PacsConfigManager
                            pacsServer={server}
                            onSubmit={async (data) => {
                              await updatePacsServer(server.id, data);
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                      
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          if (confirm(`Are you sure you want to delete "${server.name}"? This action cannot be undone.`)) {
                            await deletePacsServer(server.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    <div>Created: {new Date(server.created_at).toLocaleString()}</div>
                    <div>Last modified: {new Date(server.updated_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>
            Configure default settings for reject analysis
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="space-y-6">
            {/* Target Reject Rates */}
            <div>
              <h3 className="font-medium mb-4">Default Target Reject Rates (%)</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">X-Ray</label>
                  <div className="text-lg font-bold text-blue-600">2.0%</div>
                  <p className="text-xs text-muted-foreground">Standard target for X-Ray examinations</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">CT Scan</label>
                  <div className="text-lg font-bold text-blue-600">1.5%</div>
                  <p className="text-xs text-muted-foreground">Standard target for CT examinations</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">MRI</label>
                  <div className="text-lg font-bold text-blue-600">1.0%</div>
                  <p className="text-xs text-muted-foreground">Standard target for MRI examinations</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ultrasound</label>
                  <div className="text-lg font-bold text-blue-600">1.5%</div>
                  <p className="text-xs text-muted-foreground">Standard target for Ultrasound examinations</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mammography</label>
                  <div className="text-lg font-bold text-blue-600">3.0%</div>
                  <p className="text-xs text-muted-foreground">Standard target for Mammography examinations</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Overall</label>
                  <div className="text-lg font-bold text-green-600">2.0%</div>
                  <p className="text-xs text-muted-foreground">Overall department target</p>
                </div>
              </div>
              
              <div className="mt-4">
                <Button variant="outline" disabled>
                  Customize Targets
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Target customization will be available in a future update
                </p>
              </div>
            </div>

            {/* Data Retention */}
            <div className="border-t pt-6">
              <h3 className="font-medium mb-4">Data Retention</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Incident Data</div>
                    <div className="text-sm text-muted-foreground">
                      How long to keep individual reject incident records
                    </div>
                  </div>
                  <Badge variant="outline">5 years</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Monthly Analysis</div>
                    <div className="text-sm text-muted-foreground">
                      How long to keep monthly analysis reports
                    </div>
                  </div>
                  <Badge variant="outline">Indefinite</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Statistical Data</div>
                    <div className="text-sm text-muted-foreground">
                      How long to keep aggregated statistics
                    </div>
                  </div>
                  <Badge variant="outline">Indefinite</Badge>
                </div>
              </div>
            </div>

            {/* Notification Settings */}
            <div className="border-t pt-6">
              <h3 className="font-medium mb-4">Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">High Reject Rate Alert</div>
                    <div className="text-sm text-muted-foreground">
                      Notify when monthly reject rate exceeds target by 50%
                    </div>
                  </div>
                  <Badge variant="outline">Enabled</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Critical Incident Alert</div>
                    <div className="text-sm text-muted-foreground">
                      Immediate notification for critical severity incidents
                    </div>
                  </div>
                  <Badge variant="outline">Enabled</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Monthly Report Reminder</div>
                    <div className="text-sm text-muted-foreground">
                      Remind to complete monthly analysis
                    </div>
                  </div>
                  <Badge variant="outline">Enabled</Badge>
                </div>
              </div>
              
              <div className="mt-4">
                <Button variant="outline" disabled>
                  Configure Notifications
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Notification customization will be available in a future update
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Documentation & Help</CardTitle>
          <CardDescription>
            Resources for using the reject analysis system
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">User Guides</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Logging reject incidents</li>
                <li>• Creating monthly analyses</li>
                <li>• Understanding reject categories</li>
                <li>• Interpreting statistics and trends</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Administrator Guides</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• PACS server configuration</li>
                <li>• Category management</li>
                <li>• User permissions and roles</li>
                <li>• Data export and reporting</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t">
            <Button variant="outline" disabled>
              View Documentation
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Complete documentation will be available soon
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}