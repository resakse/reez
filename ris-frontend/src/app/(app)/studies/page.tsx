'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StudyBrowser from '@/components/StudyBrowser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, FileImage, TrendingUp, Calendar,
  Eye, Download, Share, Settings 
} from 'lucide-react';
import { fetchStudies } from '@/lib/studies';

const StudiesPage: React.FC = () => {
  const router = useRouter();
  const [selectedStudy, setSelectedStudy] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalStudies: 0,
    todayStudies: 0,
    pendingReports: 0,
    completedReports: 0
  });

  // Fetch real statistics from backend
  useEffect(() => {
    const loadStats = async () => {
      try {
        const studies = await fetchStudies();
        const today = new Date().toISOString().split('T')[0];
        
        const todayStudies = studies.filter(study => study.studyDate === today);
        
        setStats({
          totalStudies: studies.length,
          todayStudies: todayStudies.length,
          pendingReports: Math.floor(studies.length * 0.1), // Estimate - would need backend endpoint
          completedReports: Math.floor(studies.length * 0.9) // Estimate - would need backend endpoint
        });
      } catch (error) {
        console.error('Error loading statistics:', error);
      }
    };

    loadStats();
  }, []);

  const handleStudySelect = (studyInstanceUID: string) => {
    setSelectedStudy(studyInstanceUID);
  };

  const handleViewStudy = (studyInstanceUID: string) => {
    router.push(`/viewer/${encodeURIComponent(studyInstanceUID)}`);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Studies</h1>
          <p className="text-muted-foreground">
            Browse and view DICOM studies from the PACS archive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            Settings
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Studies</CardTitle>
            <FileImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudies}</div>
            <p className="text-xs text-muted-foreground">
              All studies in PACS
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Studies</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayStudies}</div>
            <p className="text-xs text-muted-foreground">
              Studies acquired today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pendingReports}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting radiologist review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completedReports}</div>
            <p className="text-xs text-muted-foreground">
              Reports finalized
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Study Browser */}
        <div className="lg:col-span-2">
          <StudyBrowser 
            onStudySelect={handleStudySelect}
            showViewerButton={true}
          />
        </div>

        {/* Study Details Sidebar */}
        <div className="space-y-4">
          {selectedStudy ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Study Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Study Instance UID</p>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {selectedStudy}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleViewStudy(selectedStudy)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View in DICOM Viewer
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1">
                    <Share className="h-3 w-3 mr-1" />
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Study Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-8">
                  <FileImage className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Select a study to view details</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => router.push('/register')}
              >
                <Activity className="h-4 w-4 mr-2" />
                Register New Patient
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => router.push('/mwl')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                View Worklist
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => router.push('/patients')}
              >
                <FileImage className="h-4 w-4 mr-2" />
                Patient Directory
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">XR</Badge>
                  <span className="text-muted-foreground">Ahmad Bin Abdullah - Chest X-Ray</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">CT</Badge>
                  <span className="text-muted-foreground">Siti Nurhaliza - Abdominal CT</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">MR</Badge>
                  <span className="text-muted-foreground">Tan Wei Ming - Lumbar MRI</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudiesPage;