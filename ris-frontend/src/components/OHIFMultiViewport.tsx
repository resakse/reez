'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Grid2x2, Grid3x3, LayoutGrid, Eye, EyeOff, 
  RotateCcw, FlipHorizontal2, Maximize2, Minimize2,
  Settings, ZoomIn, Move, Ruler, Square, Circle,
  ArrowUpRight, Triangle, Crosshair, Plus, X,
  Layers3, MousePointer2, ScanLine, Link, Unlink, ChevronDown
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import SimpleDicomViewer from './SimpleDicomViewer';
import { getStudyMetadata, getStudyImageIds } from '@/lib/orthanc';
import { toast } from '@/lib/toast';
import AuthService from '@/lib/auth';

interface ViewportData {
  id: string;
  studyUID?: string;
  seriesUID?: string;
  imageIds: string[];
  studyMetadata?: any;
  seriesInfo?: any[];
  seriesData?: any;
  isActive: boolean;
  isLoading: boolean;
  isEmpty: boolean;
  title: string;
}

interface OHIFMultiViewportProps {
  initialStudyUID: string;
  pacsServerId?: string | null;
  availableStudies?: any[];
  className?: string;
}

type LayoutType = '1x1' | '1x2' | '2x1' | '2x2' | '1x3' | '3x1' | '2x3' | '3x2';

const LAYOUT_CONFIGS: Record<LayoutType, {
  name: string;
  icon: React.ReactNode;
  viewports: number;
  gridClass: string;
}> = {
  '1x1': { name: 'Single', icon: <Maximize2 className="h-4 w-4" />, viewports: 1, gridClass: 'grid-cols-1 grid-rows-1' },
  '1x2': { name: '1×2', icon: <Grid2x2 className="h-4 w-4 rotate-90" />, viewports: 2, gridClass: 'grid-cols-2 grid-rows-1' },
  '2x1': { name: '2×1', icon: <Grid2x2 className="h-4 w-4" />, viewports: 2, gridClass: 'grid-cols-1 grid-rows-2' },
  '2x2': { name: '2×2', icon: <Grid2x2 className="h-4 w-4" />, viewports: 4, gridClass: 'grid-cols-2 grid-rows-2' },
  '1x3': { name: '1×3', icon: <Grid3x3 className="h-4 w-4 rotate-90" />, viewports: 3, gridClass: 'grid-cols-3 grid-rows-1' },
  '3x1': { name: '3×1', icon: <Grid3x3 className="h-4 w-4" />, viewports: 3, gridClass: 'grid-cols-1 grid-rows-3' },
  '2x3': { name: '2×3', icon: <LayoutGrid className="h-4 w-4" />, viewports: 6, gridClass: 'grid-cols-3 grid-rows-2' },
  '3x2': { name: '3×2', icon: <LayoutGrid className="h-4 w-4 rotate-90" />, viewports: 6, gridClass: 'grid-cols-2 grid-rows-3' }
};

const OHIFMultiViewport: React.FC<OHIFMultiViewportProps> = ({
  initialStudyUID,
  pacsServerId,
  availableStudies = [],
  className = ''
}) => {
  const [layout, setLayout] = useState<LayoutType>('2x2');
  const [viewports, setViewports] = useState<ViewportData[]>([]);
  const [activeViewportId, setActiveViewportId] = useState<string>('viewport-0');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [availableSeries, setAvailableSeries] = useState<any[]>([]);
  const [allStudies, setAllStudies] = useState<any[]>([]);

  // Define loadStudyInViewport function early to avoid circular dependency
  const loadStudyInViewport = useCallback(async (viewportId: string, studyUID: string, seriesUID?: string) => {
    // Set loading state
    setViewports(prev => prev.map(vp => 
      vp.id === viewportId 
        ? { ...vp, isLoading: true, isEmpty: false }
        : vp
    ));

    try {
      // Fetch study metadata
      const metadata = await getStudyMetadata(studyUID, pacsServerId);
      
      // Fetch series information
      const pacsParam = pacsServerId ? `?pacs_server_id=${pacsServerId}` : '';
      const seriesUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUID}/series/${pacsParam}`;
      const seriesResponse = await AuthService.authenticatedFetch(seriesUrl);

      if (!seriesResponse.ok) {
        throw new Error(`Failed to fetch series: ${seriesResponse.status}`);
      }

      const seriesData = await seriesResponse.json();
      const seriesInfo = seriesData.series || [];

      // Use specified series or first available series
      const targetSeries = seriesUID 
        ? seriesInfo.find(s => s.SeriesInstanceUID === seriesUID)
        : seriesInfo[0];

      if (!targetSeries) {
        throw new Error('No series available');
      }

      // Get image IDs for the series
      const imageIds = await getStudyImageIds(studyUID, pacsServerId, targetSeries.SeriesInstanceUID);

      console.log('OHIFMultiViewport: Loaded study', {
        studyUID,
        seriesUID: targetSeries.SeriesInstanceUID,
        imageCount: imageIds.length,
        viewportId
      });

      // Update viewport with loaded data
      setViewports(prev => prev.map(vp => 
        vp.id === viewportId 
          ? {
              ...vp,
              studyUID,
              seriesUID: targetSeries.SeriesInstanceUID,
              imageIds,
              studyMetadata: {
                patientName: metadata.PatientName || 'Unknown',
                patientId: metadata.PatientID || 'Unknown',
                studyDate: metadata.StudyDate || '',
                studyDescription: metadata.StudyDescription || '',
                modality: metadata.Modality || 'Unknown',
                studyInstanceUID: studyUID
              },
              seriesInfo,
              seriesData: targetSeries,
              isLoading: false,
              isEmpty: false
            }
          : vp
      ));

      // Update available series for dropdown
      if (viewportId === activeViewportId) {
        setAvailableSeries(seriesInfo);
      }

    } catch (error) {
      console.error('Failed to load study:', error);
      toast.error(`Failed to load study: ${error.message}`);
      
      // Set error state
      setViewports(prev => prev.map(vp => 
        vp.id === viewportId 
          ? { ...vp, isLoading: false, isEmpty: true }
          : vp
      ));
    }
  }, [pacsServerId, activeViewportId]);

  // Initialize viewports on mount only
  useEffect(() => {
    const layoutConfig = LAYOUT_CONFIGS[layout];
    const newViewports: ViewportData[] = [];
    
    for (let i = 0; i < layoutConfig.viewports; i++) {
      const existingViewport = viewports[i];
      newViewports.push({
        id: `viewport-${i}`,
        studyUID: existingViewport?.studyUID,
        seriesUID: existingViewport?.seriesUID,
        imageIds: existingViewport?.imageIds || [],
        studyMetadata: existingViewport?.studyMetadata,
        seriesInfo: existingViewport?.seriesInfo || [],
        isActive: i === 0,
        isLoading: existingViewport?.isLoading || false,
        isEmpty: existingViewport ? existingViewport.isEmpty : true,
        title: `Viewport ${i + 1}`
      });
    }
    
    setViewports(newViewports);
    setActiveViewportId('viewport-0');
  }, [layout]);

  // Initialize empty viewports on mount
  useEffect(() => {
    if (viewports.length === 0) {
      const initialViewports: ViewportData[] = [{
        id: 'viewport-0',
        imageIds: [],
        isActive: true,
        isLoading: true,
        isEmpty: false,
        title: 'Viewport 1'
      }];
      setViewports(initialViewports);
      setActiveViewportId('viewport-0');
      
      // Load initial study
      if (initialStudyUID) {
        loadStudyInViewport('viewport-0', initialStudyUID);
      }
    }
  }, []);

  // Load initial study in first viewport
  useEffect(() => {
    if (initialStudyUID && viewports.length > 0) {
      // Always load the initial study if the first viewport is empty or doesn't have this study
      const firstViewport = viewports[0];
      if (firstViewport && (firstViewport.isEmpty || firstViewport.studyUID !== initialStudyUID)) {
        console.log('Loading initial study:', initialStudyUID);
        loadStudyInViewport('viewport-0', initialStudyUID);
      }
    }
  }, [initialStudyUID, viewports.length, loadStudyInViewport]);

  // Fetch available studies for selection
  useEffect(() => {
    const fetchStudies = async () => {
      try {
        const searchParams = {
          limit: 100,
          server_ids: pacsServerId ? [parseInt(pacsServerId.toString())] : undefined
        };

        // Remove undefined values
        Object.keys(searchParams).forEach(key => 
          searchParams[key] === undefined && delete searchParams[key]
        );

        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search-multiple/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(searchParams)
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.studies) {
            setAllStudies(data.studies);
          }
        }
      } catch (error) {
        console.error('Failed to fetch studies:', error);
      }
    };

    fetchStudies();
  }, [pacsServerId]);

  const handleViewportClick = useCallback((viewportId: string) => {
    setActiveViewportId(viewportId);
    setViewports(prev => prev.map(vp => ({
      ...vp,
      isActive: vp.id === viewportId
    })));

    // Update available series for the active viewport
    const viewport = viewports.find(vp => vp.id === viewportId);
    if (viewport?.seriesInfo) {
      setAvailableSeries(viewport.seriesInfo);
    }
  }, [viewports]);

  const handleStudyChange = useCallback((studyUID: string) => {
    if (activeViewportId && studyUID) {
      loadStudyInViewport(activeViewportId, studyUID);
    }
  }, [activeViewportId, loadStudyInViewport]);

  const handleSeriesChange = useCallback((seriesUID: string) => {
    const activeViewport = viewports.find(vp => vp.id === activeViewportId);
    if (activeViewport?.studyUID && seriesUID) {
      loadStudyInViewport(activeViewportId, activeViewport.studyUID, seriesUID);
    }
  }, [activeViewportId, viewports, loadStudyInViewport]);

  const clearViewport = useCallback((viewportId: string) => {
    setViewports(prev => prev.map(vp => 
      vp.id === viewportId 
        ? {
            ...vp,
            studyUID: undefined,
            seriesUID: undefined,
            imageIds: [],
            studyMetadata: undefined,
            seriesInfo: [],
            isLoading: false,
            isEmpty: true
          }
        : vp
    ));
  }, []);

  const layoutConfig = LAYOUT_CONFIGS[layout];

  return (
    <div className={`flex h-full bg-black ${className}`}>
      {/* Left Sidebar - Series Thumbnails */}
      <div className="w-48 bg-gray-900 border-r border-gray-700 flex flex-col">
        {/* Series Header */}
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-white text-sm font-medium">Series</h3>
        </div>
        
        {/* Series List */}
        <div className="flex-1 overflow-y-auto">
          {availableSeries.map((series, index) => (
            <div
              key={`series-${series.SeriesInstanceUID}-${index}`}
              className={`p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${
                viewports.find(vp => vp.isActive)?.seriesUID === series.SeriesInstanceUID 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : ''
              }`}
              onClick={() => handleSeriesChange(series.SeriesInstanceUID)}
            >
              {/* Series Thumbnail Placeholder */}
              <div className="w-full aspect-square bg-gray-800 rounded mb-2 flex items-center justify-center">
                <span className="text-gray-400 text-xs">#{index + 1}</span>
              </div>
              
              {/* Series Info */}
              <div className="text-white text-xs">
                <div className="font-medium truncate">
                  {series.SeriesDescription || series.Modality}
                </div>
                <div className="text-gray-400 text-[10px]">
                  {series.NumberOfSeriesRelatedInstances} images
                </div>
              </div>
            </div>
          ))}
          
          {/* Add Study Button */}
          <div className="p-3">
            <Select 
              value="" 
              onValueChange={handleStudyChange}
            >
              <SelectTrigger className="w-full h-8 text-xs bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="+ Add Study" />
              </SelectTrigger>
              <SelectContent>
                {allStudies.map((study, studyIndex) => (
                  <SelectItem key={`study-${study.StudyInstanceUID}-${studyIndex}`} value={study.StudyInstanceUID}>
                    <div className="flex flex-col">
                      <span className="font-medium">{study.PatientName}</span>
                      <span className="text-xs text-muted-foreground">
                        {study.StudyDescription} • {study.StudyDate}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* OHIF-style Toolbar */}
        <div className="bg-gray-800 border-b border-gray-600 px-2 py-1">
          <div className="flex items-center gap-1">
            {/* Layout Grid Icon */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 flex items-center justify-center text-white hover:bg-gray-700 rounded">
                  <Grid3x3 className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-gray-800 border-gray-600 p-2">
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(LAYOUT_CONFIGS) as LayoutType[]).map((layoutType) => (
                    <button
                      key={layoutType}
                      onClick={() => setLayout(layoutType)}
                      className={`w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 ${
                        layout === layoutType ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                      title={LAYOUT_CONFIGS[layoutType].name}
                    >
                      <div className="text-white">{LAYOUT_CONFIGS[layoutType].icon}</div>
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Other toolbar icons */}
            <button 
              onClick={() => setSyncEnabled(!syncEnabled)}
              className={`w-8 h-8 flex items-center justify-center text-white hover:bg-gray-700 rounded ${
                syncEnabled ? 'bg-blue-600' : ''
              }`}
              title="Sync"
            >
              <ScanLine className="h-4 w-4" />
            </button>
            
            <button 
              onClick={() => setLinkEnabled(!linkEnabled)}
              className={`w-8 h-8 flex items-center justify-center text-white hover:bg-gray-700 rounded ${
                linkEnabled ? 'bg-blue-600' : ''
              }`}
              title="Link"
            >
              {linkEnabled ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Viewport Grid */}
        <div className="flex-1 bg-black">
          <div className={`grid ${layoutConfig.gridClass} gap-[1px] bg-gray-800 h-full p-[1px]`}>
            {Array.from({ length: layoutConfig.viewports }, (_, index) => {
              const viewport = viewports[index];
              if (!viewport) return null;

              return (
                <div
                  key={`viewport-${index}-${viewport.id}`}
                  className={`relative overflow-hidden cursor-pointer bg-black transition-all duration-200 ${
                    viewport.isActive 
                      ? 'ring-2 ring-blue-400' 
                      : 'hover:ring-1 hover:ring-gray-500'
                  }`}
                  onClick={() => handleViewportClick(viewport.id)}
                >
                  {/* Viewport Content */}
                  {viewport.isEmpty ? (
                    // Empty viewport
                    <div className="flex items-center justify-center h-full bg-gray-900">
                      <div className="text-center text-gray-500">
                        <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Empty Viewport</p>
                        <p className="text-xs opacity-75">Drag study here</p>
                      </div>
                    </div>
                  ) : viewport.isLoading ? (
                    // Loading state
                    <div className="flex items-center justify-center h-full bg-black">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
                        <p className="text-sm text-white">Loading...</p>
                      </div>
                    </div>
                  ) : viewport.imageIds.length > 0 && viewport.studyMetadata ? (
                    // DICOM Viewer
                    <div className="h-full w-full">
                      <SimpleDicomViewer
                        imageIds={viewport.imageIds}
                        seriesInfo={viewport.seriesInfo}
                        studyMetadata={viewport.studyMetadata}
                        pacsServerId={pacsServerId}
                        showOverlay={true}
                        hideToolbar={!viewport.isActive}
                      />
                      {/* Debug info */}
                      <div className="absolute bottom-16 right-2 text-[10px] text-green-400 bg-black/50 p-1 rounded">
                        {viewport.imageIds.length} images loaded
                      </div>
                    </div>
                  ) : (
                    // Error state
                    <div className="flex items-center justify-center h-full bg-red-900/20">
                      <div className="text-center text-red-400">
                        <X className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">Error</p>
                      </div>
                    </div>
                  )}

                  {/* Viewport Label - Top Left */}
                  <div className="absolute top-2 left-2 z-10">
                    <div className={`px-2 py-1 text-xs font-medium ${
                      viewport.isActive 
                        ? 'text-blue-400' 
                        : 'text-gray-300'
                    }`}>
                      {viewport.title}
                    </div>
                  </div>

                  {/* Series Info - Bottom Left */}
                  {viewport.seriesData && (
                    <div className="absolute bottom-2 left-2 z-10">
                      <div className="text-white text-xs">
                        <div className="font-medium">
                          {viewport.seriesData.SeriesDescription || viewport.seriesData.Modality}
                        </div>
                        <div className="text-gray-400 text-[10px]">
                          Img: {viewport.imageIds.length} / {viewport.seriesData.NumberOfSeriesRelatedInstances}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Patient Info - Top Right */}
                  {viewport.studyMetadata && (
                    <div className="absolute top-2 right-2 z-10">
                      <div className="text-right text-xs text-white">
                        <div className="font-medium">
                          {viewport.studyMetadata.patientName}
                        </div>
                        <div className="text-gray-400 text-[10px]">
                          {viewport.studyMetadata.studyDate}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 left-48 right-0 bg-gray-900 border-t border-gray-700 p-1">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span>Viewports: {viewports.filter(vp => !vp.isEmpty).length}/{layoutConfig.viewports}</span>
            <span>Sync: {syncEnabled ? 'On' : 'Off'}</span>
          </div>
          <div>
            Studies loaded: {viewports.filter(vp => !vp.isEmpty && !vp.isLoading).length}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OHIFMultiViewport;