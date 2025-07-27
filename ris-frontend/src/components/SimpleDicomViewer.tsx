'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  Play, Pause, SkipBack, SkipForward 
} from 'lucide-react';
import AuthService from '@/lib/auth';

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
  Enums as ToolsEnums
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';

const { ViewportType } = CoreEnums;
const { MouseBindings } = ToolsEnums;

// Global initialization flag
let isCornerstoneInitialized = false;

const initializeCornerstone = async () => {
  if (isCornerstoneInitialized) return;
  
  try {
    // Initialize Cornerstone3D libraries
    await coreInit();
    await dicomImageLoaderInit({
      beforeSend: (xhr: XMLHttpRequest) => {
        // Add JWT authentication - with error handling
        try {
          const token = AuthService?.getAccessToken?.();
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        } catch (error) {
          console.warn('Failed to get access token for DICOM image loading:', error);
          // Continue without authentication - images should still load via proxy
        }
      },
      // Optimize for performance
      useWebWorkers: true,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true
      }
    });
    await toolsInit();
    
    // Add all tools to the global state
    addTool(WindowLevelTool);
    addTool(ZoomTool);
    addTool(PanTool);
    addTool(LengthTool);
    addTool(RectangleROITool);
    addTool(EllipticalROITool);
    addTool(StackScrollTool);
    
    isCornerstoneInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Cornerstone3D:', error);
    throw error;
  }
};

interface SimpleDicomViewerProps {
  imageIds: string[];
  studyMetadata: {
    patientName: string;
    patientId: string;
    studyDate: string;
    studyDescription: string;
    modality: string;
  };
}

type Tool = 'wwwc' | 'zoom' | 'pan' | 'length' | 'rectangle' | 'ellipse';

const SimpleDicomViewer: React.FC<SimpleDicomViewerProps> = ({ imageIds, studyMetadata }) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);
  const [viewport, setViewport] = useState<any>(null);
  const [toolGroup, setToolGroup] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Cornerstone3D - with better DOM readiness
  useEffect(() => {
    console.log('SimpleDicomViewer mounted, imageIds:', imageIds);
    console.log('mainViewportRef.current at mount:', mainViewportRef.current);
    
    if (!imageIds || imageIds.length === 0) {
      console.log('No images to load');
      setLoading(false);
      return;
    }

    const waitForElement = async (maxRetries = 50) => {
      for (let i = 0; i < maxRetries; i++) {
        console.log(`Retry ${i + 1}: mainViewportRef.current =`, mainViewportRef.current);
        if (mainViewportRef.current && mainViewportRef.current.offsetParent !== null) {
          console.log('Element found and visible in DOM');
          return mainViewportRef.current;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.error('Element never became available. Final state:', {
        current: mainViewportRef.current,
        offsetParent: mainViewportRef.current?.offsetParent,
        isConnected: mainViewportRef.current?.isConnected
      });
      throw new Error('Viewport element not found after waiting');
    };

    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('Starting initialization with:', { imageCount: imageIds.length, firstImage: imageIds[0] });

        // Wait for DOM element to be ready and visible
        console.log('Waiting for viewport element...');
        const element = await waitForElement();
        console.log('Viewport element found and ready:', element);
        
        console.log('Initializing cornerstone...');
        await initializeCornerstone();
        console.log('Cornerstone initialized');

        console.log('Creating rendering engine...');
        const renderingEngineId = 'simpleDicomViewer';
        const engine = new RenderingEngine(renderingEngineId, {
          // Optimize rendering performance
          enableGPURendering: true,
          strictZSpacingForVolumeViewport: false
        });
        setRenderingEngine(engine);

        console.log('Creating viewport...');
        const viewportId = 'stackViewport';
        const viewportInput = {
          viewportId,
          element: element, // Use the element we waited for
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        setViewport(stackViewport);

        console.log('Loading images...', imageIds);
        await stackViewport.setStack(imageIds, currentImageIndex);
        stackViewport.render();
        console.log('Images loaded and rendered');

        console.log('Creating tool group...');
        const toolGroupId = 'simpleDicomViewerToolGroup';
        const tg = ToolGroupManager.createToolGroup(toolGroupId);
        setToolGroup(tg);

        // Add tools
        tg.addTool(WindowLevelTool.toolName);
        tg.addTool(ZoomTool.toolName);
        tg.addTool(PanTool.toolName);
        tg.addTool(LengthTool.toolName);
        tg.addTool(RectangleROITool.toolName);
        tg.addTool(EllipticalROITool.toolName);
        tg.addTool(StackScrollTool.toolName);

        tg.addViewport(viewportId, renderingEngineId);

        // Activate tools with optimized settings
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ 
            mouseButton: MouseBindings.Primary,
            // Add configuration for smoother window/level
            configuration: {
              // Reduce sensitivity for smoother control
              orientation: 0,
              colormap: undefined
            }
          }],
        });
        tg.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
        });
        tg.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Auxiliary }],
        });
        tg.setToolActive(StackScrollTool.toolName);

        console.log('DICOM viewer fully initialized');
        setLoading(false);
      } catch (err) {
        console.error('Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        setLoading(false);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      init();
    });

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
      if (renderingEngine) {
        renderingEngine.destroy();
      }
      if (toolGroup) {
        ToolGroupManager.destroyToolGroup(toolGroup.id);
      }
    };
  }, [imageIds]); // Remove currentImageIndex to prevent reinitialization

  // Tool management functions
  const setToolActive = useCallback((tool: Tool) => {
    if (!toolGroup) return;
    
    try {
      // Deactivate all tools first
      toolGroup.setToolPassive(WindowLevelTool.toolName);
      toolGroup.setToolPassive(ZoomTool.toolName);
      toolGroup.setToolPassive(PanTool.toolName);
      toolGroup.setToolPassive(LengthTool.toolName);
      toolGroup.setToolPassive(RectangleROITool.toolName);
      toolGroup.setToolPassive(EllipticalROITool.toolName);
      
      // Activate selected tool
      switch (tool) {
        case 'wwwc':
          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'zoom':
          toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'pan':
          toolGroup.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'length':
          toolGroup.setToolActive(LengthTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'rectangle':
          toolGroup.setToolActive(RectangleROITool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'ellipse':
          toolGroup.setToolActive(EllipticalROITool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
      }
      
      setActiveTool(tool);
    } catch (error) {
      console.error('Error setting tool active:', error);
    }
  }, [toolGroup]);
  
  // Navigation functions
  const goToImage = useCallback((index: number) => {
    if (viewport && index >= 0 && index < imageIds.length) {
      viewport.setImageIdIndex(index);
      viewport.render();
      setCurrentImageIndex(index);
    }
  }, [viewport, imageIds.length]);
  
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
          goToImage(nextIndex);
          return nextIndex;
        });
      }, 200);
      setIsPlaying(true);
    }
  }, [isPlaying, imageIds.length, goToImage]);
  
  // Viewport manipulation functions
  const resetViewport = useCallback(() => {
    if (viewport) {
      viewport.resetCamera();
      viewport.render();
    }
  }, [viewport]);
  
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
            <CardTitle className="text-red-600">Error Loading Images</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Always render the viewport div, but show loading/error states with overlays
  const showLoading = loading;
  const showNoImages = !loading && imageIds.length === 0;
  
  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Main Content - Full height */}
      <div className="flex-1 flex flex-col relative">
        {/* Toolbar - Floating on top of image */}
        <div className="absolute top-4 left-4 z-10 bg-background/90 border rounded-lg p-2 shadow-lg">
          <div className="flex items-center gap-1">
            <Button
              variant={activeTool === 'wwwc' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('wwwc')}
              title="Window/Level"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'zoom' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('zoom')}
              title="Zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'pan' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('pan')}
              title="Pan"
            >
              <Move className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'length' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('length')}
              title="Measure"
            >
              <Ruler className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'rectangle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('rectangle')}
              title="Rectangle ROI"
            >
              <Square className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={resetViewport}
              title="Reset View"
            >
              <MousePointer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Image Info - Floating on top right */}
        <div className="absolute top-4 right-4 z-10 bg-background/90 border rounded-lg p-2 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">
              {currentImageIndex + 1} of {imageIds.length}
            </Badge>
            <Badge variant="outline">
              {studyMetadata.modality}
            </Badge>
          </div>
        </div>


        {/* Main Viewport - Full size */}
        <div className="flex-1 relative">
          <div
            ref={mainViewportRef}
            className="w-full h-full bg-black"
            style={{ minHeight: '400px' }}
          >
            {/* Loading Overlay */}
            {showLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Card className="w-96">
                  <CardHeader>
                    <CardTitle>Loading DICOM Viewer...</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-center mt-2">Initializing Cornerstone3D</p>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* No Images Overlay */}
            {showNoImages && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Card className="w-96">
                  <CardHeader>
                    <CardTitle>No Images Available</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      No DICOM images found for this study.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Thumbnails Strip - Bottom */}
        {!showLoading && !showNoImages && imageIds.length > 1 && (
          <div className="h-24 border-t bg-muted/5 p-2">
            <div className="flex items-center gap-2 h-full overflow-x-auto">
              {/* Navigation Controls */}
              <div className="flex items-center gap-1 pr-2 border-r">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={prevImage} 
                  disabled={currentImageIndex === 0}
                  title="Previous Image"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={togglePlayback}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={nextImage} 
                  disabled={currentImageIndex === imageIds.length - 1}
                  title="Next Image"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Thumbnail Images */}
              <div className="flex gap-1 flex-1 overflow-x-auto">
                {imageIds.map((imageId, index) => (
                  <ThumbnailImage
                    key={imageId}
                    imageId={imageId}
                    index={index}
                    isActive={index === currentImageIndex}
                    onClick={() => goToImage(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Thumbnail component for rendering small DICOM images
interface ThumbnailImageProps {
  imageId: string;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({ imageId, index, isActive, onClick }) => {
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    const element = thumbRef.current;
    if (!element || !imageId) return;

    let mounted = true;
    
    const loadThumbnail = async () => {
      try {
        // Initialize a small rendering engine for thumbnails
        await initializeCornerstone();
        
        if (!mounted) return;
        
        const thumbRenderingEngineId = `thumb-${index}`;
        const thumbEngine = new RenderingEngine(thumbRenderingEngineId);
        
        const thumbViewportId = `thumbViewport-${index}`;
        const thumbViewportInput = {
          viewportId: thumbViewportId,
          element: element,
          type: ViewportType.STACK,
        };

        thumbEngine.enableElement(thumbViewportInput);
        const thumbViewport = thumbEngine.getViewport(thumbViewportId);
        
        // Load the single image
        await thumbViewport.setStack([imageId], 0);
        thumbViewport.render();
        
        if (mounted) {
          setIsLoaded(true);
        }
        
        // Cleanup function
        return () => {
          try {
            thumbEngine.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        };
      } catch (err) {
        console.warn(`Failed to load thumbnail ${index}:`, err);
        if (mounted) {
          setError(true);
        }
      }
    };

    loadThumbnail();
    
    return () => {
      mounted = false;
    };
  }, [imageId, index]);
  
  return (
    <div
      onClick={onClick}
      className={`
        relative flex-shrink-0 cursor-pointer border-2 rounded transition-all
        ${isActive 
          ? 'border-primary shadow-md' 
          : 'border-border hover:border-primary/50'
        }
      `}
      style={{ width: '80px', height: '80px' }}
    >
      <div
        ref={thumbRef}
        className="w-full h-full bg-black rounded-sm"
      />
      
      
      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-sm">
          <div className="w-4 h-4 bg-muted-foreground/50 rounded"></div>
        </div>
      )}
      
    </div>
  );
};

export default SimpleDicomViewer;