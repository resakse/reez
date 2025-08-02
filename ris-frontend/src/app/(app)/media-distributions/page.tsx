'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Check, 
  Package, 
  X, 
  Calendar,
  User,
  FileText,
  BarChart3,
  RefreshCw,
  Loader2,
  RotateCcw
} from 'lucide-react';
import Link from 'next/link';
import { 
  MediaDistribution, 
  MediaDistributionFilters,
  MEDIA_STATUS_CONFIG,
  MEDIA_TYPE_CONFIG,
  URGENCY_CONFIG,
  MediaDistributionListItem
} from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

export default function MediaDistributionsPage() {
  const [distributions, setDistributions] = useState<MediaDistributionListItem[]>([]);
  const [filteredDistributions, setFilteredDistributions] = useState<MediaDistributionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDistribution, setSelectedDistribution] = useState<MediaDistributionListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const loadDistributions = async () => {
    try {
      setIsLoading(true);
      const response = await MediaDistributionAPI.getMediaDistributions();
      setDistributions(response.results);
      setFilteredDistributions(response.results);
    } catch (error) {
      console.error('Failed to load distributions:', error);
      toast.error('Failed to load media distributions');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDistributions = async () => {
    try {
      setIsRefreshing(true);
      const response = await MediaDistributionAPI.getMediaDistributions();
      setDistributions(response.results);
      filterDistributions(response.results, activeTab, searchTerm);
      toast.success('Data refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh distributions:', error);
      toast.error('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDistributions();
  }, []);

  const filterDistributions = (data: MediaDistributionListItem[], status: string, search: string) => {
    let filtered = data;

    // Filter by status
    if (status !== 'all') {
      filtered = filtered.filter(dist => dist.status === status.toUpperCase());
    }

    // Filter by search term
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(dist => 
        dist.patient_name.toLowerCase().includes(searchLower) ||
        dist.patient_mrn?.toLowerCase().includes(searchLower) ||
        dist.study_summary.accession_numbers.some(acc => acc.toLowerCase().includes(searchLower)) ||
        dist.study_summary.study_descriptions.some(desc => desc.toLowerCase().includes(searchLower)) ||
        dist.collected_by?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredDistributions(filtered);
  };

  useEffect(() => {
    filterDistributions(distributions, activeTab, searchTerm);
  }, [distributions, activeTab, searchTerm]);

  const handleStatusChange = async (distributionId: number, action: 'ready') => {
    try {
      await MediaDistributionAPI.markReady(distributionId);
      toast.success('Media marked as ready for collection');

      // Reload the full list to ensure consistent data structure
      const response = await MediaDistributionAPI.getMediaDistributions();
      setDistributions(response.results);
      filterDistributions(response.results, activeTab, searchTerm);
    } catch (error) {
      console.error(`Failed to ${action} distribution:`, error);
      toast.error(`Failed to ${action} distribution`);
    }
  };

  const handleCancelClick = (distribution: MediaDistributionListItem) => {
    setSelectedDistribution(distribution);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleCancelConfirm = async () => {
    if (!selectedDistribution) return;

    setIsSubmittingCancel(true);
    try {
      await MediaDistributionAPI.cancelDistribution(
        selectedDistribution.id, 
        cancelReason.trim() || undefined
      );
      toast.success('Media distribution cancelled');

      // Reload the full list to ensure consistent data structure
      const response = await MediaDistributionAPI.getMediaDistributions();
      setDistributions(response.results);
      filterDistributions(response.results, activeTab, searchTerm);

      setShowCancelModal(false);
      setSelectedDistribution(null);
      setCancelReason('');
    } catch (error) {
      console.error('Failed to cancel distribution:', error);
      toast.error('Failed to cancel distribution');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleRestoreClick = async (distribution: MediaDistributionListItem) => {
    try {
      await MediaDistributionAPI.restoreDistribution(distribution.id);
      toast.success('Media distribution restored successfully');

      // Reload the full list to ensure consistent data structure
      const response = await MediaDistributionAPI.getMediaDistributions();
      setDistributions(response.results);
      filterDistributions(response.results, activeTab, searchTerm);
    } catch (error) {
      console.error('Failed to restore distribution:', error);
      toast.error('Failed to restore distribution');
    }
  };

  const handleRowClick = (distribution: MediaDistributionListItem) => {
    setSelectedDistribution(distribution);
    setShowDetailsModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusCounts = () => {
    return {
      all: distributions.length,
      requested: distributions.filter(d => d.status === 'REQUESTED').length,
      preparing: distributions.filter(d => d.status === 'PREPARING').length,
      ready: distributions.filter(d => d.status === 'READY').length,
      collected: distributions.filter(d => d.status === 'COLLECTED').length,
      cancelled: distributions.filter(d => d.status === 'CANCELLED').length,
    };
  };

  const statusCounts = getStatusCounts();

  if (isLoading) {
    return (
      <ProtectedRoute>
        <div className="container mx-auto py-6">
          <div className="flex items-center justify-center min-h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Media Distributions</h1>
            <p className="text-muted-foreground mt-2">
              Manage CD, DVD, and film distribution requests
            </p>
          </div>
          
          <div className="flex gap-2">
            <Link href="/media-distributions/reports">
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              onClick={refreshDistributions}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            
            <Link href="/media-distributions/request">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name, MRN, NRIC, accession number, or collector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Status Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="all" className="flex items-center gap-2">
              All
              <Badge variant="secondary" className="ml-1">{statusCounts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="requested" className="flex items-center gap-2">
              Requested
              <Badge variant="secondary" className="ml-1">{statusCounts.requested}</Badge>
            </TabsTrigger>
            <TabsTrigger value="preparing" className="flex items-center gap-2">
              Preparing
              <Badge variant="secondary" className="ml-1">{statusCounts.preparing}</Badge>
            </TabsTrigger>
            <TabsTrigger value="ready" className="flex items-center gap-2">
              Ready
              <Badge variant="secondary" className="ml-1">{statusCounts.ready}</Badge>
            </TabsTrigger>
            <TabsTrigger value="collected" className="flex items-center gap-2">
              Collected
              <Badge variant="secondary" className="ml-1">{statusCounts.collected}</Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="flex items-center gap-2">
              Cancelled
              <Badge variant="secondary" className="ml-1">{statusCounts.cancelled}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === 'all' ? 'All Distributions' : 
                   `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Distributions`}
                </CardTitle>
                <CardDescription>
                  {filteredDistributions.length} of {distributions.length} distributions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredDistributions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No distributions found</p>
                    {searchTerm && (
                      <p className="text-sm mt-2">Try adjusting your search terms</p>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Study</TableHead>
                          <TableHead>Media</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Urgency</TableHead>
                          <TableHead>Request Date</TableHead>
                          <TableHead>Collected By</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDistributions.map((distribution) => (
                          <TableRow 
                            key={distribution.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleRowClick(distribution)}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{distribution.patient_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {distribution.patient_mrn}
                                </div>
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm font-medium">
                                  {distribution.study_count} stud{distribution.study_count > 1 ? 'ies' : 'y'}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {distribution.study_summary.date_range}
                                </div>
                                {distribution.study_summary.accession_numbers.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {distribution.study_summary.accession_numbers.slice(0, 2).join(', ')}
                                    {distribution.study_summary.accession_numbers.length > 2 && '...'}
                                  </div>
                                )}
                                {distribution.study_summary.study_descriptions.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {distribution.study_summary.study_descriptions[0]}
                                    {distribution.study_summary.study_descriptions.length > 1 && ' +more'}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span>{MEDIA_TYPE_CONFIG[distribution.media_type]?.icon || '📋'}</span>
                                  <span className="text-sm">{MEDIA_TYPE_CONFIG[distribution.media_type]?.label || distribution.media_type}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Qty: {distribution.quantity}
                                </div>
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <Badge className={MEDIA_STATUS_CONFIG[distribution.status]?.color}>
                                {MEDIA_STATUS_CONFIG[distribution.status]?.icon} {MEDIA_STATUS_CONFIG[distribution.status]?.label}
                              </Badge>
                            </TableCell>
                            
                            <TableCell>
                              <Badge className={URGENCY_CONFIG[distribution.urgency]?.color}>
                                {distribution.urgency}
                              </Badge>
                            </TableCell>
                            
                            <TableCell>
                              <div className="text-sm">{formatDate(distribution.request_date)}</div>
                            </TableCell>
                            
                            <TableCell>
                              <div className="text-sm">
                                {distribution.collected_by || '-'}
                              </div>
                              {distribution.collection_datetime && (
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(distribution.collection_datetime)}
                                </div>
                              )}
                            </TableCell>
                            
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {distribution.status === 'REQUESTED' && (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStatusChange(distribution.id, 'ready');
                                      }}
                                    >
                                      <Check className="h-4 w-4 mr-2" />
                                      Mark as Ready
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {distribution.status === 'READY' && (
                                    <Link href={`/media-distributions/collect/${distribution.id}`}>
                                      <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                        <Package className="h-4 w-4 mr-2" />
                                        Record Collection
                                      </DropdownMenuItem>
                                    </Link>
                                  )}
                                  
                                  {(distribution.status === 'REQUESTED' || distribution.status === 'PREPARING') && (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelClick(distribution);
                                      }}
                                      className="text-red-600"
                                    >
                                      <X className="h-4 w-4 mr-2" />
                                      Cancel Request
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {distribution.status === 'CANCELLED' && (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestoreClick(distribution);
                                      }}
                                      className="text-green-600"
                                    >
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      Restore Request
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Cancel Confirmation Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Distribution Request</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel this media distribution request for{' '}
                <strong>{selectedDistribution?.patient_name}</strong>?
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="cancel-reason">Cancellation Reason (Optional)</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Enter reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowCancelModal(false)}
                disabled={isSubmittingCancel}
              >
                Keep Request
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancelConfirm}
                disabled={isSubmittingCancel}
              >
                {isSubmittingCancel ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancel Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Distribution Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Distribution Details</DialogTitle>
              <DialogDescription>
                Media distribution information for {selectedDistribution?.patient_name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedDistribution && (
              <div className="space-y-6">
                {/* Patient Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Patient</Label>
                    <div className="font-medium">{selectedDistribution.patient_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedDistribution.patient_mrn}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Request Date</Label>
                    <div className="text-sm">{formatDate(selectedDistribution.request_date)}</div>
                  </div>
                </div>

                {/* Studies Information */}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    Studies ({selectedDistribution.study_count})
                  </Label>
                  <div className="mt-2 space-y-2">
                    <div className="text-sm">
                      <strong>Date Range:</strong> {selectedDistribution.study_summary.date_range}
                    </div>
                    
                    {selectedDistribution.study_summary.accession_numbers.length > 0 && (
                      <div className="text-sm">
                        <strong>Accession Numbers:</strong>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {selectedDistribution.study_summary.accession_numbers.map((acc, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {acc}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {selectedDistribution.study_summary.study_descriptions.length > 0 && (
                      <div className="text-sm">
                        <strong>Descriptions:</strong>
                        <ul className="mt-1 list-disc list-inside text-muted-foreground">
                          {selectedDistribution.study_summary.study_descriptions.map((desc, idx) => (
                            <li key={idx}>{desc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Media Information */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Media Type</Label>
                    <div className="flex items-center gap-2">
                      <span>{MEDIA_TYPE_CONFIG[selectedDistribution.media_type]?.icon || '📋'}</span>
                      <span>{MEDIA_TYPE_CONFIG[selectedDistribution.media_type]?.label || selectedDistribution.media_type}</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Quantity</Label>
                    <div className="text-sm">{selectedDistribution.quantity}</div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Urgency</Label>
                    <Badge className={URGENCY_CONFIG[selectedDistribution.urgency]?.color}>
                      {selectedDistribution.urgency}
                    </Badge>
                  </div>
                </div>

                {/* Status Information */}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div className="mt-2">
                    <Badge className={MEDIA_STATUS_CONFIG[selectedDistribution.status]?.color}>
                      {MEDIA_STATUS_CONFIG[selectedDistribution.status]?.icon} {MEDIA_STATUS_CONFIG[selectedDistribution.status]?.label}
                    </Badge>
                    {selectedDistribution.status === 'CANCELLED' && selectedDistribution.cancellation_reason && (
                      <div className="mt-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                        <Label className="text-sm font-medium text-red-700 dark:text-red-300">Cancellation Reason:</Label>
                        <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {selectedDistribution.cancellation_reason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Collection Information */}
                {selectedDistribution.collected_by && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Collected By</Label>
                      <div className="text-sm">{selectedDistribution.collected_by}</div>
                      {selectedDistribution.collected_by_ic && (
                        <div className="text-xs text-muted-foreground mt-1">
                          IC/Passport: {selectedDistribution.collected_by_ic}
                        </div>
                      )}
                      {selectedDistribution.relationship_to_patient && (
                        <div className="text-xs text-muted-foreground">
                          Relationship: {selectedDistribution.relationship_to_patient}
                        </div>
                      )}
                    </div>
                    
                    {selectedDistribution.collection_datetime && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Collection Date</Label>
                        <div className="text-sm">{formatDate(selectedDistribution.collection_datetime)}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Comments Section */}
                {selectedDistribution.comments && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Request Comments</Label>
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <div className="text-sm">{selectedDistribution.comments}</div>
                    </div>
                  </div>
                )}

                {/* Staff Information */}
                {(selectedDistribution.prepared_by_name || selectedDistribution.handed_over_by_name) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedDistribution.prepared_by_name && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Prepared By</Label>
                        <div className="text-sm">{selectedDistribution.prepared_by_name}</div>
                      </div>
                    )}
                    
                    {selectedDistribution.handed_over_by_name && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Handed Over By</Label>
                        <div className="text-sm">{selectedDistribution.handed_over_by_name}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {selectedDistribution?.status === 'CANCELLED' && (
                <Button 
                  variant="outline"
                  onClick={async () => {
                    if (selectedDistribution) {
                      await handleRestoreClick(selectedDistribution);
                      setShowDetailsModal(false);
                    }
                  }}
                  className="text-green-600 border-green-600 hover:bg-green-50"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Request
                </Button>
              )}
              <Button onClick={() => setShowDetailsModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}