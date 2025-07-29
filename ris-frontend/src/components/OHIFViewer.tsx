'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  Play, Pause, SkipBack, SkipForward, Trash2,
  FlipHorizontal, Palette, Grid, List
} from 'lucide-react';
import AuthService from '@/lib/auth';
import { toast } from '@/lib/toast';

// Modern Cornerstone3D imports
import { init as coreInit, RenderingEngine, Enums as CoreEnums, type Types } from '@cornerstonejs/core';
import { 
  init as toolsInit,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  StackScrollTool,
  addTool,
  Enums as ToolsEnums,
  annotation
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import * as cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const { ViewportType } = CoreEnums;
const { MouseBindings } = ToolsEnums;

// Series information interface
interface SeriesData {
  seriesId: string;
  seriesUid: string;
  seriesNumber: number;
  seriesDescription: string;
  modality: string;
  imageCount: number;
  firstImageUrl: string;
  instances: Array<{
    instanceId: string;
    frameUrl: string;
  }>;
}

interface StudyMetadata {
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  studyInstanceUID?: string;
}

interface OHIFViewerProps {
  studyUid: string;
  studyMetadata: StudyMetadata;
}

// Global initialization flag
let isCornerstoneInitialized = false;
let cornerstoneInitPromise: Promise<void> | null = null;

const initializeCornerstone = async () => {
  if (isCornerstoneInitialized) return;
  
  if (cornerstoneInitPromise) {
    await cornerstoneInitPromise;
    return;
  }
  
  cornerstoneInitPromise = (async () => {
    try {
      await coreInit();
      
      await dicomImageLoaderInit({
        beforeSend: (xhr: XMLHttpRequest) => {
          try {
            const token = AuthService?.getAccessToken?.();
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
          } catch (error) {
            // Continue without authentication
          }
        },
        useWebWorkers: true,
        maxWebWorkers: 2,
        strict: false,
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: true,
          usePDFJS: false,
          useWebGL: false,
        },
        errorInterceptor: (error: any) => {
          return error;
        },
        webWorkerTaskPools: {
          decodeTask: {
            maxConcurrency: 2,
            targetUtilization: 0.6
          }
        }
      });
      
      await toolsInit();
      
      addTool(WindowLevelTool);
      addTool(ZoomTool);
      addTool(PanTool);
      addTool(LengthTool);
      addTool(RectangleROITool);
      addTool(EllipticalROITool);
      addTool(StackScrollTool);
      
      isCornerstoneInitialized = true;
    } catch (error) {
      cornerstoneInitPromise = null;
      throw error;
    }
  })();
  
  await cornerstoneInitPromise;
};

// Bulk loader service with queue management
class BulkLoader {
  private static instance: BulkLoader;
  private queue: Array<{ seriesUid: string; callback: (progress: number) => void }> = [];
  private activeLoads = new Set<string>();
  private maxConcurrentLoads = 3;
  private cache = new Map<string, string[]>();

  static getInstance() {
    if (!BulkLoader.instance) {
      BulkLoader.instance = new BulkLoader();
    }
    return BulkLoader.instance;
  }

  async loadSeriesImages(seriesData: SeriesData, onProgress: (progress: number) => void): Promise<string[]> {
    const { seriesUid, instances } = seriesData;
    
    // Check cache first
    if (this.cache.has(seriesUid)) {
      onProgress(100);
      return this.cache.get(seriesUid)!;
    }

    // If already loading, wait for completion
    if (this.activeLoads.has(seriesUid)) {
      return new Promise((resolve) => {
        const checkCompletion = () => {
          if (this.cache.has(seriesUid)) {
            resolve(this.cache.get(seriesUid)!);
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });
    }

    // Start loading
    this.activeLoads.add(seriesUid);
    
    try {
      const imageUrls: string[] = [];
      const totalImages = instances.length;
      let loadedCount = 0;

      // Load images in batches to prevent server overload
      const batchSize = 10;
      for (let i = 0; i < instances.length; i += batchSize) {
        const batch = instances.slice(i, Math.min(i + batchSize, instances.length));
        
        // Load batch concurrently but limit requests
        const batchPromises = batch.map(async (instance) => {
          try {
            // Construct wadors URL for Cornerstone
            const wadorsUrl = `wadors:${instance.frameUrl}`;
            imageUrls.push(wadorsUrl);
            loadedCount++;
            
            // Update progress
            const progress = Math.round((loadedCount / totalImages) * 100);
            onProgress(progress);
            
            return wadorsUrl;
          } catch (error) {
            console.warn(`Failed to load image ${instance.instanceId}:`, error);
            return null;
          }
        });

        await Promise.all(batchPromises);
        
        // Small delay between batches
        if (i + batchSize < instances.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Filter out failed loads and cache result
      const validImageUrls = imageUrls.filter(url => url !== null);
      this.cache.set(seriesUid, validImageUrls);
      
      return validImageUrls;
    } finally {
      this.activeLoads.delete(seriesUid);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

// Series thumbnail component with progress bar
interface SeriesThumbnailProps {
  series: SeriesData;
  isActive: boolean;
  loadingProgress: number;
  onClick: () => void;
}

const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ 
  series, 
  isActive, 
  loadingProgress, 
  onClick 
}) => {
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = thumbRef.current;
    if (!element) return;

    const loadThumbnail = async () => {
      try {
        await initializeCornerstone();
        
        const engine = new RenderingEngine(`thumb-${series.seriesId}`);
        const viewportId = `thumbViewport-${series.seriesId}`;
        
        const viewportInput = {
          viewportId,
          element: element,
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const viewport = engine.getViewport(viewportId);
        
        // Load first image for thumbnail
        const firstImageUrl = `wadors:${series.firstImageUrl}`;
        await (viewport as any).setStack([firstImageUrl], 0);
        
        viewport.resetCamera();
        viewport.render();
        
        setIsLoaded(true);
      } catch (err) {
        console.error('Thumbnail load error:', err);
        setError(true);
      }
    };

    loadThumbnail();
  }, [series]);

  return (
    <div
      onClick={onClick}
      className={`
        relative cursor-pointer border-2 rounded-lg transition-all group
        ${isActive 
          ? 'border-primary shadow-lg' 
          : 'border-border hover:border-primary/50'
        }
      `}
      style={{ width: '180px', height: '140px' }}
    >
      <div
        ref={thumbRef}
        className="w-full h-24 bg-black rounded-t-md"
      />
      
      {/* Progress bar overlay */}
      {loadingProgress > 0 && loadingProgress < 100 && (
        <div className="absolute top-2 left-2 right-2">
          <Progress value={loadingProgress} className="h-2" />
          <div className="text-xs text-white text-center mt-1">
            {loadingProgress}%
          </div>
        </div>
      )}
      
      {/* Series info */}
      <div className="p-2 bg-background rounded-b-md">
        <div className="text-sm font-medium truncate">
          {series.seriesDescription || `Series ${series.seriesNumber}`}
        </div>
        <div className="text-xs text-muted-foreground flex justify-between">
          <span>{series.imageCount} images</span>
          <Badge variant="outline" className="text-xs">
            {series.modality}
          </Badge>
        </div>
      </div>
      
      {/* Loading/Error states */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-md">
          <div className="text-xs text-muted-foreground">Failed to load</div>
        </div>
      )}
    </div>
  );
};

// Main CT scan viewer component
const OHIFViewer: React.FC<OHIFViewerProps> = ({ studyUid, studyMetadata }) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const [seriesData, setSeriesData] = useState<SeriesData[]>([]);
  const [currentSeries, setCurrentSeries] = useState<SeriesData | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentImageIds, setCurrentImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid');
  
  // Cornerstone viewport state
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);
  const [viewport, setViewport] = useState<any>(null);
  const [toolGroup, setToolGroup] = useState<any>(null);

  const bulkLoader = BulkLoader.getInstance();

  // Fetch series metadata
  useEffect(() => {
    const fetchSeriesData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await AuthService.authenticatedFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyUid}/series/`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch series data: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.series) {
          setSeriesData(data.series);
          
          // Select first CT/MRI series by default
          const ctMriSeries = data.series.filter((s: SeriesData) => 
            ['CT', 'MR', 'MRI'].includes(s.modality.toUpperCase())
          );
          const firstSeries = ctMriSeries.length > 0 ? ctMriSeries[0] : data.series[0];
          
          if (firstSeries) {
            setCurrentSeries(firstSeries);
            // Start loading the first series images
            await loadSeriesImages(firstSeries);
          }
        } else {
          throw new Error('Invalid series data response');
        }
      } catch (err) {
        console.error('Error fetching series data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load series data');
        toast.error('Failed to load CT scan series');
      } finally {
        setLoading(false);
      }
    };

    if (studyUid) {
      fetchSeriesData();
    }
  }, [studyUid]);

  // Load series images with progress tracking
  const loadSeriesImages = async (series: SeriesData) => {
    try {
      const imageUrls = await bulkLoader.loadSeriesImages(series, (progress) => {
        setLoadingProgress(prev => ({
          ...prev,
          [series.seriesUid]: progress
        }));
      });
      
      if (series === currentSeries) {
        setCurrentImageIds(imageUrls);
        setCurrentImageIndex(0);
      }
      
      toast.success(`Loaded ${imageUrls.length} images from ${series.seriesDescription}`);
    } catch (err) {
      console.error('Error loading series images:', err);
      toast.error(`Failed to load images from ${series.seriesDescription}`);
    }
  };

  // Handle series selection
  const handleSeriesSelect = async (series: SeriesData) => {
    if (series === currentSeries) return;
    
    setCurrentSeries(series);
    setViewMode('single');
    
    // Check if already loaded
    if (loadingProgress[series.seriesUid] === 100) {
      // Images already loaded, just switch to them
      await loadSeriesImages(series);
    } else {
      // Start loading if not already in progress
      await loadSeriesImages(series);
    }
  };

  // Mouse wheel navigation
  const handleWheel = useCallback((event: WheelEvent) => {
    if (viewMode !== 'single' || !currentImageIds.length) return;
    
    event.preventDefault();
    
    const delta = event.deltaY > 0 ? 1 : -1;
    const newIndex = Math.max(0, Math.min(currentImageIds.length - 1, currentImageIndex + delta));
    
    if (newIndex !== currentImageIndex) {
      setCurrentImageIndex(newIndex);
    }
  }, [viewMode, currentImageIds, currentImageIndex]);

  // Add wheel event listener
  useEffect(() => {
    const element = mainViewportRef.current;
    if (element && viewMode === 'single') {
      element.addEventListener('wheel', handleWheel, { passive: false });
      return () => element.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, viewMode]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Loading CT Scan Series...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-center mt-2">Fetching series metadata</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading CT Scan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="w-full" variant="outline">
              Retry Loading
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {studyMetadata.modality} Study
          </Badge>
          <span className="text-sm text-muted-foreground">
            {seriesData.length} Series • {studyMetadata.patientName}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4 mr-2" />
            Series Grid
          </Button>
          <Button
            variant={viewMode === 'single' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('single')}
            disabled={!currentSeries}
          >
            <List className="h-4 w-4 mr-2" />
            Single Series
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {viewMode === 'grid' ? (
          // Series Grid View
          <div className="h-full overflow-auto p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {seriesData.map((series) => (
                <SeriesThumbnail
                  key={series.seriesId}
                  series={series}
                  isActive={series === currentSeries}
                  loadingProgress={loadingProgress[series.seriesUid] || 0}
                  onClick={() => handleSeriesSelect(series)}
                />
              ))}
            </div>
          </div>
        ) : (
          // Single Series View
          <div className="h-full flex flex-col">
            <div
              ref={mainViewportRef}
              className="flex-1 bg-black relative"
            >
              {currentImageIds.length > 0 && currentSeries ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">{currentSeries.seriesDescription}</h3>
                      <p className="text-sm text-gray-300">
                        Image {currentImageIndex + 1} of {currentImageIds.length}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400">
                      Use mouse wheel to navigate through images
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-white">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Loading series images...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Series Navigation Footer */}
            {currentSeries && (
              <div className="h-16 border-t bg-muted/5 p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{currentSeries.modality}</Badge>
                  <span className="text-sm">{currentSeries.seriesDescription}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
                    disabled={currentImageIndex === 0}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  
                  <span className="text-sm min-w-20 text-center">
                    {currentImageIndex + 1} / {currentImageIds.length}
                  </span>
                  
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => setCurrentImageIndex(Math.min(currentImageIds.length - 1, currentImageIndex + 1))}
                    disabled={currentImageIndex === currentImageIds.length - 1}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OHIFViewer;