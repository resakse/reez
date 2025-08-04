'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Calendar,
  User,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';

import AuthService from '@/lib/auth';

interface AuditLog {
  id: number;
  username: string;
  action: string;
  action_display: string;
  action_color: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  timestamp: string;
  formatted_timestamp: string;
  success: boolean;
  ip_address: string;
}

interface AuditTableProps {
  logs: AuditLog[];
  loading?: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export default function AuditTable({ 
  logs, 
  loading = false, 
  currentPage, 
  totalPages, 
  totalCount,
  onPageChange 
}: AuditTableProps) {
  
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const handleViewDetails = async (log: AuditLog) => {
    // Fetch detailed information for the log
    try {
      const response = await AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/audit/logs/${log.id}/`);
      if (response.ok) {
        const detailedLog = await response.json();
        setSelectedLog(detailedLog);
        setShowDetailDialog(true);
      }
    } catch (error) {
      console.error('Failed to fetch log details:', error);
      // Fallback to basic log data
      setSelectedLog(log);
      setShowDetailDialog(true);
    }
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'DELETE':
        return 'destructive';
      case 'CREATE':
        return 'default';
      case 'LOGIN_FAILED':
        return 'destructive';
      case 'LOGIN':
      case 'LOGOUT':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LOGIN_FAILED':
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  if (loading && logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex items-center space-x-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Audit Logs</CardTitle>
            <div className="text-sm text-muted-foreground">
              {totalCount.toLocaleString()} total records
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No audit logs found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{log.formatted_timestamp}</span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{log.username}</span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant={getActionBadgeVariant(log.action)}
                          className="flex items-center space-x-1 w-fit"
                        >
                          {getActionIcon(log.action)}
                          <span>{log.action_display || log.action}</span>
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        {log.resource_type && (
                          <div>
                            <div className="font-medium">{log.resource_type}</div>
                            {log.resource_name && (
                              <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {log.resource_name}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center space-x-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span>{log.ip_address || 'N/A'}</span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {log.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className={log.success ? 'text-green-600' : 'text-red-600'}>
                            {log.success ? 'Success' : 'Failed'}
                          </span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                  <p className="font-mono">{selectedLog.formatted_timestamp}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">User</label>
                  <p className="font-medium">{selectedLog.username}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Action</label>
                  <Badge variant={getActionBadgeVariant(selectedLog.action)}>
                    {selectedLog.action_display || selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="flex items-center space-x-2">
                    {selectedLog.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={selectedLog.success ? 'text-green-600' : 'text-red-600'}>
                      {selectedLog.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Resource Type</label>
                  <p>{selectedLog.resource_type || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Resource ID</label>
                  <p className="font-mono">{selectedLog.resource_id || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Resource Name</label>
                  <p>{selectedLog.resource_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <p className="font-mono">{selectedLog.ip_address || 'N/A'}</p>
                </div>
              </div>

              {/* Additional data fields if available */}
              {(selectedLog as any).old_data && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Previous Data</label>
                  <div className="mt-2 border rounded-md">
                    <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-words">
                      {(selectedLog as any).pretty_old_data || JSON.stringify((selectedLog as any).old_data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {(selectedLog as any).new_data && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">New Data</label>
                  <div className="mt-2 border rounded-md">
                    <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-words">
                      {(selectedLog as any).pretty_new_data || JSON.stringify((selectedLog as any).new_data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}