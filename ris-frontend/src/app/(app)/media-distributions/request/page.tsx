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
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { StudySelector } from '@/components/media-distribution/StudySelector';
import { 
  MediaRequestFormData, 
  StudyForMediaDistribution, 
  MEDIA_TYPE_CONFIG, 
  URGENCY_CONFIG 
} from '@/types/media-distribution';
import { MediaDistributionAPI } from '@/lib/media-distribution';
import { toast } from '@/lib/toast';

export default function MediaRequestPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState<MediaRequestFormData>({
    patient_search: '',
    selected_study: undefined,
    media_type: 'CD',
    quantity: 1,
    urgency: 'NORMAL',
    comments: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleStudySelect = (study: StudyForMediaDistribution | undefined) => {
    setFormData(prev => ({
      ...prev,
      selected_study: study
    }));
    
    // Clear patient search error if study is selected
    if (study && errors.selected_study) {
      setErrors(prev => ({ ...prev, selected_study: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.selected_study) {
      newErrors.selected_study = 'Please select a patient study';
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
      const request = {
        daftar_id: formData.selected_study!.id,
        media_type: formData.media_type,
        quantity: formData.quantity,
        urgency: formData.urgency,
        comments: formData.comments || undefined
      };

      await MediaDistributionAPI.createMediaDistribution(request);
      
      toast.success('Media distribution request created successfully');
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
      selected_study: undefined,
      media_type: 'CD',
      quantity: 1,
      urgency: 'NORMAL',
      comments: ''
    });
    setErrors({});
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

        <div className="max-w-2xl">
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
                  selectedStudy={formData.selected_study}
                  onStudySelect={handleStudySelect}
                  disabled={isSubmitting}
                />
                {errors.selected_study && (
                  <p className="text-sm text-red-600 mt-2">{errors.selected_study}</p>
                )}
              </CardContent>
            </Card>

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
                      onValueChange={(value: any) => setFormData(prev => ({ ...prev, media_type: value }))}
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
                disabled={isSubmitting || !formData.selected_study}
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
      </div>
    </ProtectedRoute>
  );
}