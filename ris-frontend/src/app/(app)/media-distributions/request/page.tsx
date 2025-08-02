'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Send, Loader2, User, Calendar, FileText, Clock, Activity, Image } from 'lucide-react';
import Link from 'next/link';
import { StudySelector } from '@/components/media-distribution/StudySelector';
import { 
  MediaRequestFormData, 
  StudyForMediaDistribution, 
  MEDIA_TYPE_CONFIG, 
  URGENCY_CONFIG,
  MediaCalculationUtils,
  MEDIA_CAPACITY_MB
} from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

export default function MediaRequestPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState<MediaRequestFormData>({
    patient_search: '',
    selected_studies: [],
    media_type: 'CD',
    quantity: 1,
    urgency: 'NORMAL',
    comments: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<StudyForMediaDistribution[]>([]);
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');

  const handleStudiesSelect = (studies: StudyForMediaDistribution[]) => {
    setFormData(prev => {
      const newQuantity = MediaCalculationUtils.calculateRecommendedQuantity(studies, prev.media_type as keyof typeof MEDIA_CAPACITY_MB);
      return {
        ...prev,
        selected_studies: studies,
        quantity: newQuantity
      };
    });
    
    // Clear patient search error if studies are selected
    if (studies.length > 0 && errors.selected_studies) {
      setErrors(prev => ({ ...prev, selected_studies: '' }));
    }
  };

  const handleSearchResults = (results: StudyForMediaDistribution[], searchTerm: string) => {
    setSearchResults(results);
    setCurrentSearchTerm(searchTerm);
  };

  const handleMediaTypeChange = (mediaType: string) => {
    setFormData(prev => {
      const newQuantity = MediaCalculationUtils.calculateRecommendedQuantity(
        prev.selected_studies, 
        mediaType as keyof typeof MEDIA_CAPACITY_MB
      );
      return {
        ...prev,
        media_type: mediaType as any,
        quantity: newQuantity
      };
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.selected_studies.length === 0) {
      newErrors.selected_studies = 'Please select at least one patient study';
    }

    if (!formData.media_type) {
      newErrors.media_type = 'Please select media type';
    }

    if (!formData.quantity || formData.quantity < 1 || formData.quantity > 10) {
      newErrors.quantity = 'Quantity must be between 1 and 10';
    }

    if (!formData.urgency) {
      newErrors.urgency = 'Please select urgency level';
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
      // Create a single request with multiple studies
      const request: MediaDistributionRequest = {
        study_ids: formData.selected_studies.map(study => study.id),
        media_type: formData.media_type,
        quantity: formData.quantity,
        urgency: formData.urgency,
        comments: formData.comments || undefined
      };

      await MediaDistributionAPI.createMediaDistribution(request);
      
      const studyCount = formData.selected_studies.length;
      toast.success(`Media distribution request created successfully with ${studyCount} stud${studyCount > 1 ? 'ies' : 'y'}`);
      router.push('/media-distributions');
      
    } catch (error) {
      console.error('Failed to create media distribution request:', error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : 'Failed to create media distribution request'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      patient_search: '',
      selected_studies: [],
      media_type: 'CD',
      quantity: 1,
      urgency: 'NORMAL',
      comments: ''
    });
    setErrors({});
    setSearchResults([]);
    setCurrentSearchTerm('');
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/media-distributions">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Media Distributions
              </Button>
            </Link>
          </div>
          
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Request Media Distribution</h1>
            <p className="text-muted-foreground mt-2">
              Create a new request for CD, DVD, or film distribution
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Form - Left Side */}
          <div className="lg:col-span-4">
            <form onSubmit={handleSubmit} className="space-y-6">
            {/* Patient Study Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Patient Study Selection</CardTitle>
                <CardDescription>
                  Search and select the patient study for media distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StudySelector
                  selectedStudies={formData.selected_studies}
                  onStudiesSelect={handleStudiesSelect}
                  onSearchResults={handleSearchResults}
                  disabled={isSubmitting}
                />
                {errors.selected_studies && (
                  <p className="text-sm text-red-600 mt-2">{errors.selected_studies}</p>
                )}
              </CardContent>
            </Card>

            {/* Media Calculation Summary - Before Media Details */}
            {formData.selected_studies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Media Calculation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selected Studies:</span>
                    <span className="font-medium">{formData.selected_studies.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Size:</span>
                    <span className="font-medium">
                      {Math.round(MediaCalculationUtils.calculateTotalSize(formData.selected_studies))} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Media Type:</span>
                    <span className="font-medium">{MEDIA_TYPE_CONFIG[formData.media_type]?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recommended Qty:</span>
                    <span className="font-medium text-green-600">
                      {MediaCalculationUtils.calculateRecommendedQuantity(
                        formData.selected_studies, 
                        formData.media_type as keyof typeof MEDIA_CAPACITY_MB
                      )}
                    </span>
                  </div>
                  {(() => {
                    const validation = MediaCalculationUtils.validateQuantity(
                      formData.selected_studies,
                      formData.media_type as keyof typeof MEDIA_CAPACITY_MB,
                      formData.quantity
                    );
                    if (!validation.isValid) {
                      return (
                        <div className="text-orange-600 dark:text-orange-400 text-xs p-2 bg-orange-50 dark:bg-orange-950/20 rounded">
                          ⚠️ {validation.message}
                        </div>
                      );
                    }
                    return (
                      <div className="text-green-600 dark:text-green-400 text-xs p-2 bg-green-50 dark:bg-green-950/20 rounded">
                        ✅ Capacity validation passed
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Media Details */}
            <Card>
              <CardHeader>
                <CardTitle>Media Details</CardTitle>
                <CardDescription>
                  Specify the type and quantity of media required
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="media-type">
                      Media Type <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.media_type}
                      onValueChange={handleMediaTypeChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select media type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MEDIA_TYPE_CONFIG).map(([value, config]) => (
                          <SelectItem key={value} value={value}>
                            <div className="flex items-center gap-2">
                              <span>{config.icon}</span>
                              <span>{config.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.media_type && (
                      <p className="text-sm text-red-600">{errors.media_type}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quantity">
                      Quantity <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.quantity}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        quantity: parseInt(e.target.value) || 1 
                      }))}
                      disabled={isSubmitting}
                    />
                    {errors.quantity && (
                      <p className="text-sm text-red-600">{errors.quantity}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="urgency">
                    Urgency Level <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.urgency}
                    onValueChange={(value: any) => setFormData(prev => ({ ...prev, urgency: value }))}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select urgency level" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(URGENCY_CONFIG).map(([value, config]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${config.color.includes('red') ? 'bg-red-500' : config.color.includes('orange') ? 'bg-orange-500' : 'bg-gray-500'}`} />
                            <span>{config.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.urgency && (
                    <p className="text-sm text-red-600">{errors.urgency}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Additional Information */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
                <CardDescription>
                  Optional comments or special instructions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="comments">Comments</Label>
                  <Textarea
                    id="comments"
                    placeholder="Enter any special instructions or comments..."
                    value={formData.comments}
                    onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
                    disabled={isSubmitting}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Form Actions */}
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={isSubmitting}
              >
                Reset Form
              </Button>
              
              <Button
                type="submit"
                disabled={isSubmitting || formData.selected_studies.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Request...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create Request
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Search Results Panel - Right Side */}
        <div className="lg:col-span-8">
          <div className="sticky top-6 space-y-4">
            {/* Search Results Table */}
            {searchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Search Results ({searchResults.length})
                  </CardTitle>
                  <CardDescription>
                    {currentSearchTerm ? `Found ${searchResults.length} studies for "${currentSearchTerm}"` : `${searchResults.length} available studies`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="text-xs">
                          <TableHead className="w-12">Select</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Date/Time</TableHead>
                          <TableHead>Exams</TableHead>
                          <TableHead>Images</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Accession</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.map((study) => {
                          const isSelected = formData.selected_studies.some(s => s.id === study.id);
                          return (
                            <TableRow 
                              key={study.id}
                              className={`cursor-pointer hover:bg-muted/50 text-xs ${
                                isSelected ? 'bg-green-50 dark:bg-green-950/20' : ''
                              }`}
                              onClick={() => handleStudiesSelect(
                                isSelected
                                  ? formData.selected_studies.filter(s => s.id !== study.id)
                                  : [...formData.selected_studies, study]
                              )}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="pointer-events-none"
                                />
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{study.pesakit.nama}</div>
                                  <div className="text-muted-foreground text-xs">
                                    {study.pesakit.mrn || study.pesakit.nric}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div>{new Date(study.tarikh).toLocaleDateString('en-MY')}</div>
                                  {study.study_time && (
                                    <div className="text-muted-foreground">{study.study_time}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  {study.exam_details && study.exam_details.length > 0 ? (
                                    <div>
                                      <div className="font-medium text-blue-600">
                                        {study.exam_details.length} exam{study.exam_details.length > 1 ? 's' : ''}
                                      </div>
                                      <div className="text-muted-foreground text-xs">
                                        {study.exam_details.slice(0, 2).map((exam, idx) => (
                                          <div key={idx}>
                                            {exam.exam_name}
                                            {exam.body_part && ` (${exam.body_part})`}
                                            {exam.laterality && ` - ${exam.laterality}`}
                                          </div>
                                        ))}
                                        {study.exam_details.length > 2 && (
                                          <div>+{study.exam_details.length - 2} more</div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-muted-foreground">No details</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-center">
                                  <div>~{study.image_count || 0}</div>
                                  {study.modality && (
                                    <Badge variant="outline" className="text-xs">
                                      {study.modality}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-center font-medium">
                                  {Math.round(study.estimated_size_mb || 0)}MB
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-mono text-xs">
                                  {study.parent_accession_number}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      </div>
    </ProtectedRoute>
  );
}