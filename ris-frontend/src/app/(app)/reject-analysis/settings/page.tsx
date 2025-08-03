'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, AlertTriangle, Server, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { usePacsConfig } from '@/hooks/usePacsConfig';
import { useState } from 'react';
import { toast } from '@/lib/toast';

export default function RejectAnalysisSettingsPage() {
  const { user } = useAuth();
  const [savingServerId, setSavingServerId] = useState<number | null>(null);
  
  const {
    servers: pacsServers,
    loading,
    error,
    updateServer: updatePacsServer,
    testConnection,
  } = usePacsConfig();

  const isSuperuser = user?.is_superuser || false;

  // Handle updating reject analysis configuration for a PACS server
  const updateRejectAnalysisConfig = async (serverId: number, includeInAnalysis: boolean) => {
    try {
      setSavingServerId(serverId);
      await updatePacsServer(serverId, { include_in_reject_analysis: includeInAnalysis });
    } catch (error) {
      console.error('Failed to update reject analysis config:', error);
    } finally {
      setSavingServerId(null);
    }
  };

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

      {/* PACS Reject Analysis Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            PACS Reject Analysis Configuration
          </CardTitle>
          <CardDescription>
            Configure which PACS servers to include in reject analysis data collection
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-600 mb-4">{error}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </div>
          ) : !pacsServers || pacsServers.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No PACS servers configured</h3>
              <p className="text-muted-foreground mb-4">
                PACS servers need to be configured before enabling reject analysis integration.
              </p>
              <p className="text-sm text-muted-foreground">
                Contact your system administrator to configure PACS servers.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pacsServers.map((server) => (
                <div key={server.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-lg">{server.name}</h3>
                        <div className="flex gap-2">
                          {server.is_primary && (
                            <Badge variant="default" className="text-xs">
                              Primary
                            </Badge>
                          )}
                          <Badge 
                            variant={server.is_active ? "default" : "secondary"} 
                            className={`text-xs ${server.is_active ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'}`}
                          >
                            {server.is_active ? 'Active' : 'Inactive'}
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
                        <span className="text-sm font-medium">Include in Reject Analysis:</span>
                        <Switch
                          checked={server.include_in_reject_analysis}
                          onCheckedChange={(checked) => updateRejectAnalysisConfig(server.id, checked)}
                          disabled={savingServerId === server.id || !server.is_active}
                        />
                        {server.include_in_reject_analysis ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      
                      {savingServerId === server.id && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          Saving...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {!server.is_active && (
                    <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
                      This server is inactive and cannot be included in reject analysis.
                    </div>
                  )}
                </div>
              ))}
              
              {pacsServers.some(server => server.include_in_reject_analysis) && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded">
                  <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">
                      {pacsServers.filter(server => server.include_in_reject_analysis).length} PACS server(s) enabled for reject analysis
                    </span>
                  </div>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Reject analysis data will be collected from enabled servers during system integration.
                  </p>
                </div>
              )}
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