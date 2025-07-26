'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AuthService from '@/lib/auth';
import { Calendar, Clock, User, Hospital, Search, Filter, Download, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

import type { GroupedMWLEntry, GroupedMWLResponse } from '@/types/exam';

export default function GroupedMwlPage() {
  const { user } = useAuth();
  const [mwlEntries, setMwlEntries] = useState<GroupedMWLEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStudies, setExpandedStudies] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    modality: '',
    priority: '',
    status: ''
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchMwlEntries = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.date) params.append('date', filters.date);
      if (filters.modality) params.append('modality', filters.modality);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.status) params.append('status', filters.status);

      const res = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/mwl/grouped/?${params}`
      );
      
      if (res.ok) {
        const data: GroupedMWLResponse = await res.json();
        setMwlEntries(data.results || []);
      } else {
        console.error('Failed to fetch MWL entries');
      }
    } catch (error) {
      console.error('Error fetching MWL entries:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMwlEntries();
  }, [filters]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMwlEntries();
  };

  const toggleStudyExpansion = (studyId: number) => {
    setExpandedStudies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studyId)) {
        newSet.delete(studyId);
      } else {
        newSet.add(studyId);
      }
      return newSet;
    });
  };

  const handleExport = () => {
    // Export to CSV for CR machine compatibility
    const csvData: any[] = [];
    
    mwlEntries.forEach(study => {
      // Add parent study entry
      csvData.push({
        'Type': 'STUDY',
        'Patient Name': study.patient_name,
        'Patient ID': study.patient_id,
        'Study Instance UID': study.study_instance_uid,
        'Accession Number': study.parent_accession_number,
        'Study Description': study.study_description || '',
        'Scheduled Date': study.scheduled_datetime || study.tarikh,
        'Priority': study.study_priority,
        'Modality': study.modality || '',
        'Status': study.study_status,
        'Gender': study.patient_gender,
        'DOB': study.patient_birth_date || '',
        'Referring Physician': study.referring_physician || '',
        'Examinations Count': study.examinations.length
      });

      // Add child examination entries
      study.examinations.forEach(exam => {
        csvData.push({
          'Type': 'EXAMINATION',
          'Patient Name': study.patient_name,
          'Patient ID': study.patient_id,
          'Study Instance UID': study.study_instance_uid,
          'Accession Number': exam.accession_number,
          'Study Description': exam.exam_description,
          'Scheduled Date': study.scheduled_datetime || study.tarikh,
          'Priority': study.study_priority,
          'Modality': study.modality || '',
          'Status': exam.exam_status,
          'Gender': study.patient_gender,
          'DOB': study.patient_birth_date || '',
          'Body Part': exam.body_part || '',
          'Patient Position': exam.patient_position || '',
          'Body Position': exam.body_position || '',
          'Laterality': exam.laterality || '',
          'Sequence': exam.sequence_number,
          'Notes': exam.catatan || ''
        });
      });
    });

    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grouped-mwl-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      'STAT': 'destructive',
      'HIGH': 'default',
      'MEDIUM': 'secondary',
      'LOW': 'outline'
    };
    return colors[priority as keyof typeof colors] || 'outline';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      'SCHEDULED': 'outline',
      'IN_PROGRESS': 'default',
      'COMPLETED': 'secondary',
      'CANCELLED': 'destructive'
    };
    return colors[status as keyof typeof colors] || 'outline';
  };

  const formatDateTime = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Grouped MWL Worklist</h1>
          <p className="text-muted-foreground">Manage Modality Worklist with parent-child study structure</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleExport} disabled={mwlEntries.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({...filters, date: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <Label>Modality</Label>
              <Select value={filters.modality} onValueChange={(value) => setFilters({...filters, modality: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="All modalities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="XR">X-Ray</SelectItem>
                  <SelectItem value="CR">CR</SelectItem>
                  <SelectItem value="DR">DR</SelectItem>
                  <SelectItem value="CT">CT</SelectItem>
                  <SelectItem value="MRI">MRI</SelectItem>
                  <SelectItem value="US">Ultrasound</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={filters.priority} onValueChange={(value) => setFilters({...filters, priority: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="STAT">STAT</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters({...filters, status: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MWL Table with Parent-Child Structure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Grouped Worklist Entries ({mwlEntries.length} studies)
          </CardTitle>
          <CardDescription>
            Click on a study to expand and view individual examinations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Study ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Examinations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mwlEntries.map((study) => (
                <>
                  {/* Parent Study Row */}
                  <TableRow 
                    key={study.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleStudyExpansion(study.id)}
                  >
                    <TableCell>
                      {expandedStudies.has(study.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{study.patient_name}</div>
                        <div className="text-sm text-muted-foreground">{study.patient_id}</div>
                        <div className="text-sm">{study.patient_gender}, {study.patient_birth_date}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm">
                        <div className="font-semibold">{study.parent_accession_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {study.study_instance_uid.substring(0, 8)}...
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{study.study_description}</div>
                        {study.referring_physician && (
                          <div className="text-sm text-muted-foreground">
                            Dr. {study.referring_physician}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{study.modality}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-sm">
                          {formatDateTime(study.scheduled_datetime || study.tarikh)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityColor(study.study_priority)}>
                        {study.study_priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(study.study_status)}>
                        {study.study_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {study.examinations.length} exam{study.examinations.length !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {/* Child Examination Rows */}
                  {expandedStudies.has(study.id) && study.examinations.map((exam, examIndex) => (
                    <TableRow key={`${study.id}-${examIndex}`} className="bg-muted/20">
                      <TableCell></TableCell>
                      <TableCell className="pl-8">
                        <div className="text-sm text-muted-foreground">
                          Examination {exam.sequence_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">
                          <div>{exam.accession_number}</div>
                          <div className="text-xs text-muted-foreground">
                            Step: {exam.scheduled_step_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{exam.exam_description}</div>
                          {exam.exam_short_desc && (
                            <div className="text-sm text-muted-foreground">
                              {exam.exam_short_desc}
                            </div>
                          )}
                          {exam.body_part && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {exam.body_part}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {exam.patient_position && (
                            <Badge variant="outline" className="text-xs">
                              {exam.patient_position}
                            </Badge>
                          )}
                          {exam.body_position && (
                            <Badge variant="outline" className="text-xs">
                              {exam.body_position}
                            </Badge>
                          )}
                          {exam.laterality && (
                            <Badge variant="outline" className="text-xs">
                              {exam.laterality}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(exam.exam_status)}>
                          {exam.exam_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exam.catatan && (
                          <div className="text-sm text-muted-foreground" title={exam.catatan}>
                            📝 {exam.catatan.substring(0, 30)}
                            {exam.catatan.length > 30 && '...'}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
              {mwlEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No worklist entries found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}