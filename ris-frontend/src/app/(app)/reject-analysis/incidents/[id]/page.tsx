'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Trash2, AlertTriangle, Calendar, User, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useRejectIncidents } from '@/hooks/useRejectIncidents';
import { SEVERITY_CONFIG } from '@/types/reject-analysis';
import type { RejectIncident } from '@/types/reject-analysis';

export default function RejectIncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { fetchIncident, deleteIncident, loading } = useRejectIncidents();
  const [incident, setIncident] = useState<RejectIncident | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incidentId = params?.id ? parseInt(params.id as string) : null;

  useEffect(() => {
    if (incidentId) {
      loadIncident();
    }
  }, [incidentId]);

  const loadIncident = async () => {
    if (!incidentId) return;
    
    try {
      const data = await fetchIncident(incidentId);
      setIncident(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incident');
    }
  };

  const handleDelete = async () => {
    if (!incident) return;
    
    if (confirm('Are you sure you want to delete this incident? This action cannot be undone.')) {
      try {
        await deleteIncident(incident.id);
        router.push('/reject-analysis/incidents');
      } catch (error) {
        console.error('Failed to delete incident:', error);
      }
    }
  };

  if (loading && !incident) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error || 'Incident not found'}</p>
          <Link href="/reject-analysis/incidents">
            <Button variant="outline" className="mt-2">
              Back to Incidents
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/reject-analysis/incidents">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Incidents
            </Button>
          </Link>
          
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Incident Details</h1>
            <p className="text-muted-foreground">
              Reject incident #{incident.id}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Link href={`/reject-analysis/incidents/${incident.id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient & Exam Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Examination Details
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Patient Name</label>
                  <div className="text-lg font-medium">{incident.patient_name}</div>
                </div>
                
                {incident.patient_mrn && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">MRN</label>
                    <div className="text-lg font-medium">{incident.patient_mrn}</div>
                  </div>
                )}
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Accession Number</label>
                  <div className="text-lg font-medium">{incident.accession_number}</div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Study Instance UID</label>
                  <div className="text-sm font-mono bg-muted p-2 rounded break-all">
                    {incident.study_instance_uid}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Exam Date</label>
                  <div className="text-lg font-medium">
                    {new Date(incident.exam_date).toLocaleDateString()}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Modality</label>
                  <div className="text-lg font-medium">
                    <Badge variant="outline">{incident.modality}</Badge>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Exam Description</label>
                <div className="text-lg font-medium">{incident.exam_description}</div>
              </div>
            </CardContent>
          </Card>

          {/* Reject Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Reject Information
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-medium">{incident.category.nama_english}</div>
                    {incident.category.color_code && (
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: incident.category.color_code }}
                      />
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Malay: {incident.category.nama}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Severity</label>
                  <div>
                    <Badge className={SEVERITY_CONFIG[incident.severity].color}>
                      {SEVERITY_CONFIG[incident.severity].label}
                    </Badge>
                  </div>
                </div>
                
                {incident.subcategory && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Subcategory</label>
                    <div className="text-lg font-medium">{incident.subcategory}</div>
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Reason (English)</label>
                <div className="p-3 bg-muted rounded-md">{incident.reason_detail_english}</div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Reason (Malay)</label>
                <div className="p-3 bg-muted rounded-md">{incident.reason_detail}</div>
              </div>
            </CardContent>
          </Card>

          {/* Corrective Actions */}
          {(incident.corrective_action || incident.corrective_action_english) && (
            <Card>
              <CardHeader>
                <CardTitle>Corrective Actions</CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {incident.corrective_action_english && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Action Taken (English)</label>
                    <div className="p-3 bg-muted rounded-md">{incident.corrective_action_english}</div>
                  </div>
                )}
                
                {incident.corrective_action && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Action Taken (Malay)</label>
                    <div className="p-3 bg-muted rounded-md">{incident.corrective_action}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Retake Performed</label>
                <div className="flex items-center gap-2">
                  <Badge variant={incident.retake_performed ? 'default' : 'secondary'}>
                    {incident.retake_performed ? 'Yes' : 'No'}
                  </Badge>
                  {incident.retake_date && (
                    <span className="text-sm text-muted-foreground">
                      on {new Date(incident.retake_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Follow-up Required</label>
                <div>
                  <Badge variant={incident.follow_up_required ? 'destructive' : 'default'}>
                    {incident.follow_up_required ? 'Required' : 'Not Required'}
                  </Badge>
                </div>
              </div>
              
              {incident.follow_up_required && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Follow-up Status</label>
                  <div>
                    <Badge variant={incident.follow_up_completed ? 'default' : 'destructive'}>
                      {incident.follow_up_completed ? 'Completed' : 'Pending'}
                    </Badge>
                    {incident.follow_up_date && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Completed: {new Date(incident.follow_up_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                  <div>
                    <div className="text-sm font-medium">Incident Occurred</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(incident.incident_date).toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                  <div>
                    <div className="text-sm font-medium">Incident Reported</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(incident.created).toLocaleString()}
                    </div>
                  </div>
                </div>
                
                {incident.retake_performed && incident.retake_date && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2" />
                    <div>
                      <div className="text-sm font-medium">Retake Performed</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(incident.retake_date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
                
                {incident.follow_up_completed && incident.follow_up_date && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
                    <div>
                      <div className="text-sm font-medium">Follow-up Completed</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(incident.follow_up_date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reporter Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Reported By
              </CardTitle>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-2">
                <div className="text-lg font-medium">
                  {incident.reported_by.first_name} {incident.reported_by.last_name}
                </div>
                <div className="text-sm text-muted-foreground">
                  Username: {incident.reported_by.username}
                </div>
                <div className="text-sm text-muted-foreground">
                  User ID: {incident.reported_by.id}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Created:</span>
                  <div className="text-muted-foreground">
                    {new Date(incident.created).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Last Modified:</span>
                  <div className="text-muted-foreground">
                    {new Date(incident.modified).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="font-medium">Incident ID:</span>
                  <div className="text-muted-foreground">#{incident.id}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}