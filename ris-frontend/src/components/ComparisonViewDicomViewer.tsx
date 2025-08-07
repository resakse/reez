'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Split, Eye, EyeOff, ArrowLeftRight, 
  Maximize2, Minimize2, RotateCcw
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getStudyMetadata, getStudyImageIds } from '@/lib/orthanc';
import { toast } from '@/lib/toast';

const SimpleDicomViewer = dynamic(() => import('@/components/SimpleDicomViewer'), {
  ssr: false
});

const ProjectionDicomViewer = dynamic(() => import('@/components/ProjectionDicomViewer'), {
  ssr: false
});

interface StudyData {
  metadata: any;
  imageIds: string[];
  seriesInfo: any[];
}

interface ComparisonViewProps {
  initialStudyUID: string;
  pacsServerId?: string | null;
  className?: string;
}

const ComparisonViewDicomViewer: React.FC<ComparisonViewProps> = ({
  initialStudyUID,
  pacsServerId,
  className = ''
}) => {
  const [leftStudyUID, setLeftStudyUID] = useState(initialStudyUID);
  const [rightStudyUID, setRightStudyUID] = useState('');
  const [leftStudyData, setLeftStudyData] = useState<StudyData | null>(null);
  const [rightStudyData, setRightStudyData] = useState<StudyData | null>(null);
  const [leftSeriesUID, setLeftSeriesUID] = useState<string>('');
  const [rightSeriesUID, setRightSeriesUID] = useState<string>('');
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<'left' | 'right'>('left');
  const [availableStudies, setAvailableStudies] = useState<Array<{
    StudyInstanceUID: string;
    StudyDescription: string;
    PatientName: string;
    StudyDate: string;
  }>>([]);

  // Load available studies for comparison
  useEffect(() => {
    const fetchAvailableStudies = async () => {
      try {
        const pacsParam = pacsServerId ? `?pacs_server_id=${pacsServerId}` : '';
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${pacsParam}`, 
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          }
        );
        
        if (response.ok) {
          const studies = await response.json();
          setAvailableStudies(studies.slice(0, 50)); // Limit for performance
        }
      } catch (error) {
        console.error('Failed to fetch available studies:', error);
      }
    };

    fetchAvailableStudies();
  }, [pacsServerId]);

  const loadStudyData = useCallback(async (studyUID: string): Promise<StudyData | null> => {
    try {
      // Fetch study metadata
      const metadata = await getStudyMetadata(studyUID, pacsServerId);
      
      // Fetch series information
      const pacsParam = pacsServerId ? `?pacs_server_id=${pacsServerId}` : '';
      const seriesResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUID}/series/${pacsParam}`, 
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      if (!seriesResponse.ok) {
        throw new Error(`Failed to fetch series: ${seriesResponse.status}`);
      }

      const seriesData = await seriesResponse.json();
      const seriesInfo = seriesData.series || [];

      // Get image IDs for the first series
      let imageIds: string[] = [];
      if (seriesInfo.length > 0) {
        const firstSeries = seriesInfo[0];
        imageIds = await getStudyImageIds(studyUID, pacsServerId, firstSeries.SeriesInstanceUID);
      }

      return {
        metadata,
        imageIds,
        seriesInfo
      };
    } catch (error) {
      console.error('Failed to load study data:', error);
      toast.error(`Failed to load study: ${error.message}`);
      return null;
    }
  }, [pacsServerId]);

  // Load left study data
  useEffect(() => {
    if (leftStudyUID) {
      setLeftLoading(true);
      loadStudyData(leftStudyUID).then(data => {
        setLeftStudyData(data);
        if (data?.seriesInfo.length > 0) {
          setLeftSeriesUID(data.seriesInfo[0].SeriesInstanceUID);
        }
        setLeftLoading(false);
      });
    }
  }, [leftStudyUID, loadStudyData]);

  // Load right study data
  useEffect(() => {
    if (rightStudyUID) {
      setRightLoading(true);
      loadStudyData(rightStudyUID).then(data => {
        setRightStudyData(data);
        if (data?.seriesInfo.length > 0) {
          setRightSeriesUID(data.seriesInfo[0].SeriesInstanceUID);
        }
        setRightLoading(false);
      });
    }
  }, [rightStudyUID, loadStudyData]);

  const handleSeriesChange = useCallback(async (panel: 'left' | 'right', seriesUID: string) => {
    const studyUID = panel === 'left' ? leftStudyUID : rightStudyUID;
    const setSeriesUID = panel === 'left' ? setLeftSeriesUID : setRightSeriesUID;
    const setStudyData = panel === 'left' ? setLeftStudyData : setRightStudyData;
    
    setSeriesUID(seriesUID);
    
    try {
      const imageIds = await getStudyImageIds(studyUID, pacsServerId, seriesUID);
      const currentData = panel === 'left' ? leftStudyData : rightStudyData;
      
      if (currentData) {
        setStudyData({
          ...currentData,
          imageIds
        });
      }
    } catch (error) {
      console.error('Failed to load series images:', error);
      toast.error('Failed to load series images');
    }
  }, [leftStudyUID, rightStudyUID, leftStudyData, rightStudyData, pacsServerId]);

  const swapStudies = () => {
    const tempUID = leftStudyUID;
    const tempData = leftStudyData;
    const tempSeries = leftSeriesUID;
    
    setLeftStudyUID(rightStudyUID);
    setLeftStudyData(rightStudyData);
    setLeftSeriesUID(rightSeriesUID);
    
    setRightStudyUID(tempUID);
    setRightStudyData(tempData);
    setRightSeriesUID(tempSeries);
  };

  const getViewerComponent = (studyData: StudyData | null, loading: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading study...</p>
          </div>
        </div>
      );
    }

    if (!studyData || !studyData.imageIds.length) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">No study loaded</p>
        </div>
      );
    }

    const isXRay = studyData.metadata?.Modality === 'CR' || 
                   studyData.metadata?.Modality === 'DX' ||
                   studyData.seriesInfo.some(s => s.Modality === 'CR' || s.Modality === 'DX');

    const ViewerComponent = isXRay ? ProjectionDicomViewer : SimpleDicomViewer;

    return (
      <ViewerComponent
        imageIds={studyData.imageIds}
        studyMetadata={{
          patientName: studyData.metadata.PatientName || 'Unknown',
          patientId: studyData.metadata.PatientID || 'Unknown',
          studyDate: studyData.metadata.StudyDate || '',
          studyDescription: studyData.metadata.StudyDescription || '',
          modality: studyData.metadata.Modality || 'Unknown',
          studyInstanceUID: studyData.metadata.StudyInstanceUID
        }}
        pacsServerId={pacsServerId}
        seriesInfo={studyData.seriesInfo}
        showOverlay={true}
        hideToolbar={false}
      />
    );
  };

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Comparison toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Comparison View:</span>
          <Button
            variant={layout === 'horizontal' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLayout('horizontal')}
            title="Horizontal split"
            className="px-2"
          >
            <Split className="h-4 w-4" />
          </Button>
          <Button
            variant={layout === 'vertical' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setLayout('vertical')}
            title="Vertical split"
            className="px-2"
          >
            <Split className="h-4 w-4 rotate-90" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={swapStudies}
            title="Swap studies"
            className="px-2"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <Button
            variant={syncEnabled ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSyncEnabled(!syncEnabled)}
            title="Sync viewport actions"
            className="px-2"
          >
            {syncEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Study selection */}
      <div className="flex items-center gap-4 p-2 bg-muted/20 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Left:</span>
          <Select value={leftStudyUID} onValueChange={setLeftStudyUID}>
            <SelectTrigger className="w-64 h-8 text-xs">
              <SelectValue placeholder="Select study..." />
            </SelectTrigger>
            <SelectContent>
              {availableStudies.map((study) => (
                <SelectItem key={study.StudyInstanceUID} value={study.StudyInstanceUID}>
                  {study.PatientName} - {study.StudyDescription} ({study.StudyDate})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {leftStudyData?.seriesInfo.length > 1 && (
            <Select value={leftSeriesUID} onValueChange={(value) => handleSeriesChange('left', value)}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="Select series..." />
              </SelectTrigger>
              <SelectContent>
                {leftStudyData.seriesInfo.map((series) => (
                  <SelectItem key={series.SeriesInstanceUID} value={series.SeriesInstanceUID}>
                    {series.SeriesDescription} ({series.NumberOfSeriesRelatedInstances} images)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Right:</span>
          <Select value={rightStudyUID} onValueChange={setRightStudyUID}>
            <SelectTrigger className="w-64 h-8 text-xs">
              <SelectValue placeholder="Select study..." />
            </SelectTrigger>
            <SelectContent>
              {availableStudies.map((study) => (
                <SelectItem key={study.StudyInstanceUID} value={study.StudyInstanceUID}>
                  {study.PatientName} - {study.StudyDescription} ({study.StudyDate})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rightStudyData?.seriesInfo.length > 1 && (
            <Select value={rightSeriesUID} onValueChange={(value) => handleSeriesChange('right', value)}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="Select series..." />
              </SelectTrigger>
              <SelectContent>
                {rightStudyData.seriesInfo.map((series) => (
                  <SelectItem key={series.SeriesInstanceUID} value={series.SeriesInstanceUID}>
                    {series.SeriesDescription} ({series.NumberOfSeriesRelatedInstances} images)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Comparison view */}
      <div className="flex-1 p-1">
        <div 
          className={`grid gap-1 h-full ${
            layout === 'horizontal' ? 'grid-cols-2 grid-rows-1' : 'grid-cols-1 grid-rows-2'
          }`}
        >
          {/* Left/Top panel */}
          <Card 
            className={`relative overflow-hidden transition-all duration-200 ${
              activePanel === 'left' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setActivePanel('left')}
          >
            <CardContent className="p-0 h-full">
              {getViewerComponent(leftStudyData, leftLoading)}
            </CardContent>
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              Left Study
              {leftStudyData && (
                <div className="text-[10px] opacity-75 mt-0.5">
                  {leftStudyData.metadata.PatientName}
                </div>
              )}
            </div>
          </Card>

          {/* Right/Bottom panel */}
          <Card 
            className={`relative overflow-hidden transition-all duration-200 ${
              activePanel === 'right' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setActivePanel('right')}
          >
            <CardContent className="p-0 h-full">
              {getViewerComponent(rightStudyData, rightLoading)}
            </CardContent>
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              Right Study
              {rightStudyData && (
                <div className="text-[10px] opacity-75 mt-0.5">
                  {rightStudyData.metadata.PatientName}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div>
          Layout: {layout} | Sync: {syncEnabled ? 'On' : 'Off'}
        </div>
        <div>
          Active: {activePanel} panel
        </div>
      </div>
    </div>
  );
};

export default ComparisonViewDicomViewer;