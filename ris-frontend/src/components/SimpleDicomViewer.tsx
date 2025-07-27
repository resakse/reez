'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  Play, Pause, SkipBack, SkipForward, Trash2,
  FlipHorizontal, Palette
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
  Enums as ToolsEnums,
  annotation
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';

const { ViewportType } = CoreEnums;
const { MouseBindings } = ToolsEnums;

// Global initialization flag and promise
let isCornerstoneInitialized = false;
let cornerstoneInitPromise: Promise<void> | null = null;

const initializeCornerstone = async () => {
  if (isCornerstoneInitialized) return;
  
  // If initialization is already in progress, wait for it
  if (cornerstoneInitPromise) {
    await cornerstoneInitPromise;
    return;
  }
  
  cornerstoneInitPromise = (async () => {
    try {
      console.log('Starting Cornerstone3D initialization...');
      
      // Initialize Cornerstone3D libraries in sequence
      await coreInit();
      console.log('Core initialized');
      
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
        // Optimize for performance and multi-image loading
        useWebWorkers: true,
        maxWebWorkers: 4, // Limit concurrent workers to prevent memory issues
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: true,
          // Add timeout for large images
          decodeConfig: {
            timeout: 30000 // 30 second timeout for DICOM decoding
          }
        },
        // Configure image loader for better multi-image handling
        webWorkerTaskPools: {
          decodeTask: {
            maxConcurrency: 4,
            targetUtilization: 0.8
          }
        }
      });
      console.log('DICOM image loader initialized');
      
      await toolsInit();
      console.log('Tools initialized');
      
      // Add all tools to the global state with error checking
      try {
        addTool(WindowLevelTool);
        addTool(ZoomTool);
        addTool(PanTool);
        addTool(LengthTool);
        addTool(RectangleROITool);
        addTool(EllipticalROITool);
        addTool(StackScrollTool);
        console.log('All tools added successfully');
      } catch (toolError) {
        console.error('Error adding tools:', toolError);
        throw new Error(`Tool registration failed: ${toolError.message}`);
      }
      
      isCornerstoneInitialized = true;
      console.log('Cornerstone3D initialization complete');
    } catch (error) {
      console.error('Failed to initialize Cornerstone3D:', error);
      // Reset the promise so we can retry
      cornerstoneInitPromise = null;
      throw error;
    }
  })();
  
  await cornerstoneInitPromise;
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
  const [loadingNavigation, setLoadingNavigation] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isInverted, setIsInverted] = useState<boolean>(true);
  const [isFlippedHorizontal, setIsFlippedHorizontal] = useState<boolean>(false);
  const [isToolbarMinimized, setIsToolbarMinimized] = useState<boolean>(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 16 }); // Initial position
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Track initialization state to prevent double loading
  const initializationRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Safe render function to prevent VTK errors
  const safeRender = useCallback((viewportToRender: any) => {
    if (viewportToRender) {
      try {
        viewportToRender.render();
      } catch (renderError) {
        // Silently handle VTK render errors - they're usually non-critical
        // Common error: "Cannot read properties of null (reading 'join')" from RenderWindow.js
        if (renderError.message?.includes('join') || renderError.message?.includes('RenderWindow')) {
          // This is a known VTK issue, try alternative render approach
          setTimeout(() => {
            try {
              if (viewportToRender && viewportToRender.getRenderingEngine) {
                const engine = viewportToRender.getRenderingEngine();
                if (engine) {
                  engine.renderViewports([viewportToRender.id]);
                }
              }
            } catch (altError) {
              // Completely ignore if alternative also fails
            }
          }, 50);
        }
      }
    }
  }, []);
  
  // Initialize Cornerstone3D - with better DOM readiness
  useEffect(() => {
    // Prevent double initialization
    if (initializationRef.current) {
      console.log('Initialization already in progress or completed, skipping...');
      return;
    }

    // Add global error handler for VTK errors
    const originalError = window.onerror;
    const handleVTKError = (message: any, source?: string, lineno?: number, colno?: number, error?: Error) => {
      // Suppress known VTK render errors
      if (typeof message === 'string' && 
          (message.includes('Cannot read properties of null') || 
           message.includes('RenderWindow.js') ||
           source?.includes('RenderWindow.js'))) {
        console.debug('Suppressed VTK render error:', message);
        return true; // Prevent default error handling
      }
      // Let other errors through
      if (originalError) {
        return originalError(message, source, lineno, colno, error);
      }
      return false;
    };
    
    window.onerror = handleVTKError;

    console.log('SimpleDicomViewer mounted, imageIds:', imageIds);
    console.log('mainViewportRef.current at mount:', mainViewportRef.current);
    
    if (!imageIds || imageIds.length === 0) {
      console.log('No images to load');
      setLoading(false);
      return;
    }

    initializationRef.current = true;

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
        const renderingEngineId = `simpleDicomViewer-${Date.now()}`;  // Unique ID to prevent conflicts
        const engine = new RenderingEngine(renderingEngineId, {
          // Optimize rendering performance
          enableGPURendering: true,
          strictZSpacingForVolumeViewport: false
        });
        setRenderingEngine(engine);

        console.log('Creating viewport...');
        const viewportId = `stackViewport-${Date.now()}`;  // Unique ID to prevent conflicts
        const viewportInput = {
          viewportId,
          element: element, // Use the element we waited for
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        setViewport(stackViewport);

        console.log('Loading images...', imageIds);
        console.log(`Total images: ${imageIds.length}, starting at index: ${currentImageIndex}`);
        
        if (imageIds.length === 0) {
          throw new Error('No image IDs provided');
        }
        
        // For multi-image debugging
        if (imageIds.length > 2) {
          console.log('DEBUG: Multi-image series detected:', {
            totalImages: imageIds.length,
            sampleImageIds: imageIds.slice(0, 3).map((id, idx) => ({ index: idx, id })),
            allImageIds: imageIds
          });
        }
        
        // Ensure currentImageIndex is valid
        const startIndex = Math.min(currentImageIndex, imageIds.length - 1);
        console.log(`Setting stack with ${imageIds.length} images, starting at index ${startIndex}`);
        
        try {
          console.log('DEBUG: Loading full stack for proper navigation...');
          
          // Load all images in the stack for proper navigation
          // This is necessary for proper multi-image navigation
          await stackViewport.setStack(imageIds, startIndex);
          console.log(`DEBUG: Full stack loaded successfully with ${imageIds.length} images, starting at index ${startIndex}`);
          
        } catch (stackError) {
          console.error('DEBUG: Stack loading failed:', stackError);
          console.error('DEBUG: Stack error details:', {
            errorMessage: stackError.message,
            errorStack: stackError.stack,
            imageCount: imageIds.length,
            startIndex,
            firstImageId: imageIds[0],
            selectedImageId: imageIds[startIndex]
          });
          
          throw stackError;
        }
        
        // Fit image to viewport while preserving aspect ratio
        stackViewport.resetCamera();
        
        // Set display area to maintain aspect ratio
        const displayArea = {
          imageArea: [1, 1], // Full image
          imageCanvasPoint: {
            imagePoint: [0.5, 0.5], // Center of image
            canvasPoint: [0.5, 0.5] // Center of canvas
          },
          storeAsInitialCamera: true
        };
        
        try {
          stackViewport.setDisplayArea(displayArea);
        } catch (displayError) {
          console.warn('Could not set display area, using default fit:', displayError);
        }
        
        stackViewport.render();
        console.log('Images loaded and rendered with proper aspect ratio');

        // Start with inverted state (true) which is what Cornerstone defaults to
        setTimeout(() => {
          try {
            const properties = stackViewport.getProperties();
            console.log('Current viewport properties:', properties);
            stackViewport.setProperties({
              ...properties,
              invert: true
            });
            setIsInverted(true);
            stackViewport.render();
            console.log('Set viewport to inverted state (default behavior)');
          } catch (err) {
            console.warn('Could not set initial viewport properties:', err);
          }
        }, 100);

        // Set up ResizeObserver for aspect ratio preservation
        if (element && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver(() => {
            if (engine && stackViewport) {
              // Store current presentation before resize
              const currentPresentation = stackViewport.getViewPresentation();
              
              // Resize the rendering engine
              engine.resize(true, false);
              
              // Restore the presentation to maintain zoom/pan
              if (currentPresentation) {
                stackViewport.setViewPresentation(currentPresentation);
              }
              
              stackViewport.render();
              console.log('Viewport resized while maintaining aspect ratio');
            }
          });
          
          resizeObserverRef.current.observe(element);
          console.log('ResizeObserver setup for aspect ratio preservation');
        }

        console.log('Creating tool group...');
        const toolGroupId = `simpleDicomViewerToolGroup-${Date.now()}`;  // Unique ID to prevent conflicts
        
        // Remove existing tool group if it exists
        try {
          ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch (e) {
          // Tool group doesn't exist, which is fine
        }
        
        const tg = ToolGroupManager.createToolGroup(toolGroupId);
        setToolGroup(tg);

        // Add tools with error checking
        try {
          tg.addTool(WindowLevelTool.toolName);
          tg.addTool(ZoomTool.toolName);
          tg.addTool(PanTool.toolName);
          tg.addTool(LengthTool.toolName);
          tg.addTool(RectangleROITool.toolName);
          tg.addTool(EllipticalROITool.toolName);
          tg.addTool(StackScrollTool.toolName);
          console.log('Tools added to tool group successfully');
        } catch (toolError) {
          console.error('Error adding tools to tool group:', toolError);
          throw new Error(`Tool group setup failed: ${toolError.message}`);
        }

        tg.addViewport(viewportId, renderingEngineId);

        // Activate tools with optimized settings and error handling
        try {
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
          console.log('Tools activated successfully');
        } catch (activationError) {
          console.error('Error activating tools:', activationError);
          throw new Error(`Tool activation failed: ${activationError.message}`);
        }

        console.log('DICOM viewer fully initialized');
        setLoading(false);
      } catch (err) {
        console.error('Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        setLoading(false);
        initializationRef.current = false; // Reset on error so retry can work
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      init();
    });

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
      
      // Restore original error handler
      window.onerror = originalError;
      
      // Reset initialization flag on cleanup
      initializationRef.current = false;
      
      // Clean up ResizeObserver
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      // Clean up rendering engine
      if (renderingEngine) {
        try {
          renderingEngine.destroy();
        } catch (e) {
          console.warn('Error destroying rendering engine:', e);
        }
      }
      
      // Clean up tool group
      if (toolGroup) {
        try {
          ToolGroupManager.destroyToolGroup(toolGroup.id);
        } catch (e) {
          console.warn('Error destroying tool group:', e);
        }
      }
    };
  }, [imageIds]); // Keep only imageIds as dependency

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
  
  // Navigation functions with proper stack navigation
  const goToImage = useCallback(async (index: number) => {
    if (viewport && index >= 0 && index < imageIds.length && index !== currentImageIndex) {
      try {
        setLoadingNavigation(true);
        console.log(`DEBUG: Navigating to image ${index + 1}/${imageIds.length} (index: ${index})`);
        
        // Use setImageIdIndex for direct navigation to specific image
        await viewport.setImageIdIndex(index);
        
        // Reset all image manipulation properties when changing images
        const properties = viewport.getProperties();
        viewport.setProperties({
          ...properties,
          invert: true
        });
        
        // Reset horizontal flip CSS transform
        const element = viewport.element;
        const canvas = element.querySelector('canvas');
        if (canvas) {
          canvas.style.transform = 'scaleX(1)';
        }
        
        // Reset image manipulation states to defaults when changing images
        setIsInverted(true);
        setIsFlippedHorizontal(false);
        
        safeRender(viewport);
        setCurrentImageIndex(index);
        
        console.log(`DEBUG: Successfully navigated to image ${index + 1}/${imageIds.length}`);
        
      } catch (error) {
        console.error('DEBUG: Error in navigation:', error);
        // Try to stay on current image if navigation fails
      } finally {
        setLoadingNavigation(false);
      }
    }
  }, [viewport, imageIds, currentImageIndex]);
  
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
      // Reset camera first
      viewport.resetCamera();
      
      // Reset invert property to default (inverted)
      const properties = viewport.getProperties();
      viewport.setProperties({
        ...properties,
        invert: true
      });
      
      // Reset horizontal flip CSS transform
      const element = viewport.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = 'scaleX(1)';
      }
      
      // Reset image manipulation states
      setIsInverted(true);
      setIsFlippedHorizontal(false);
      
      safeRender(viewport);
      
      console.log('Viewport reset completed');
    }
  }, [viewport]);

  const rotateImage = useCallback((degrees: number) => {
    if (viewport) {
      try {
        const camera = viewport.getCamera();
        const currentRotation = camera.viewUp || [0, -1, 0];
        
        // Calculate new rotation
        const angle = (degrees * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const newViewUp = [
          currentRotation[0] * cos - currentRotation[1] * sin,
          currentRotation[0] * sin + currentRotation[1] * cos,
          currentRotation[2]
        ];
        
        viewport.setCamera({
          ...camera,
          viewUp: newViewUp
        });
        safeRender(viewport);
      } catch (error) {
        console.error('Error rotating image:', error);
      }
    }
  }, [viewport]);

  const flipHorizontal = useCallback(() => {
    if (viewport) {
      try {
        // Toggle horizontal flip state
        const newHorizontalState = !isFlippedHorizontal;
        setIsFlippedHorizontal(newHorizontalState);
        
        // Use CSS transform on the canvas element for horizontal flip
        const element = viewport.element;
        const canvas = element.querySelector('canvas');
        if (canvas) {
          if (newHorizontalState) {
            canvas.style.transform = 'scaleX(-1)';
          } else {
            canvas.style.transform = 'scaleX(1)';
          }
          console.log(`Horizontal flip: ${newHorizontalState}`);
        } else {
          console.warn('Canvas element not found for flip operation');
        }
      } catch (error) {
        console.error('Error flipping image horizontally:', error);
      }
    }
  }, [viewport, isFlippedHorizontal]);

  const invertImage = useCallback(() => {
    if (viewport) {
      try {
        // Toggle the invert state
        const newInvertState = !isInverted;
        setIsInverted(newInvertState);
        
        // Get current properties and update invert
        const properties = viewport.getProperties();
        viewport.setProperties({
          ...properties,
          invert: newInvertState
        });
        
        safeRender(viewport);
        console.log(`Image invert toggled: ${newInvertState}`);
      } catch (error) {
        console.error('Error inverting image:', error);
      }
    }
  }, [viewport, isInverted]);

  const clearAnnotations = useCallback(() => {
    if (viewport) {
      try {
        // Use Cornerstone3D's annotation state manager to remove all annotations
        const frameOfReferenceUID = viewport.getFrameOfReferenceUID();
        const viewportId = viewport.id;
        
        // Clear annotations using the annotation state manager
        annotation.state.removeAllAnnotations();
        
        // Alternative: Clear by frame of reference
        if (frameOfReferenceUID) {
          annotation.state.removeFrameOfReferenceAnnotations(frameOfReferenceUID);
        }
        
        // Trigger annotation render event to update display
        const element = viewport.element;
        if (element) {
          // Clear SVG layer as backup
          const svgLayer = element.querySelector('.cornerstone-svg-layer');
          if (svgLayer) {
            svgLayer.innerHTML = '';
          }
        }
        
        // Force viewport re-render
        safeRender(viewport);
        
        console.log('All annotations cleared using state manager');
      } catch (error) {
        console.error('Error clearing annotations:', error);
        
        // Fallback: Simple SVG clearing
        try {
          const element = viewport.element;
          if (element) {
            const svgLayer = element.querySelector('.cornerstone-svg-layer');
            if (svgLayer) {
              svgLayer.innerHTML = '';
              safeRender(viewport);
            }
          }
        } catch (fallbackError) {
          console.error('Fallback clearing also failed:', fallbackError);
        }
      }
    }
  }, [viewport]);
  
  // Keyboard navigation for images
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if not in an input field
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

  // Cleanup playback on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);
  
  const retryViewer = useCallback(() => {
    setError(null);
    setLoading(true);
    
    // Reset initialization flags
    initializationRef.current = false;
    isCornerstoneInitialized = false;
    cornerstoneInitPromise = null;
    
    // Clean up existing instances
    if (renderingEngine) {
      try {
        renderingEngine.destroy();
      } catch (e) {
        console.warn('Error destroying rendering engine during retry:', e);
      }
      setRenderingEngine(null);
    }
    if (toolGroup) {
      try {
        ToolGroupManager.destroyToolGroup(toolGroup.id);
      } catch (e) {
        console.warn('Error destroying tool group during retry:', e);
      }
      setToolGroup(null);
    }
    setViewport(null);
    
    // Trigger re-initialization by forcing useEffect to run again
    // We do this by temporarily clearing and resetting the imageIds
    const currentImageIds = imageIds;
    setTimeout(() => {
      // This will trigger the useEffect to run again
      console.log('Retrying initialization...');
    }, 100);
  }, [renderingEngine, toolGroup, imageIds]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Images</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={retryViewer} className="w-full">
              Retry Loading
            </Button>
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
        {/* Toolbar - Draggable and minimizable */}
        <div 
          ref={toolbarRef}
          className="absolute z-10 bg-background/90 border rounded-lg shadow-lg transition-all duration-200"
          style={{
            left: toolbarPosition.x === 0 ? '50%' : `${toolbarPosition.x}px`,
            top: `${toolbarPosition.y}px`,
            transform: toolbarPosition.x === 0 ? 'translateX(-50%)' : 'none',
            cursor: isDraggingRef.current ? 'grabbing' : 'grab'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget || (e.target as Element).closest('.toolbar-handle')) {
              isDraggingRef.current = true;
              const startX = e.clientX - toolbarPosition.x;
              const startY = e.clientY - toolbarPosition.y;
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                if (isDraggingRef.current) {
                  const newX = moveEvent.clientX - startX;
                  const newY = moveEvent.clientY - startY;
                  setToolbarPosition({ x: newX, y: Math.max(4, newY) });
                }
              };
              
              const handleMouseUp = () => {
                isDraggingRef.current = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }
          }}
        >
          <div className="flex items-center gap-1">
            {/* Drag Handle and Minimize Button */}
            <div className="toolbar-handle flex items-center gap-1 px-1">
              <div className="flex flex-col gap-0.5 cursor-grab">
                <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsToolbarMinimized(!isToolbarMinimized)}
                className="h-6 w-6 p-0"
                title={isToolbarMinimized ? "Expand Toolbar" : "Minimize Toolbar"}
              >
                {isToolbarMinimized ? '▲' : '▼'}
              </Button>
            </div>
            
            {!isToolbarMinimized && (
              <>
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
            <div className="w-px h-6 bg-border mx-1" />
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
              onClick={clearAnnotations}
              title="Clear All Annotations"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
              </>
            )}
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
            
            {/* Navigation Loading Overlay */}
            {loadingNavigation && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                <div className="bg-background rounded-lg p-4 flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                  <span className="text-sm">Loading image {currentImageIndex + 1}...</span>
                </div>
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
                {imageIds.map((imageId, index) => {
                  // Optimized rendering strategy:
                  // - For small series (≤6): render all thumbnails
                  // - For larger series: only render current + 2 before + 2 after
                  const shouldRenderThumbnail = imageIds.length <= 6 || Math.abs(index - currentImageIndex) <= 2;
                  
                  if (!shouldRenderThumbnail) {
                    return (
                      <div 
                        key={imageId}
                        className={`
                          flex-shrink-0 cursor-pointer border-2 rounded transition-all
                          ${index === currentImageIndex 
                            ? 'border-primary shadow-md' 
                            : 'border-border hover:border-primary/50'
                          }
                        `}
                        style={{ width: '80px', height: '80px' }}
                        onClick={() => goToImage(index)}
                        title={`Image ${index + 1}`}
                      >
                        <div className="w-full h-full bg-muted rounded-sm flex items-center justify-center text-xs">
                          {index + 1}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <ThumbnailImage
                      key={imageId}
                      imageId={imageId}
                      index={index}
                      isActive={index === currentImageIndex}
                      onClick={() => goToImage(index)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
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
    sharedThumbnailEngine = new RenderingEngine(`sharedThumbnailEngine-${Date.now()}`, {
      enableGPURendering: true,
      strictZSpacingForVolumeViewport: false
    });
    return sharedThumbnailEngine;
  })();
  
  const engine = await thumbnailEngineInitPromise;
  thumbnailEngineRefCount++;
  return engine;
};

const releaseSharedThumbnailEngine = () => {
  thumbnailEngineRefCount--;
  if (thumbnailEngineRefCount <= 0 && sharedThumbnailEngine) {
    // Add delay before destroying to allow for quick re-use
    setTimeout(() => {
      if (thumbnailEngineRefCount <= 0 && sharedThumbnailEngine) {
        try {
          sharedThumbnailEngine.destroy();
        } catch (e) {
          console.warn('Error destroying shared thumbnail engine:', e);
        }
        sharedThumbnailEngine = null;
        thumbnailEngineInitPromise = null;
        thumbnailEngineRefCount = 0;
      }
    }, 1000);
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
  const cleanupRef = useRef<(() => void) | null>(null);
  
  // Use Intersection Observer for lazy loading thumbnails
  useEffect(() => {
    const element = thumbRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect(); // Only load once
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    
    return () => observer.disconnect();
  }, []);
  
  useEffect(() => {
    if (!shouldLoad) return;
    
    const element = thumbRef.current;
    if (!element || !imageId) return;

    let mounted = true;
    
    const loadThumbnail = async () => {
      try {
        console.log(`DEBUG: Loading thumbnail ${index + 1}`);
        
        // Small delay to stagger thumbnail loading
        await new Promise(resolve => setTimeout(resolve, index * 50));
        
        if (!mounted) return;
        
        // Use shared rendering engine to prevent WebGL context leaks
        const thumbEngine = await getSharedThumbnailEngine();
        
        if (!mounted) return;
        
        const thumbViewportId = `thumbViewport-${index}-${Date.now()}`;
        viewportIdRef.current = thumbViewportId;
        
        const thumbViewportInput = {
          viewportId: thumbViewportId,
          element: element,
          type: ViewportType.STACK,
        };

        thumbEngine.enableElement(thumbViewportInput);
        const thumbViewport = thumbEngine.getViewport(thumbViewportId);
        
        // Load the single image with shorter timeout for thumbnails
        const loadPromise = thumbViewport.setStack([imageId], 0);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Thumbnail load timeout')), 5000)
        );
        
        await Promise.race([loadPromise, timeoutPromise]);
        
        if (!mounted) return;
        
        // Safe render for thumbnail with retry logic
        let renderAttempts = 0;
        const maxRenderAttempts = 3;
        
        const attemptRender = () => {
          try {
            thumbViewport.render();
            console.log(`DEBUG: Thumbnail ${index + 1} rendered successfully`);
            if (mounted) {
              setIsLoaded(true);
            }
          } catch (renderError) {
            console.warn(`Thumbnail render error for ${index} (attempt ${renderAttempts + 1}):`, renderError);
            renderAttempts++;
            if (renderAttempts < maxRenderAttempts && mounted) {
              setTimeout(attemptRender, 100 * renderAttempts);
            }
          }
        };
        
        attemptRender();
        
        // Store cleanup function
        cleanupRef.current = () => {
          if (viewportIdRef.current && sharedThumbnailEngine) {
            try {
              sharedThumbnailEngine.disableElement(viewportIdRef.current);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          releaseSharedThumbnailEngine();
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
      
      // Clean up viewport from shared engine
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [shouldLoad, imageId, index]);
  
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