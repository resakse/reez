'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  FlipHorizontal, Palette, Trash2, ArrowLeft, ArrowRight,
  Eye, EyeOff
} from 'lucide-react';
import AuthService from '@/lib/auth';
import DicomOverlay from './DicomOverlay';

// Modern Cornerstone3D imports
import { init as coreInit, RenderingEngine, Enums as CoreEnums, type Types, eventTarget } from '@cornerstonejs/core';
import { 
  init as toolsInit,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  PanTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  addTool,
  Enums as ToolsEnums,
  annotation
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import * as cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const { ViewportType } = CoreEnums;
const { MouseBindings } = ToolsEnums;

// WADO-RS metadata pre-registration
async function preRegisterWadorsMetadata(imageIds: string[]): Promise<void> {
  try {
    const dicomImageLoader = (window as any).cornerstoneDICOMImageLoader || cornerstoneDICOMImageLoader;
    
    if (!dicomImageLoader?.wadors?.metaDataManager) {
      return;
    }
    
    const maxConcurrent = 10;
    let activeRequests = 0;
    
    await Promise.all(imageIds.map(async (imageId, index) => {
      while (activeRequests >= maxConcurrent) {
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      }
      activeRequests++;
      
      try {
        if (!imageId.startsWith('wadors:')) {
          return;
        }
        
        try {
          const framesUrl = imageId.replace('wadors:', '');
          const metadataUrl = framesUrl.replace('/frames/1', '/metadata');
          
          const response = await AuthService.authenticatedFetch(metadataUrl);
          
          if (!response.ok) {
            return;
          }
          
          const metadataArray = await response.json();
          const metadata = metadataArray[0];
          
          if (!metadata || typeof metadata !== 'object') {
            return;
          }
          
          // Validate critical tags
          const criticalTags = ['00280010', '00280011', '00280100', '00280002', '00280004'];
          let isValid = true;
          
          for (const tag of criticalTags) {
            if (!metadata[tag]?.Value || !Array.isArray(metadata[tag].Value)) {
              isValid = false;
            }
          }
          
          // Add defaults for missing tags
          if (metadata['00280002']?.Value?.[0] === undefined) {
            if (!metadata['00280002']) metadata['00280002'] = { vr: 'US', Value: [1] };
            else if (!metadata['00280002'].Value) metadata['00280002'].Value = [1];
            else if (metadata['00280002'].Value[0] === undefined) metadata['00280002'].Value[0] = 1;
          }
          
          if (!metadata['00280004']?.Value?.[0]) {
            if (!metadata['00280004']) metadata['00280004'] = { vr: 'CS', Value: ['MONOCHROME2'] };
            else if (!metadata['00280004'].Value) metadata['00280004'].Value = ['MONOCHROME2'];
          }
          
          if (!isValid) {
            return;
          }
          
          dicomImageLoader.wadors.metaDataManager.add(imageId, metadata);
          
        } catch (error) {
          // Continue with other images
        }
      } finally {
        activeRequests--;
      }
    }));
    
  } catch (error) {
    throw error;
  }
}

// Global initialization
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
        maxWebWorkers: 4,
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
            maxConcurrency: 4,
            targetUtilization: 0.8
          }
        }
      });
      
      // Add fallback metadata provider
      try {
        const { metaData } = await import('@cornerstonejs/core');
        
        metaData.addProvider((type: string, imageId: string) => {
          if (type === 'generalSeriesModule' || type === 'generalImageModule') {
            return {
              modality: 'OT',
              numberOfFrames: 1,
              sopClassUID: '1.2.840.10008.5.1.4.1.1.7'
            };
          }
          return undefined;
        }, 1000);
        
      } catch (metaDataError) {
        // Ignore
      }
      
      await toolsInit();
      
      try {
        addTool(WindowLevelTool);
        addTool(ZoomTool);
        addTool(PanTool);
        addTool(LengthTool);
        addTool(RectangleROITool);
        addTool(EllipticalROITool);
      } catch (toolError) {
        throw new Error(`Tool registration failed: ${toolError.message}`);
      }
      
      isCornerstoneInitialized = true;
    } catch (error) {
      cornerstoneInitPromise = null;
      throw error;
    }
  })();
  
  await cornerstoneInitPromise;
};

interface ProjectionDicomViewerProps {
  imageIds: string[];
  studyMetadata: {
    patientName: string;
    patientId: string;
    studyDate: string;
    studyDescription: string;
    modality: string;
    studyInstanceUID?: string;
  };
  // DICOM overlay props
  showOverlay?: boolean;
  setShowOverlay?: (show: boolean) => void;
  examinations?: any[];
  enhancedDicomData?: any[];
}

type Tool = 'wwwc' | 'zoom' | 'pan' | 'length' | 'rectangle' | 'ellipse';

interface ImageSettings {
  windowLevel?: {
    windowWidth: number;
    windowCenter: number;
  };
  isInverted: boolean;
  isFlippedHorizontal: boolean;
  zoom?: number;
  pan?: { x: number; y: number };
}

const ProjectionDicomViewer: React.FC<ProjectionDicomViewerProps> = ({ 
  imageIds: initialImageIds, 
  studyMetadata,
  showOverlay = false,
  setShowOverlay,
  examinations = [],
  enhancedDicomData = []
}) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<any>(null);
  const toolGroupRef = useRef<any>(null);
  
  const [imageIds, setImageIds] = useState<string[]>(initialImageIds);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isInverted, setIsInverted] = useState<boolean>(false);
  const [isFlippedHorizontal, setIsFlippedHorizontal] = useState<boolean>(false);
  
  const initializationRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const imageSettingsRef = useRef<Map<number, ImageSettings>>(new Map());
  
  // Update local imageIds when prop changes
  useEffect(() => {
    setImageIds(initialImageIds);
  }, [initialImageIds]);

  // Save/restore per-image settings
  const saveCurrentImageSettings = useCallback(() => {
    if (!viewportRef.current) return;
    
    try {
      const properties = viewportRef.current.getProperties();
      const camera = viewportRef.current.getCamera();
      
      const settings: ImageSettings = {
        windowLevel: {
          windowWidth: properties.voiRange?.upper - properties.voiRange?.lower || 400,
          windowCenter: (properties.voiRange?.upper + properties.voiRange?.lower) / 2 || 200
        },
        isInverted,
        isFlippedHorizontal,
        zoom: camera.parallelScale,
        pan: {
          x: camera.focalPoint[0],
          y: camera.focalPoint[1]
        }
      };
      
      imageSettingsRef.current.set(currentImageIndex, settings);
    } catch (error) {
      // Ignore save errors
    }
  }, [currentImageIndex, isInverted, isFlippedHorizontal]);
  
  const restoreImageSettings = useCallback((imageIndex: number) => {
    if (!viewportRef.current) return;
    
    const settings = imageSettingsRef.current.get(imageIndex);
    if (!settings) return;
    
    try {
      // Restore window/level
      if (settings.windowLevel) {
        const properties = viewportRef.current.getProperties();
        const lowerBound = settings.windowLevel.windowCenter - settings.windowLevel.windowWidth / 2;
        const upperBound = settings.windowLevel.windowCenter + settings.windowLevel.windowWidth / 2;
        
        viewportRef.current.setProperties({
          ...properties,
          voiRange: { lower: lowerBound, upper: upperBound },
          invert: settings.isInverted
        });
      }
      
      // Restore zoom and pan
      if (settings.zoom && settings.pan) {
        const camera = viewportRef.current.getCamera();
        viewportRef.current.setCamera({
          ...camera,
          parallelScale: settings.zoom,
          focalPoint: [settings.pan.x, settings.pan.y, camera.focalPoint[2]]
        });
      }
      
      // Restore flip state
      const element = viewportRef.current.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = settings.isFlippedHorizontal ? 'scaleX(-1)' : 'scaleX(1)';
      }
      
      // Update UI state
      setIsInverted(settings.isInverted);
      setIsFlippedHorizontal(settings.isFlippedHorizontal);
      
      viewportRef.current.render();
      
    } catch (error) {
      // Ignore restore errors
    }
  }, []);

  // Safe render function
  const safeRender = useCallback((viewport: any) => {
    if (viewport) {
      try {
        viewport.render();
      } catch (renderError) {
        if (renderError.message?.includes('join') || renderError.message?.includes('RenderWindow')) {
          try {
            if (viewport && viewport.getRenderingEngine) {
              const engine = viewport.getRenderingEngine();
              if (engine) {
                engine.renderViewports([viewport.id]);
              }
            }
          } catch (altError) {
            // Ignore
          }
        }
      }
    }
  }, []);

  // Initialize Cornerstone3D
  useEffect(() => {
    if (initializationRef.current) return;
    
    if (!imageIds || imageIds.length === 0) {
      setLoading(false);
      return;
    }

    initializationRef.current = true;

    const waitForElement = async (maxRetries = 50) => {
      for (let i = 0; i < maxRetries; i++) {
        if (mainViewportRef.current && mainViewportRef.current.offsetParent !== null) {
          return mainViewportRef.current;
        }
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      }
      throw new Error('Viewport element not found after waiting');
    };

    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const element = await waitForElement();
        
        await initializeCornerstone();
        const renderingEngineId = `projectionDicomViewer-${Date.now()}`;
        const engine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = engine;

        const viewportId = `projectionViewport-${Date.now()}`;
        const viewportInput = {
          viewportId,
          element: element,
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        viewportRef.current = stackViewport;

        const startIndex = Math.min(currentImageIndex, imageIds.length - 1);
        
        try {
          await preRegisterWadorsMetadata(imageIds);
          
          // Check PhotometricInterpretation
          let shouldInvert = false;
          try {
            const { metaData } = await import('@cornerstonejs/core');
            const imagePixelModule = metaData.get('imagePixelModule', imageIds[startIndex]);
            if (imagePixelModule?.photometricInterpretation === 'MONOCHROME1') {
              shouldInvert = true;
            }
            setIsInverted(shouldInvert);
          } catch (metaErr) {
            // Ignore metadata errors
          }
          
          // Load single image (projection viewer loads one image at a time)
          await stackViewport.setStack([imageIds[startIndex]], 0);
          
          if (shouldInvert) {
            const properties = stackViewport.getProperties();
            stackViewport.setProperties({
              ...properties,
              invert: shouldInvert
            });
          }
          
        } catch (stackError) {
          throw stackError;
        }
        
        // Fit image to viewport
        stackViewport.resetCamera();
        stackViewport.render();
        
        // Apply CSS for proper display
        const canvas = stackViewport.canvas;
        if (canvas) {
          canvas.style.objectFit = 'contain';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
        }

        // Set up ResizeObserver
        if (element && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver((entries) => {
            if (engine && stackViewport) {
              setTimeout(() => {
                try {
                  engine.resize(true, true);
                  
                  setTimeout(() => {
                    stackViewport.resetCamera();
                    stackViewport.render();
                    
                    const canvas = stackViewport.canvas;
                    if (canvas) {
                      canvas.style.objectFit = 'contain';
                      canvas.style.width = '100%';
                      canvas.style.height = '100%';
                    }
                  }, 50);
                  
                } catch (engineResizeError) {
                  stackViewport.resetCamera();
                  stackViewport.render();
                }
              }, 100);
            }
          });
          
          resizeObserverRef.current.observe(element);
        }

        const toolGroupId = `projectionDicomViewerToolGroup-${Date.now()}`;
        
        try {
          ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch (e) {
          // Tool group doesn't exist
        }
        
        const tg = ToolGroupManager.createToolGroup(toolGroupId);
        toolGroupRef.current = tg;

        try {
          tg.addTool(WindowLevelTool.toolName);
          tg.addTool(ZoomTool.toolName);
          tg.addTool(PanTool.toolName);
          tg.addTool(LengthTool.toolName);
          tg.addTool(RectangleROITool.toolName);
          tg.addTool(EllipticalROITool.toolName);
        } catch (toolError) {
          throw new Error(`Tool group setup failed: ${toolError.message}`);
        }

        tg.addViewport(viewportId, renderingEngineId);

        try {
          tg.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ 
              mouseButton: MouseBindings.Primary,
              configuration: {
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
        } catch (activationError) {
          throw new Error(`Tool activation failed: ${activationError.message}`);
        }

        // Add event listener for window/level changes
        const viewportElement = stackViewport.element;
        viewportElement.addEventListener('cornerstoneimagerendered', () => {
          saveCurrentImageSettings();
        });

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        setLoading(false);
        initializationRef.current = false;
      }
    };

    const rafId = requestAnimationFrame(() => {
      init();
    });

    return () => {
      cancelAnimationFrame(rafId);
      initializationRef.current = false;
      
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      if (renderingEngineRef.current) {
        try {
          renderingEngineRef.current.destroy();
        } catch (e) {
          // Ignore
        }
      }
      
      if (toolGroupRef.current) {
        try {
          ToolGroupManager.destroyToolGroup(toolGroupRef.current.id);
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [imageIds]);

  // Tool management
  const setToolActive = useCallback((tool: Tool) => {
    if (!toolGroupRef.current) return;
    
    try {
      // Deactivate all tools first
      toolGroupRef.current.setToolPassive(WindowLevelTool.toolName);
      toolGroupRef.current.setToolPassive(ZoomTool.toolName);
      toolGroupRef.current.setToolPassive(PanTool.toolName);
      toolGroupRef.current.setToolPassive(LengthTool.toolName);
      toolGroupRef.current.setToolPassive(RectangleROITool.toolName);
      toolGroupRef.current.setToolPassive(EllipticalROITool.toolName);
      
      // Activate selected tool
      switch (tool) {
        case 'wwwc':
          toolGroupRef.current.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'zoom':
          toolGroupRef.current.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'pan':
          toolGroupRef.current.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'length':
          toolGroupRef.current.setToolActive(LengthTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'rectangle':
          toolGroupRef.current.setToolActive(RectangleROITool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'ellipse':
          toolGroupRef.current.setToolActive(EllipticalROITool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
      }
      
      setActiveTool(tool);
    } catch (error) {
      // Ignore tool activation errors
    }
  }, []);

  // Navigation functions
  const goToImage = useCallback(async (index: number) => {
    if (!viewportRef.current || index < 0 || index >= imageIds.length || index === currentImageIndex) {
      return;
    }

    try {
      // Save current image settings
      saveCurrentImageSettings();
      
      // Load the target image
      await viewportRef.current.setStack([imageIds[index]], 0);
      
      // Update current index
      setCurrentImageIndex(index);
      
      // Restore settings for the new image
      restoreImageSettings(index);
      
      // Check photometric interpretation for the new image
      try {
        const image = viewportRef.current.getCurrentImageData();
        if (image && image.metadata) {
          const photometricInterpretation = image.metadata.PhotometricInterpretation;
          const shouldInvert = photometricInterpretation === 'MONOCHROME1';
          
          if (shouldInvert !== isInverted) {
            setIsInverted(shouldInvert);
            
            const properties = viewportRef.current.getProperties();
            viewportRef.current.setProperties({
              ...properties,
              invert: shouldInvert
            });
            viewportRef.current.render();
          }
        }
      } catch (photoError) {
        // Ignore
      }
      
    } catch (error) {
      // Ignore navigation errors
    }
  }, [currentImageIndex, imageIds, saveCurrentImageSettings, restoreImageSettings, isInverted]);

  const nextImage = useCallback(() => {
    if (currentImageIndex < imageIds.length - 1) {
      goToImage(currentImageIndex + 1);
    }
  }, [currentImageIndex, imageIds.length, goToImage]);
  
  const prevImage = useCallback(() => {
    if (currentImageIndex > 0) {
      goToImage(currentImageIndex - 1);
    }
  }, [currentImageIndex, goToImage]);

  // Viewport manipulation functions
  const resetViewport = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.resetCamera();
      
      const properties = viewportRef.current.getProperties();
      viewportRef.current.setProperties({
        ...properties,
        invert: true
      });
      
      const element = viewportRef.current.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = 'scaleX(1)';
      }
      
      setIsInverted(true);
      setIsFlippedHorizontal(false);
      
      safeRender(viewportRef.current);
    }
  }, [safeRender]);

  const rotateImage = useCallback((degrees: number) => {
    if (viewportRef.current) {
      try {
        const camera = viewportRef.current.getCamera();
        const currentRotation = camera.viewUp || [0, -1, 0];
        
        const angle = (degrees * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const newViewUp = [
          currentRotation[0] * cos - currentRotation[1] * sin,
          currentRotation[0] * sin + currentRotation[1] * cos,
          currentRotation[2]
        ];
        
        viewportRef.current.setCamera({
          ...camera,
          viewUp: newViewUp
        });
        safeRender(viewportRef.current);
      } catch (error) {
        // Ignore
      }
    }
  }, [safeRender]);

  const flipHorizontal = useCallback(() => {
    if (viewportRef.current) {
      try {
        const newHorizontalState = !isFlippedHorizontal;
        setIsFlippedHorizontal(newHorizontalState);
        
        const element = viewportRef.current.element;
        const canvas = element.querySelector('canvas');
        if (canvas) {
          canvas.style.transform = newHorizontalState ? 'scaleX(-1)' : 'scaleX(1)';
        }
        
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore
      }
    }
  }, [isFlippedHorizontal, saveCurrentImageSettings]);

  const invertImage = useCallback(() => {
    if (viewportRef.current) {
      try {
        const newInvertState = !isInverted;
        setIsInverted(newInvertState);
        
        const properties = viewportRef.current.getProperties();
        viewportRef.current.setProperties({
          ...properties,
          invert: newInvertState
        });
        
        safeRender(viewportRef.current);
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore
      }
    }
  }, [isInverted, safeRender, saveCurrentImageSettings]);

  const clearAnnotations = useCallback(() => {
    if (viewportRef.current) {
      try {
        const frameOfReferenceUID = viewportRef.current.getFrameOfReferenceUID();
        
        annotation.state.removeAllAnnotations();
        
        if (frameOfReferenceUID) {
          annotation.state.removeFrameOfReferenceAnnotations(frameOfReferenceUID);
        }
        
        const element = viewportRef.current.element;
        if (element) {
          const svgLayer = element.querySelector('.cornerstone-svg-layer');
          if (svgLayer) {
            svgLayer.innerHTML = '';
          }
        }
        
        safeRender(viewportRef.current);
        
      } catch (error) {
        try {
          const element = viewportRef.current.element;
          if (element) {
            const svgLayer = element.querySelector('.cornerstone-svg-layer');
            if (svgLayer) {
              svgLayer.innerHTML = '';
              safeRender(viewportRef.current);
            }
          }
        } catch (fallbackError) {
          // Ignore
        }
      }
    }
  }, [safeRender]);

  const toggleOverlayVisibility = useCallback(() => {
    if (setShowOverlay) {
      setShowOverlay(!showOverlay);
    }
  }, [showOverlay, setShowOverlay]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prevImage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevImage, nextImage]);

  const retryViewer = useCallback(() => {
    setError(null);
    setLoading(true);
    
    initializationRef.current = false;
    isCornerstoneInitialized = false;
    cornerstoneInitPromise = null;
    
    if (renderingEngineRef.current) {
      try {
        renderingEngineRef.current.destroy();
      } catch (e) {
        // Ignore
      }
      renderingEngineRef.current = null;
    }
    if (toolGroupRef.current) {
      try {
        ToolGroupManager.destroyToolGroup(toolGroupRef.current.id);
      } catch (e) {
        // Ignore
      }
      toolGroupRef.current = null;
    }
    viewportRef.current = null;
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Images</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={retryViewer} className="w-full" variant="outline">
              Retry Loading
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b bg-background p-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tools */}
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
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Image manipulation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => rotateImage(90)}
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => rotateImage(-90)}
              title="Rotate 90° Counter-clockwise"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant={isFlippedHorizontal ? 'default' : 'ghost'}
              size="sm"
              onClick={flipHorizontal}
              title={isFlippedHorizontal ? "Remove Horizontal Flip" : "Flip Horizontal"}
            >
              <FlipHorizontal className="h-4 w-4" />
            </Button>
            <Button
              variant={!isInverted ? 'default' : 'ghost'}
              size="sm"
              onClick={invertImage}
              title={isInverted ? "Remove Inversion" : "Invert Colors"}
            >
              <Palette className="h-4 w-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevImage}
              disabled={currentImageIndex === 0}
              title="Previous Image"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2">
              {currentImageIndex + 1} / {imageIds.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextImage}
              disabled={currentImageIndex === imageIds.length - 1}
              title="Next Image"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Reset and clear */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetViewport}
              title="Reset View"
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleOverlayVisibility}
              title={showOverlay ? "Hide Info" : "Show Info"}
            >
              {showOverlay ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAnnotations}
              title="Clear All Annotations"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* DICOM Viewport */}
        <div
          ref={mainViewportRef}
          className="flex-1 bg-black"
          style={{ 
            minHeight: '400px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Card className="w-96">
                <CardHeader>
                  <CardTitle>Loading X-ray Images...</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-center text-sm text-muted-foreground">
                    Preparing {studyMetadata.modality} images for viewing...
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* DICOM Overlay - Positioned within viewport */}
          <DicomOverlay
            isVisible={showOverlay}
            studyMetadata={studyMetadata}
            examinations={examinations}
            enhancedDicomData={enhancedDicomData}
          />
        </div>
      </div>

      {/* Individual Image Thumbnails - Only show if multiple images */}
      {!loading && imageIds.length > 1 && (
        <div className="border-t bg-muted/5 p-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-sm font-medium text-muted-foreground mr-2">
              Images:
            </span>
            {imageIds.map((imageId, index) => (
              <div
                key={`${imageId}-${index}`}
                className="flex-shrink-0 flex flex-col items-center"
                title={`Image ${index + 1} of ${imageIds.length}`}
              >
                <ThumbnailImage
                  imageId={imageId}
                  index={index}
                  isActive={index === currentImageIndex}
                  onClick={() => goToImage(index)}
                />
                
                {/* Image number below thumbnail */}
                <div className="text-xs text-center mt-1">
                  Image {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Shared thumbnail rendering engine to prevent WebGL context leaks
let sharedThumbnailEngine: RenderingEngine | null = null;
let thumbnailEngineRefCount = 0;
let thumbnailEngineInitPromise: Promise<RenderingEngine> | null = null;

const getSharedThumbnailEngine = async () => {
  if (sharedThumbnailEngine) {
    thumbnailEngineRefCount++;
    return sharedThumbnailEngine;
  }
  
  if (thumbnailEngineInitPromise) {
    const engine = await thumbnailEngineInitPromise;
    thumbnailEngineRefCount++;
    return engine;
  }
  
  thumbnailEngineInitPromise = (async () => {
    await initializeCornerstone();
    sharedThumbnailEngine = new RenderingEngine(`sharedThumbnailEngine-${Date.now()}`);
    return sharedThumbnailEngine;
  })();
  
  const engine = await thumbnailEngineInitPromise;
  thumbnailEngineRefCount++;
  return engine;
};

const releaseSharedThumbnailEngine = () => {
  thumbnailEngineRefCount--;
  if (thumbnailEngineRefCount <= 0 && sharedThumbnailEngine) {
    try {
      sharedThumbnailEngine.destroy();
    } catch (e) {
      // Ignore destruction errors
    }
    sharedThumbnailEngine = null;
    thumbnailEngineInitPromise = null;
    thumbnailEngineRefCount = 0;
  }
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
  const [shouldLoad, setShouldLoad] = useState(false);
  const viewportIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  
  // Use Intersection Observer for lazy loading thumbnails
  useEffect(() => {
    const element = thumbRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingRef.current && !isLoaded) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    
    return () => observer.disconnect();
  }, [isLoaded]);
  
  useEffect(() => {
    if (!shouldLoad || isLoadingRef.current || isLoaded) return;
    
    const element = thumbRef.current;
    if (!element || !imageId) return;

    isLoadingRef.current = true;
    let mounted = true;
    
    const loadThumbnail = async () => {
      try {
        if (!mounted) return;
        
        const thumbEngine = await getSharedThumbnailEngine();
        
        if (!mounted) return;
        
        const thumbViewportId = `thumbViewport-${index}-persistent`;
        viewportIdRef.current = thumbViewportId;
        
        const thumbViewportInput = {
          viewportId: thumbViewportId,
          element: element,
          type: ViewportType.STACK,
        };

        thumbEngine.enableElement(thumbViewportInput);
        const thumbViewport = thumbEngine.getViewport(thumbViewportId);
        
        const loadPromise = (thumbViewport as any).setStack([imageId], 0);
        const timeoutPromise = new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('Thumbnail load timeout')), 8000);
          return timer;
        });
        
        await Promise.race([loadPromise, timeoutPromise]);
        
        if (!mounted) return;
        
        let renderAttempts = 0;
        const maxRenderAttempts = 3;
        
        const attemptRender = () => {
          try {
            thumbViewport.resetCamera();
            thumbViewport.render();
            if (mounted) {
              setIsLoaded(true);
              isLoadingRef.current = false;
            }
          } catch (renderError) {
            renderAttempts++;
            if (renderAttempts < maxRenderAttempts && mounted) {
              requestAnimationFrame(attemptRender);
            } else {
              isLoadingRef.current = false;
              if (mounted) {
                setError(true);
              }
            }
          }
        };
        
        attemptRender();
        
      } catch (err) {
        isLoadingRef.current = false;
        if (mounted) {
          setError(true);
        }
      }
    };

    loadThumbnail();
    
    return () => {
      mounted = false;
      if (viewportIdRef.current && sharedThumbnailEngine) {
        try {
          sharedThumbnailEngine.disableElement(viewportIdRef.current);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      releaseSharedThumbnailEngine();
    };
  }, [shouldLoad, imageId, index]);

  const handleClick = () => {
    if (isLoaded && !error) {
      onClick();
    }
  };

  return (
    <div
      ref={thumbRef}
      className={`
        relative w-16 h-16 cursor-pointer border-2 rounded-lg overflow-hidden transition-all
        ${isActive 
          ? 'border-primary ring-2 ring-primary/20' 
          : 'border-muted hover:border-primary/50'
        }
        ${!isLoaded && !error ? 'bg-muted animate-pulse' : ''}
        ${error ? 'bg-red-100 border-red-300' : ''}
      `}
      onClick={handleClick}
    >
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">
          <div className="text-xs">✗</div>
        </div>
      )}
    </div>
  );
};

export default ProjectionDicomViewer;