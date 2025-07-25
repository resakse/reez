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
import { Calendar, Clock, User, Hospital, Search, Filter, Download, RefreshCw } from 'lucide-react';

interface MwlEntry {
  id: number;
  patient: {
    id: number;
    nama: string;
    no_kp: string;
    t_lahir: string;
    jantina: string;
  };
  study_instance_uid: string;
  accession_number: string;
  scheduled_datetime: string;
  study_priority: string;
  requested_procedure_description: string;
  patient_position: string;
  modality: string;
  status: string;
  registration: {
    id: number;
    discipline: {
      id: number;
      nama: string;
    };
    doctor: string;
    clinical_notes: string;
  };
}

export default function MwlPage() {
  const { user } = useAuth();
  const [mwlEntries, setMwlEntries] = useState<MwlEntry[]>([]);
  const [loading, setLoading] = useState(true);
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/mwl-worklist/?${params}`
      );
      
      if (res.ok) {
        const data = await res.json();
        setMwlEntries(data.results || data);
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

  const handleExport = () => {
    // Export to CSV for CR machine compatibility
    const csvData = mwlEntries.map(entry => ({
      'Patient Name': entry.patient.nama,
      'Patient ID': entry.patient.no_kp,
      'Study Instance UID': entry.study_instance_uid,
      'Accession Number': entry.accession_number,
      'Scheduled Date': entry.scheduled_datetime,
      'Priority': entry.study_priority,
      'Procedure': entry.requested_procedure_description,
      'Modality': entry.modality,
      'Position': entry.patient_position,
      'Gender': entry.patient.jantina,
      'DOB': entry.patient.t_lahir
    }));

    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mwl-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      'STAT': 'destructive',
      'HIGH': 'warning',
      'MEDIUM': 'secondary',
      'ROUTINE': 'default'
    };
    return colors[priority as keyof typeof colors] || 'default';
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
          <h1 className="text-3xl font-bold tracking-tight">MWL Worklist Management</h1>
          <p className="text-muted-foreground">Manage Modality Worklist for CR machine integration</p>
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
                  <SelectItem value="ROUTINE">Routine</SelectItem>
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

      {/* MWL Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Worklist Entries ({mwlEntries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Study UID</TableHead>
                <TableHead>Accession #</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Referring</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mwlEntries.map((entry, index) => (
                <TableRow key={entry.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.patient.nama}</div>
                      <div className="text-sm text-muted-foreground">{entry.patient.no_kp}</div>
                      <div className="text-sm">{entry.patient.jantina}, {entry.patient.t_lahir}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.study_instance_uid.substring(0, 8)}...
                  </TableCell>
                  <TableCell className="font-mono text-sm">{entry.accession_number}</TableCell>
                  <TableCell>{entry.requested_procedure_description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.modality}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDateTime(entry.scheduled_datetime)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityColor(entry.study_priority)}>{entry.study_priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={entry.status === 'COMPLETED' ? 'default' : 
                               entry.status === 'IN_PROGRESS' ? 'secondary' : 'outline'}
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-sm">{entry.registration.discipline.nama}</div>
                      <div className="text-sm text-muted-foreground">{entry.registration.doctor}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {mwlEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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