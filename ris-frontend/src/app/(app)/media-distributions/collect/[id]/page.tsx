'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Package, 
  User, 
  Calendar, 
  FileText, 
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { 
  MediaDistribution,
  CollectionFormData,
  MEDIA_STATUS_CONFIG,
  MEDIA_TYPE_CONFIG,
  URGENCY_CONFIG
} from '@/types/media-distribution';
import { MediaDistributionAPI, MediaDistributionUtils } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

export default function CollectionPage() {
  const router = useRouter();
  const params = useParams();
  const distributionId = parseInt(params.id as string);

  const [distribution, setDistribution] = useState<MediaDistribution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CollectionFormData>({
    collected_by: '',
    collected_by_ic: '',
    relationship_to_patient: '',
    comments: ''
  });

  const loadDistribution = async () => {
    try {
      setIsLoading(true);
      const data = await MediaDistributionAPI.getMediaDistribution(distributionId);
      setDistribution(data);
      
      if (data.status !== 'READY') {
        toast.warning('This distribution is not ready for collection');
      }
    } catch (error) {
      console.error('Failed to load distribution:', error);
      toast.error('Failed to load distribution details');
      router.push('/media-distributions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (distributionId) {
      loadDistribution();
    }
  }, [distributionId]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.collected_by.trim()) {
      newErrors.collected_by = 'Collector name is required';
    }

    if (!formData.collected_by_ic.trim()) {
      newErrors.collected_by_ic = 'IC number is required';
    } else if (!MediaDistributionUtils.validateIC(formData.collected_by_ic)) {
      newErrors.collected_by_ic = 'Please enter a valid IC number (format: 123456-12-1234)';
    }

    if (!formData.relationship_to_patient.trim()) {
      newErrors.relationship_to_patient = 'Relationship to patient is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please correct the errors in the form');
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionDetails = {
        collected_by: formData.collected_by.trim(),
        collected_by_ic: MediaDistributionUtils.formatIC(formData.collected_by_ic.trim()),
        relationship_to_patient: formData.relationship_to_patient.trim(),
        collection_datetime: new Date().toISOString(),
        comments: formData.comments.trim() || undefined
      };

      await MediaDistributionAPI.recordCollection(distributionId, collectionDetails);
      
      toast.success('Collection recorded successfully');
      router.push('/media-distributions');
      
    } catch (error) {
      console.error('Failed to record collection:', error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : 'Failed to record collection'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleICFormat = (value: string) => {
    const formatted = MediaDistributionUtils.formatIC(value);
    setFormData(prev => ({ ...prev, collected_by_ic: formatted }));
    
    // Clear IC error if it becomes valid
    if (MediaDistributionUtils.validateIC(formatted) && errors.collected_by_ic) {
      setErrors(prev => ({ ...prev, collected_by_ic: '' }));
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

  if (!distribution) {
    return (
      <ProtectedRoute>
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-lg font-semibold mb-2">Distribution Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The requested media distribution could not be found.
              </p>
              <Link href="/media-distributions">
                <Button>Back to Distributions</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/media-distributions">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Distributions
              </Button>
            </Link>
          </div>
          
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Record Collection</h1>
            <p className="text-muted-foreground mt-2">
              Record the collection of media distribution
            </p>
          </div>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Distribution Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Distribution Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Patient</Label>
                  <div className="font-medium">{distribution.daftar.pesakit.nama}</div>
                  <div className="text-sm text-muted-foreground">
                    {distribution.daftar.pesakit.mrn || distribution.daftar.pesakit.nric}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div>
                    <Badge className={MEDIA_STATUS_CONFIG[distribution.status]?.color}>
                      {MEDIA_STATUS_CONFIG[distribution.status]?.icon} {MEDIA_STATUS_CONFIG[distribution.status]?.label}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Media Type</Label>
                  <div className="flex items-center gap-2">
                    <span>{MEDIA_TYPE_CONFIG[distribution.media_type]?.icon}</span>
                    <span>{MEDIA_TYPE_CONFIG[distribution.media_type]?.label}</span>
                    <Badge variant="outline">Qty: {distribution.quantity}</Badge>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Urgency</Label>
                  <div>
                    <Badge className={URGENCY_CONFIG[distribution.urgency]?.color}>
                      {distribution.urgency}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Study Information</Label>
                <div className="space-y-1">
                  <div className="text-sm">
                    Study Date: {formatDate(distribution.daftar.tarikh)}
                  </div>
                  <div className="text-sm">
                    Accession: {distribution.daftar.parent_accession_number}
                  </div>
                  {distribution.daftar.study_description && (
                    <div className="text-sm">
                      Description: {distribution.daftar.study_description}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-muted-foreground">Request Date</Label>
                <div className="text-sm">{formatDate(distribution.request_date)}</div>
              </div>

              {distribution.comments && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Request Comments</Label>
                  <div className="text-sm bg-muted p-2 rounded">{distribution.comments}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Alert */}
          {distribution.status !== 'READY' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This distribution is currently <strong>{MEDIA_STATUS_CONFIG[distribution.status]?.label}</strong> and not ready for collection.
                You can still record collection details if needed.
              </AlertDescription>
            </Alert>
          )}

          {distribution.status === 'READY' && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                This distribution is ready for collection. Please fill in the collection details below.
              </AlertDescription>
            </Alert>
          )}

          {/* Collection Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Collection Details
              </CardTitle>
              <CardDescription>
                Record who is collecting the media and their relationship to the patient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="collected-by">
                      Collector Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="collected-by"
                      value={formData.collected_by}
                      onChange={(e) => setFormData(prev => ({ ...prev, collected_by: e.target.value }))}
                      placeholder="Enter collector's full name"
                      disabled={isSubmitting}
                    />
                    {errors.collected_by && (
                      <p className="text-sm text-red-600">{errors.collected_by}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="collected-by-ic">
                      IC Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="collected-by-ic"
                      value={formData.collected_by_ic}
                      onChange={(e) => handleICFormat(e.target.value)}
                      placeholder="123456-12-1234"
                      disabled={isSubmitting}
                    />
                    {errors.collected_by_ic && (
                      <p className="text-sm text-red-600">{errors.collected_by_ic}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="relationship">
                    Relationship to Patient <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="relationship"
                    value={formData.relationship_to_patient}
                    onChange={(e) => setFormData(prev => ({ ...prev, relationship_to_patient: e.target.value }))}
                    placeholder="e.g., Self, Spouse, Child, Parent, Guardian"
                    disabled={isSubmitting}
                  />
                  {errors.relationship_to_patient && (
                    <p className="text-sm text-red-600">{errors.relationship_to_patient}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="collection-comments">Collection Comments</Label>
                  <Textarea
                    id="collection-comments"
                    value={formData.comments}
                    onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                    placeholder="Any additional notes about the collection..."
                    disabled={isSubmitting}
                    rows={3}
                  />
                </div>

                <Separator />

                <div className="flex justify-end gap-4">
                  <Link href="/media-distributions">
                    <Button type="button" variant="outline" disabled={isSubmitting}>
                      Cancel
                    </Button>
                  </Link>
                  
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Recording Collection...
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4 mr-2" />
                        Record Collection
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}