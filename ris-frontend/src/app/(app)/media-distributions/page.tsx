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
  Loader2
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
        dist.study_accession.toLowerCase().includes(searchLower) ||
        dist.collected_by?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredDistributions(filtered);
  };

  useEffect(() => {
    filterDistributions(distributions, activeTab, searchTerm);
  }, [distributions, activeTab, searchTerm]);

  const handleStatusChange = async (distributionId: number, action: 'ready' | 'cancel') => {
    try {
      let updatedDistribution;
      
      if (action === 'ready') {
        updatedDistribution = await MediaDistributionAPI.markReady(distributionId);
        toast.success('Media marked as ready for collection');
      } else {
        updatedDistribution = await MediaDistributionAPI.cancelDistribution(distributionId);
        toast.success('Media distribution cancelled');
      }

      // Update the distributions list
      setDistributions(prev => 
        prev.map(dist => 
          dist.id === distributionId ? updatedDistribution : dist
        )
      );
    } catch (error) {
      console.error(`Failed to ${action} distribution:`, error);
      toast.error(`Failed to ${action} distribution`);
    }
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
                          <TableRow key={distribution.id}>
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
                                <div className="text-sm">{formatDate(distribution.study_date)}</div>
                                <div className="text-sm text-muted-foreground">
                                  {distribution.study_accession}
                                </div>
                                {distribution.study_description && (
                                  <div className="text-xs text-muted-foreground">
                                    {distribution.study_description}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span>{MEDIA_TYPE_CONFIG[distribution.media_type]?.icon}</span>
                                  <span className="text-sm">{distribution.media_type}</span>
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
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {distribution.status === 'REQUESTED' && (
                                    <DropdownMenuItem
                                      onClick={() => handleStatusChange(distribution.id, 'ready')}
                                    >
                                      <Check className="h-4 w-4 mr-2" />
                                      Mark as Ready
                                    </DropdownMenuItem>
                                  )}
                                  
                                  {distribution.status === 'READY' && (
                                    <Link href={`/media-distributions/collect/${distribution.id}`}>
                                      <DropdownMenuItem>
                                        <Package className="h-4 w-4 mr-2" />
                                        Record Collection
                                      </DropdownMenuItem>
                                    </Link>
                                  )}
                                  
                                  {(distribution.status === 'REQUESTED' || distribution.status === 'PREPARING') && (
                                    <DropdownMenuItem
                                      onClick={() => handleStatusChange(distribution.id, 'cancel')}
                                      className="text-red-600"
                                    >
                                      <X className="h-4 w-4 mr-2" />
                                      Cancel Request
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
      </div>
    </ProtectedRoute>
  );
}