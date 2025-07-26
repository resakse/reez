'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import Hammer from 'hammerjs';
import { getStudyImageIds, getStudyMetadata } from '@/lib/orthanc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  Download, Info, Play, Pause, SkipBack, SkipForward 
} from 'lucide-react';

// --- Single, Global Initialization ---
let isCornerstoneInitialized = false;
const initializeCornerstone = () => {
  if (isCornerstoneInitialized) return;
  
  // Configure cornerstone-wado-image-loader
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
      use16BitDataType: true
    }
  });
  
  // Configure cornerstone-tools
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.Hammer = Hammer;
  cornerstoneTools.init({
    showSVGCursors: true,
    globalToolSynchronizationEnabled: true
  });
  
  // Initialize all tools
  cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
  cornerstoneTools.addTool(cornerstoneTools.PanTool);
  cornerstoneTools.addTool(cornerstoneTools.WwwcTool);
  cornerstoneTools.addTool(cornerstoneTools.RotateTool);
  cornerstoneTools.addTool(cornerstoneTools.LengthTool);
  cornerstoneTools.addTool(cornerstoneTools.RectangleRoiTool);
  cornerstoneTools.addTool(cornerstoneTools.EllipticalRoiTool);
  cornerstoneTools.addTool(cornerstoneTools.MagnifyTool);
  cornerstoneTools.addTool(cornerstoneTools.FreehandRoiTool);
  
  isCornerstoneInitialized = true;
};
// --- End Initialization ---

interface DicomViewerProps {
  studyId: string;
}

interface StudyMetadata {
  PatientName?: string;
  PatientID?: string;
  PatientBirthDate?: string;
  PatientSex?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  Modality?: string;
  InstitutionName?: string;
  SeriesCount?: number;
  ImageCount?: number;
}

type Tool = 'wwwc' | 'zoom' | 'pan' | 'rotate' | 'length' | 'rectangle' | 'ellipse' | 'magnify' | 'freehand';

const DicomViewer: React.FC<DicomViewerProps> = ({ studyId }) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [studyMetadata, setStudyMetadata] = useState<StudyMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(200);
  const [viewportInfo, setViewportInfo] = useState<any>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize data and load study
  useEffect(() => {
    initializeCornerstone();
    if (studyId) {
      const fetchStudyData = async () => {
        try {
          setLoading(true);
          setError(null);
          
          // Fetch image IDs and metadata in parallel
          const [ids, metadata] = await Promise.all([
            getStudyImageIds(studyId),
            getStudyMetadata(studyId)
          ]);
          
          setImageIds(ids);
          setStudyMetadata(metadata);
          
          if (ids.length > 0) {
            setCurrentImageIndex(0);
          }
        } catch (err) {
          console.error('Error fetching DICOM data:', err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
          setLoading(false);
        }
      };
      fetchStudyData();
    }
  }, [studyId]);

  // Load and display current image
  useEffect(() => {
    const element = mainViewportRef.current;
    const currentImageId = imageIds[currentImageIndex];
    
    if (element && currentImageId && !loading) {
      cornerstone.enable(element);
      
      cornerstone.loadImage(currentImageId)
        .then((image: any) => {
          cornerstone.displayImage(element, image);
          
          // Enable tools for this element
          cornerstoneTools.addToolForElement(element, cornerstoneTools.ZoomTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.PanTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.WwwcTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.RotateTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.LengthTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleRoiTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.EllipticalRoiTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.MagnifyTool);
          cornerstoneTools.addToolForElement(element, cornerstoneTools.FreehandRoiTool);
          
          // Set default tool
          setToolActive(activeTool);
          
          // Update viewport info
          updateViewportInfo();
          
          // Add viewport update listener
          element.addEventListener('cornerstoneimagerendered', updateViewportInfo);
        })
        .catch((error: unknown) => {
          console.error(`Failed to load image ${currentImageId}`, error);
          if (error instanceof Error) {
            setError(`Failed to load image: ${error.message}`);
          } else {
            setError('An unknown error occurred while loading the image.');
          }
        });
    }
    
    return () => {
      if (element) {
        try {
          element.removeEventListener('cornerstoneimagerendered', updateViewportInfo);
          cornerstone.disable(element);
        } catch {
          // Element already disabled, safely ignore
        }
      }
    };
  }, [currentImageIndex, imageIds, loading, activeTool]);

  // Tool management functions
  const setToolActive = useCallback((tool: Tool) => {
    const element = mainViewportRef.current;
    if (!element) return;
    
    // Deactivate all tools first
    cornerstoneTools.setToolDisabledForElement(element, 'Wwwc');
    cornerstoneTools.setToolDisabledForElement(element, 'Zoom');
    cornerstoneTools.setToolDisabledForElement(element, 'Pan');
    cornerstoneTools.setToolDisabledForElement(element, 'Rotate');
    cornerstoneTools.setToolDisabledForElement(element, 'Length');
    cornerstoneTools.setToolDisabledForElement(element, 'RectangleRoi');
    cornerstoneTools.setToolDisabledForElement(element, 'EllipticalRoi');
    cornerstoneTools.setToolDisabledForElement(element, 'Magnify');
    cornerstoneTools.setToolDisabledForElement(element, 'FreehandRoi');
    
    // Activate selected tool
    switch (tool) {
      case 'wwwc':
        cornerstoneTools.setToolActiveForElement(element, 'Wwwc', { mouseButtonMask: 1 });
        break;
      case 'zoom':
        cornerstoneTools.setToolActiveForElement(element, 'Zoom', { mouseButtonMask: 1 });
        break;
      case 'pan':
        cornerstoneTools.setToolActiveForElement(element, 'Pan', { mouseButtonMask: 1 });
        break;
      case 'rotate':
        cornerstoneTools.setToolActiveForElement(element, 'Rotate', { mouseButtonMask: 1 });
        break;
      case 'length':
        cornerstoneTools.setToolActiveForElement(element, 'Length', { mouseButtonMask: 1 });
        break;
      case 'rectangle':
        cornerstoneTools.setToolActiveForElement(element, 'RectangleRoi', { mouseButtonMask: 1 });
        break;
      case 'ellipse':
        cornerstoneTools.setToolActiveForElement(element, 'EllipticalRoi', { mouseButtonMask: 1 });
        break;
      case 'magnify':
        cornerstoneTools.setToolActiveForElement(element, 'Magnify', { mouseButtonMask: 1 });
        break;
      case 'freehand':
        cornerstoneTools.setToolActiveForElement(element, 'FreehandRoi', { mouseButtonMask: 1 });
        break;
    }
    
    setActiveTool(tool);
  }, []);
  
  const updateViewportInfo = useCallback(() => {
    const element = mainViewportRef.current;
    if (!element) return;
    
    try {
      const viewport = cornerstone.getViewport(element);
      const enabledElement = cornerstone.getEnabledElement(element);
      const image = enabledElement?.image;
      
      setViewportInfo({
        scale: viewport?.scale?.toFixed(2) || '1.00',
        windowCenter: viewport?.voi?.windowCenter?.toFixed(0) || 'N/A',
        windowWidth: viewport?.voi?.windowWidth?.toFixed(0) || 'N/A',
        rotation: viewport?.rotation || 0,
        imageWidth: image?.width || 'N/A',
        imageHeight: image?.height || 'N/A',
        pixelSpacing: image?.rowPixelSpacing ? `${image.rowPixelSpacing.toFixed(2)} x ${image.columnPixelSpacing.toFixed(2)}` : 'N/A'
      });
    } catch (error) {
      console.error('Error updating viewport info:', error);
    }
  }, []);
  
  // Navigation functions
  const goToImage = useCallback((index: number) => {
    if (index >= 0 && index < imageIds.length) {
      setCurrentImageIndex(index);
    }
  }, [imageIds.length]);
  
  const nextImage = useCallback(() => {
    goToImage(currentImageIndex + 1);
  }, [currentImageIndex, goToImage]);
  
  const prevImage = useCallback(() => {
    goToImage(currentImageIndex - 1);
  }, [currentImageIndex, goToImage]);
  
  // Playback functions
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      playbackIntervalRef.current = setInterval(() => {
        setCurrentImageIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= imageIds.length) {
            return 0; // Loop back to first image
          }
          return nextIndex;
        });
      }, playbackSpeed);
      setIsPlaying(true);
    }
  }, [isPlaying, playbackSpeed, imageIds.length]);
  
  // Viewport manipulation functions
  const resetViewport = useCallback(() => {
    const element = mainViewportRef.current;
    if (!element) return;
    
    cornerstone.reset(element);
    updateViewportInfo();
  }, [updateViewportInfo]);
  
  const rotateViewport = useCallback((degrees: number) => {
    const element = mainViewportRef.current;
    if (!element) return;
    
    const viewport = cornerstone.getViewport(element);
    viewport.rotation += degrees;
    cornerstone.setViewport(element, viewport);
    updateViewportInfo();
  }, [updateViewportInfo]);
  
  const invertImage = useCallback(() => {
    const element = mainViewportRef.current;
    if (!element) return;
    
    const viewport = cornerstone.getViewport(element);
    viewport.invert = !viewport.invert;
    cornerstone.setViewport(element, viewport);
  }, []);
  
  // Cleanup playback on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Study</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (loading || imageIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Loading Study...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-center mt-2">Please wait while we load the DICOM images</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="w-full h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">DICOM Viewer</h1>
            <p className="text-muted-foreground">
              Study: {studyId} | {studyMetadata?.PatientName || 'Unknown Patient'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {currentImageIndex + 1} of {imageIds.length}
            </Badge>
            <Badge variant="outline">
              {studyMetadata?.Modality || 'Unknown'}
            </Badge>
          </div>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tools and Navigation */}
        <div className="w-80 border-r bg-muted/10 overflow-y-auto">
          <Tabs defaultValue="tools" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="info">Info</TabsTrigger>
            </TabsList>
            
            <TabsContent value="tools" className="p-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Viewing Tools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={activeTool === 'wwwc' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('wwwc')}
                      className="justify-start"
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      W/L
                    </Button>
                    <Button
                      variant={activeTool === 'zoom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('zoom')}
                      className="justify-start"
                    >
                      <ZoomIn className="h-4 w-4 mr-1" />
                      Zoom
                    </Button>
                    <Button
                      variant={activeTool === 'pan' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('pan')}
                      className="justify-start"
                    >
                      <Move className="h-4 w-4 mr-1" />
                      Pan
                    </Button>
                    <Button
                      variant={activeTool === 'rotate' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('rotate')}
                      className="justify-start"
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      Rotate
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Measurement Tools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={activeTool === 'length' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('length')}
                      className="justify-start"
                    >
                      <Ruler className="h-4 w-4 mr-1" />
                      Length
                    </Button>
                    <Button
                      variant={activeTool === 'rectangle' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('rectangle')}
                      className="justify-start"
                    >
                      <Square className="h-4 w-4 mr-1" />
                      ROI
                    </Button>
                    <Button
                      variant={activeTool === 'ellipse' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('ellipse')}
                      className="justify-start"
                    >
                      <Circle className="h-4 w-4 mr-1" />
                      Ellipse
                    </Button>
                    <Button
                      variant={activeTool === 'magnify' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setToolActive('magnify')}
                      className="justify-start"
                    >
                      <ZoomIn className="h-4 w-4 mr-1" />
                      Magnify
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Viewport Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => rotateViewport(90)}>
                      <RotateCw className="h-4 w-4 mr-1" />
                      Rotate 90°
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rotateViewport(-90)}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Rotate -90°
                    </Button>
                    <Button size="sm" variant="outline" onClick={invertImage}>
                      <Maximize className="h-4 w-4 mr-1" />
                      Invert
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetViewport}>
                      <MousePointer className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* Viewport Info */}
              {viewportInfo && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Viewport Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span>Scale:</span>
                      <span>{viewportInfo.scale}x</span>
                    </div>
                    <div className="flex justify-between">
                      <span>W/L:</span>
                      <span>{viewportInfo.windowWidth}/{viewportInfo.windowCenter}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Size:</span>
                      <span>{viewportInfo.imageWidth}x{viewportInfo.imageHeight}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Spacing:</span>
                      <span>{viewportInfo.pixelSpacing}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="images" className="p-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Image Navigation</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Playback Controls */}
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Button size="sm" variant="outline" onClick={prevImage} disabled={currentImageIndex === 0}>
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={togglePlayback}>
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={nextImage} disabled={currentImageIndex === imageIds.length - 1}>
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Image Thumbnails */}
                  <ScrollArea className="h-96">
                    <div className="grid grid-cols-2 gap-2">
                      {imageIds.map((imageId, index) => (
                        <Thumbnail
                          key={imageId}
                          imageId={imageId}
                          index={index}
                          isActive={index === currentImageIndex}
                          onClick={() => goToImage(index)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="info" className="p-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Study Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studyMetadata && (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Patient:</span>
                        <p className="text-muted-foreground">{studyMetadata.PatientName || 'N/A'}</p>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium">Patient ID:</span>
                        <p className="text-muted-foreground">{studyMetadata.PatientID || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Sex:</span>
                        <p className="text-muted-foreground">{studyMetadata.PatientSex || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Birth Date:</span>
                        <p className="text-muted-foreground">{studyMetadata.PatientBirthDate || 'N/A'}</p>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium">Study Date:</span>
                        <p className="text-muted-foreground">{studyMetadata.StudyDate || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Study Time:</span>
                        <p className="text-muted-foreground">{studyMetadata.StudyTime || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Description:</span>
                        <p className="text-muted-foreground">{studyMetadata.StudyDescription || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Modality:</span>
                        <p className="text-muted-foreground">{studyMetadata.Modality || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Institution:</span>
                        <p className="text-muted-foreground">{studyMetadata.InstitutionName || 'N/A'}</p>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium">Images:</span>
                        <p className="text-muted-foreground">{imageIds.length}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Main Viewport */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-4">
            <div
              ref={mainViewportRef}
              className="w-full h-full bg-black rounded-lg border border-border"
              style={{ minHeight: '400px' }}
            />
          </div>
          
          {/* Bottom toolbar */}
          <div className="border-t p-2 bg-muted/5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Use mouse wheel to scroll through images</span>
              <span>Active Tool: {activeTool.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ThumbnailProps {
  imageId: string;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

const Thumbnail: React.FC<ThumbnailProps> = ({ imageId, index, isActive, onClick }) => {
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    const element = thumbRef.current;
    if (element) {
      cornerstone.enable(element);
      
      cornerstone.loadImage(imageId)
        .then((image: any) => {
          cornerstone.displayImage(element, image);
          setIsLoaded(true);
        })
        .catch((err: unknown) => {
          console.error(`Failed to load thumbnail for ${imageId}`, err);
        });
    }
    
    return () => {
      if (element) {
        try {
          cornerstone.disable(element);
        } catch {
          // Element already disabled, safely ignore
        }
      }
    };
  }, [imageId]);

  return (
    <div className="relative">
      <div
        ref={thumbRef}
        onClick={onClick}
        className={`cursor-pointer border-2 rounded-md transition-all hover:border-primary/50 ${
          isActive ? 'border-primary shadow-md' : 'border-border'
        }`}
        style={{ width: '80px', height: '80px', backgroundColor: 'black' }}
      />
      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
        {index + 1}
      </div>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-md">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
};

export default DicomViewer;