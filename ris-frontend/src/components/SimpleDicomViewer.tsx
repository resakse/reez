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

// Fixed WADO-RS metadata pre-registration for proper image loading
async function preRegisterWadorsMetadata(imageIds: string[]): Promise<void> {
  try {
    console.log('DEBUG: Pre-registering WADO-RS metadata for', imageIds.length, 'images');
    
    // Get the DICOM image loader from window or import
    const dicomImageLoader = (window as any).cornerstoneDICOMImageLoader || cornerstoneDICOMImageLoader;
    
    if (!dicomImageLoader?.wadors?.metaDataManager) {
      console.warn('DEBUG: WADO-RS metadata manager not available, skipping pre-registration');
      return;
    }
    
    // Process images in smaller batches to avoid overwhelming the server
    const batchSize = 5;
    
    for (let i = 0; i < imageIds.length; i += batchSize) {
      const batch = imageIds.slice(i, Math.min(i + batchSize, imageIds.length));
      
      await Promise.all(batch.map(async (imageId, batchIndex) => {
        if (!imageId.startsWith('wadors:')) {
          return; // Skip non-WADO-RS images
        }
        
        try {
          // Extract frames URL and convert to metadata URL
          const framesUrl = imageId.replace('wadors:', '');
          const metadataUrl = framesUrl.replace('/frames/1', '/metadata');
          
          console.log(`DEBUG: Fetching metadata ${i + batchIndex + 1}/${imageIds.length}`);
          
          // Fetch metadata from our endpoint
          const response = await AuthService.authenticatedFetch(metadataUrl);
          
          if (!response.ok) {
            console.warn(`Failed to fetch metadata for image ${i + batchIndex + 1}: ${response.status}`);
            return;
          }
          
          const metadataArray = await response.json();
          const metadata = metadataArray[0]; // WADO-RS returns array format
          
          // Validate metadata structure
          if (!metadata || typeof metadata !== 'object') {
            console.warn(`Invalid metadata structure for image ${i + batchIndex + 1}`);
            return;
          }
          
          // Ensure critical tags are present and properly formatted
          const criticalTags = ['00280010', '00280011', '00280100', '00280002', '00280004'];
          let isValid = true;
          
          for (const tag of criticalTags) {
            if (!metadata[tag]?.Value || !Array.isArray(metadata[tag].Value)) {
              console.warn(`Missing or invalid critical tag ${tag} in image ${i + batchIndex + 1}`);
              isValid = false;
            }
          }
          
          if (!isValid) {
            console.warn(`Skipping registration of image ${i + batchIndex + 1} due to invalid metadata`);
            return;
          }
          
          // CRITICAL: Register metadata with Cornerstone WADO-RS metadata manager
          // This follows the exact pattern from Cornerstone3D documentation
          console.log(`DEBUG: Registering metadata for imageId: ${imageId}`);
          console.log(`DEBUG: BulkDataURI: ${metadata["7fe00010"]?.BulkDataURI}`);
          
          dicomImageLoader.wadors.metaDataManager.add(imageId, metadata);
          
          // Verify registration worked
          const retrievedMetadata = dicomImageLoader.wadors.metaDataManager.get(imageId);
          if (retrievedMetadata) {
            console.log(`DEBUG: ✅ Successfully registered metadata for image ${i + batchIndex + 1}`);
            console.log(`DEBUG: Verified BulkDataURI: ${retrievedMetadata["7fe00010"]?.BulkDataURI}`);
          } else {
            console.warn(`DEBUG: ❌ Failed to verify metadata registration for image ${i + batchIndex + 1}`);
          }
          
        } catch (error) {
          console.warn(`Error pre-registering metadata for image ${i + batchIndex + 1}:`, error);
          // Continue with other images even if one fails
        }
      }));
      
      // Small delay between batches to avoid overwhelming the server
      if (i + batchSize < imageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('DEBUG: Completed WADO-RS metadata pre-registration');
    
  } catch (error) {
    console.error('DEBUG: Critical error in WADO-RS metadata pre-registration:', error);
    throw error; // Re-throw to handle at higher level
  }
}


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
        maxWebWorkers: 2, // Reduce to prevent memory/worker issues
        strict: false, // Allow more lenient DICOM parsing
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: true,
          // Add more robust decoding options
          usePDFJS: false,
          useWebGL: false, // Disable WebGL to prevent GPU issues
        },
        // Configure image loader for better error handling
        errorInterceptor: (error: any) => {
          console.error('DICOM Image Loader Error Details:', {
            message: error.message,
            stack: error.stack,
            imageId: error.imageId,
            request: error.request,
            response: error.response
          });
          // Don't throw - let the viewer handle gracefully
          return error;
        },
        // Simplified web worker config
        webWorkerTaskPools: {
          decodeTask: {
            maxConcurrency: 2,
            targetUtilization: 0.6 // Lower utilization to prevent overload
          }
        }
      });
      console.log('DICOM image loader initialized');
      
      // Verify WADO-RS support is available
      const dicomImageLoader = (window as any).cornerstoneDICOMImageLoader || cornerstoneDICOMImageLoader;
      if (dicomImageLoader?.wadors?.metaDataManager) {
        console.log('DEBUG: ✅ WADO-RS metadata manager is available');
      } else {
        console.warn('DEBUG: ❌ WADO-RS metadata manager not available');
        console.log('DEBUG: Checking both window and imported sources...');
        console.log('DEBUG: window.cornerstoneDICOMImageLoader:', typeof (window as any).cornerstoneDICOMImageLoader);
        console.log('DEBUG: imported cornerstoneDICOMImageLoader:', typeof cornerstoneDICOMImageLoader);
      }
      
      // Add a fallback metadata provider to prevent undefined errors
      try {
        const { metaData } = await import('@cornerstonejs/core');
        
        // Add a high-priority fallback provider for essential metadata
        metaData.addProvider((type: string, imageId: string) => {
          if (type === 'generalSeriesModule' || type === 'generalImageModule') {
            // Provide fallback modality information to prevent NM helper errors
            return {
              modality: 'OT', // Default to 'Other' to prevent NM-specific errors
              numberOfFrames: 1,
              sopClassUID: '1.2.840.10008.5.1.4.1.1.7' // Secondary Capture SOP Class
            };
          }
          return undefined;
        }, 1000); // High priority fallback
        
        console.log('DEBUG: ✅ Fallback metadata provider registered');
      } catch (metaDataError) {
        console.warn('DEBUG: Could not register fallback metadata provider:', metaDataError);
      }
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

interface SeriesInfo {
  seriesId: string;
  seriesInstanceUID: string;
  seriesDescription: string;
  instanceCount: number;
}

interface SimpleDicomViewerProps {
  imageIds: string[];
  seriesInfo?: SeriesInfo[];
  studyMetadata: {
    patientName: string;
    patientId: string;
    studyDate: string;
    studyDescription: string;
    modality: string;
    studyInstanceUID?: string;
  };
}

type Tool = 'wwwc' | 'zoom' | 'pan' | 'length' | 'rectangle' | 'ellipse';

// Interface for per-image settings
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

const SimpleDicomViewer: React.FC<SimpleDicomViewerProps> = ({ imageIds, seriesInfo = [], studyMetadata }) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const [renderingEngine, setRenderingEngine] = useState<RenderingEngine | null>(null);
  const [viewport, setViewport] = useState<any>(null);
  const [toolGroup, setToolGroup] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingNavigation, setLoadingNavigation] = useState<boolean>(false);
  const [backgroundLoading, setBackgroundLoading] = useState<boolean>(false);
  const [isStackLoading, setIsStackLoading] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isInverted, setIsInverted] = useState<boolean>(true);  // Default to inverted for X-rays
  const [isFlippedHorizontal, setIsFlippedHorizontal] = useState<boolean>(false);
  const [isToolbarMinimized, setIsToolbarMinimized] = useState<boolean>(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 16 }); // Initial position
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Store per-image settings
  const imageSettingsRef = useRef<Map<number, ImageSettings>>(new Map());
  const saveSettingsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track initialization state to prevent double loading
  const initializationRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Helper functions for per-image settings
  const saveCurrentImageSettings = useCallback(() => {
    if (!viewport) return;
    
    try {
      const properties = viewport.getProperties();
      const camera = viewport.getCamera();
      
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
      console.log(`DEBUG: Saved settings for image ${currentImageIndex + 1}:`, settings);
    } catch (error) {
      console.warn('Failed to save image settings:', error);
    }
  }, [viewport, currentImageIndex, isInverted, isFlippedHorizontal]);
  
  const restoreImageSettings = useCallback((imageIndex: number) => {
    if (!viewport) return;
    
    const settings = imageSettingsRef.current.get(imageIndex);
    if (!settings) {
      console.log(`DEBUG: No saved settings for image ${imageIndex + 1}, using defaults`);
      return;
    }
    
    try {
      console.log(`DEBUG: Restoring settings for image ${imageIndex + 1}:`, settings);
      
      // Restore window/level
      if (settings.windowLevel) {
        const properties = viewport.getProperties();
        const lowerBound = settings.windowLevel.windowCenter - settings.windowLevel.windowWidth / 2;
        const upperBound = settings.windowLevel.windowCenter + settings.windowLevel.windowWidth / 2;
        
        viewport.setProperties({
          ...properties,
          voiRange: { lower: lowerBound, upper: upperBound },
          invert: settings.isInverted
        });
      }
      
      // Restore zoom and pan
      if (settings.zoom && settings.pan) {
        const camera = viewport.getCamera();
        viewport.setCamera({
          ...camera,
          parallelScale: settings.zoom,
          focalPoint: [settings.pan.x, settings.pan.y, camera.focalPoint[2]]
        });
      }
      
      // Restore flip state
      const element = viewport.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = settings.isFlippedHorizontal ? 'scaleX(-1)' : 'scaleX(1)';
      }
      
      // Update UI state
      setIsInverted(settings.isInverted);
      setIsFlippedHorizontal(settings.isFlippedHorizontal);
      
      safeRender(viewport);
      
    } catch (error) {
      console.warn('Failed to restore image settings:', error);
    }
  }, [viewport]);

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

  // Helper function to handle DICOM loading errors, especially buffer overruns
  const handleDicomError = useCallback((error: any, imageId: string, retryCallback?: () => Promise<void>) => {
    const errorMessage = (error?.message?.toLowerCase && error.message.toLowerCase()) || '';
    
    console.error('DICOM loading error:', {
      error,
      imageId,
      errorMessage,
      errorType: error?.constructor?.name
    });
    
    // Check for specific error types - ensure errorMessage is a string
    if (errorMessage && (errorMessage.includes('buffer overrun') || errorMessage.includes('parsedicomdatasetexplicit'))) {
      console.warn('DICOM buffer overrun detected for:', imageId);
      toast.error('DICOM data corruption detected. This may be due to network issues with remote PACS server.');
      
      // For buffer overrun errors, we can try to reload after a delay
      if (retryCallback) {
        setTimeout(() => {
          console.log('Retrying DICOM load after buffer overrun...');
          retryCallback().catch(retryError => {
            console.error('Retry failed:', retryError);
          });
        }, 2000);
      }
      
      return 'buffer_overrun';
    } else if (errorMessage && (errorMessage.includes('timeout') || errorMessage.includes('network'))) {
      console.warn('Network timeout detected for:', imageId);
      toast.warning('Network timeout. Please check connection to PACS server.');
      return 'network_timeout';
    } else if (errorMessage && (errorMessage.includes('404') || errorMessage.includes('not found'))) {
      console.warn('DICOM file not found:', imageId);
      toast.warning('DICOM file not found on server.');
      return 'not_found';
    } else {
      console.error('Unknown DICOM error:', error);
      toast.error('Failed to load DICOM image.');
      return 'unknown';
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
        // Prevent multiple simultaneous loads
        if (isStackLoading) {
          console.log('DEBUG: Stack already loading, skipping duplicate initialization');
          return;
        }
        
        setIsStackLoading(true);
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
        const engine = new RenderingEngine(renderingEngineId);
        setRenderingEngine(engine);

        console.log('Creating viewport...');
        const viewportId = `stackViewport-${Date.now()}`;  // Unique ID to prevent conflicts
        const viewportInput = {
          viewportId,
          element: element, // Use the element we waited for
          type: ViewportType.STACK,
        };

        // Log element dimensions before enabling
        console.log('Element dimensions before enable:', {
          offsetWidth: element.offsetWidth,
          offsetHeight: element.offsetHeight,
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          style: {
            width: element.style.width,
            height: element.style.height
          }
        });

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        setViewport(stackViewport);

        // Log canvas dimensions after enabling
        const canvas = stackViewport.canvas;
        console.log('Canvas dimensions after enable:', {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          style: {
            width: canvas.style.width,
            height: canvas.style.height
          }
        });

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
          console.log(`DEBUG: Pre-registering WADO-RS metadata before viewport operations...`);
          
          // CRITICAL: Pre-register WADO-RS metadata BEFORE any viewport operations
          // This prevents Cornerstone from trying to access undefined metadata
          await preRegisterWadorsMetadata(imageIds);
          
          console.log(`DEBUG: Loading ONLY current image ${startIndex + 1}/${imageIds.length} - NO BULK LOADING`);
          
          // Try WADO-RS first, then fallback if it fails
          try {
            await stackViewport.setStack([imageIds[startIndex]], 0);
            console.log('DEBUG: ✅ WADO-RS image loaded successfully');
          } catch (wadorsError) {
            console.error('DEBUG: WADO-RS failed, error:', wadorsError);
            
            // TEMPORARY: Create fallback wadouri image ID for debugging
            const fallbackImageId = imageIds[startIndex].replace('wadors:', 'wadouri:').replace('/frames/1', '/file');
            console.log('DEBUG: Trying fallback wadouri:', fallbackImageId);
            
            try {
              await stackViewport.setStack([fallbackImageId], 0);
              console.log('DEBUG: ✅ Fallback wadouri loaded successfully');
            } catch (fallbackError) {
              console.error('DEBUG: Both WADO-RS and wadouri fallback failed:', fallbackError);
              throw wadorsError; // Throw original WADO-RS error
            }
          }
          
          // Keep existing inversion state - don't auto-change it
          console.log('DEBUG: Using existing inversion state for loaded images');
          
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
          
          // Use our enhanced error handler
          const errorType = handleDicomError(stackError, imageIds[startIndex] || 'unknown', async () => {
            // Retry logic for stack loading
            await new Promise(resolve => setTimeout(resolve, 1000));
            await stackViewport.setStack(imageIds, startIndex);
          });
          
          // If it's a buffer overrun, try loading just the current image
          if (errorType === 'buffer_overrun' && imageIds.length > 0) {
            try {
              console.log('Attempting single image load due to buffer overrun...');
              await stackViewport.setStack([imageIds[startIndex]], 0);
              toast.warning('Loaded single image due to data corruption. Navigation may be limited.');
            } catch (singleImageError) {
              console.error('Single image load also failed:', singleImageError);
              throw singleImageError;
            }
          } else {
            throw stackError;
          }
        }
        
        // Fit image to viewport while preserving aspect ratio and centering
        stackViewport.resetCamera();
        
        // Proper image fitting and centering
        try {
          // Reset camera first
          stackViewport.resetCamera();
          
          // Wait a moment for the reset to take effect
          setTimeout(() => {
            try {
              // Get current canvas dimensions
              const canvas = stackViewport.canvas;
              console.log('Canvas dimensions:', {
                width: canvas.width,
                height: canvas.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight
              });
              
              // Use the built-in fit method if available
              if (typeof stackViewport.fitToCanvas === 'function') {
                console.log('Using fitToCanvas method');
                stackViewport.fitToCanvas();
              } else {
                console.log('Using manual zoom fit');
                // Calculate appropriate zoom to fit image in canvas
                const currentImage = stackViewport.getImageData();
                if (currentImage && currentImage.dimensions) {
                  const imageWidth = currentImage.dimensions[0];
                  const imageHeight = currentImage.dimensions[1];
                  const canvasWidth = canvas.clientWidth;
                  const canvasHeight = canvas.clientHeight;
                  
                  // Calculate scale to fit image in canvas
                  const scaleX = canvasWidth / imageWidth;
                  const scaleY = canvasHeight / imageHeight;
                  const scale = Math.min(scaleX, scaleY) * 0.9; // 0.9 for some padding
                  
                  console.log('Manual scaling:', {
                    imageWidth, imageHeight,
                    canvasWidth, canvasHeight,
                    scale
                  });
                  
                  // Set camera properties for proper centering
                  const camera = stackViewport.getCamera();
                  stackViewport.setCamera({
                    ...camera,
                    parallelScale: Math.max(imageHeight, imageWidth) / (2 * scale),
                    position: [imageWidth / 2, imageHeight / 2, camera.position[2]],
                    focalPoint: [imageWidth / 2, imageHeight / 2, camera.focalPoint[2]]
                  });
                }
              }
              
              stackViewport.render();
              console.log('Image fitted and centered successfully');
            } catch (fitError) {
              console.warn('Error during delayed fit:', fitError);
            }
          }, 50);
        } catch (displayError) {
          console.warn('Could not set up image fitting:', displayError);
          stackViewport.resetCamera();
        }
        
        stackViewport.render();
        console.log('Images loaded and rendered with proper aspect ratio');

        // Set proper inversion based on PhotometricInterpretation
        setTimeout(() => {
          try {
            const properties = stackViewport.getProperties();
            console.log('Current viewport properties:', properties);
            
            // For most medical images, MONOCHROME2 should NOT be inverted by default
            // MONOCHROME1 typically needs inversion
            // Try starting with non-inverted state first
            stackViewport.setProperties({
              ...properties,
              invert: false
            });
            setIsInverted(false);
            stackViewport.render();
            console.log('Set viewport to non-inverted state (for MONOCHROME2)');
          } catch (err) {
            console.warn('Could not set initial viewport properties:', err);
          }
        }, 100);

        // Set up ResizeObserver for aspect ratio preservation
        if (element && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver((entries) => {
            if (engine && stackViewport) {
              console.log('ResizeObserver triggered');
              
              // Get new dimensions
              const entry = entries[0];
              const { width, height } = entry.contentRect;
              console.log('New viewport dimensions:', { width, height });
              
              // Resize the rendering engine first
              engine.resize(true, false);
              
              // Then refit the image to prevent wrapping/cropping
              setTimeout(() => {
                try {
                  stackViewport.resetCamera();
                  if (typeof stackViewport.fitToCanvas === 'function') {
                    stackViewport.fitToCanvas();
                  }
                  stackViewport.render();
                  console.log('Viewport resized and image refitted');
                } catch (resizeError) {
                  console.warn('Error during resize refit:', resizeError);
                }
              }, 10);
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

        // CRITICAL: Add viewport to tool group AFTER metadata is registered and images are loaded
        // This prevents the "Cannot read properties of undefined (reading 'includes')" error
        console.log('Adding viewport to tool group AFTER metadata registration...');
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

        // Add event listener for window/level changes
        const viewportElement = stackViewport.element;
        viewportElement.addEventListener('cornerstoneimagerendered', () => {
          // Debounce saving to avoid too frequent saves during dragging
          clearTimeout(saveSettingsTimeoutRef.current);
          saveSettingsTimeoutRef.current = setTimeout(() => {
            saveCurrentImageSettings();
          }, 500);
        });

        console.log('DICOM viewer fully initialized');
        setLoading(false);
        setIsStackLoading(false);
      } catch (err) {
        console.error('Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        setLoading(false);
        setIsStackLoading(false);
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
        console.log(`DEBUG: Loading SINGLE image ${index + 1}/${imageIds.length} - NO BULK LOADING`);
        
        // Save current image settings before navigating
        saveCurrentImageSettings();
        
        // SIMPLE: Load ONLY the new image, don't try to be smart
        await viewport.setStack([imageIds[index]], 0);
        
        // Update current image index
        setCurrentImageIndex(index);
        
        // Wait a moment for the image to load, then restore settings
        setTimeout(() => {
          restoreImageSettings(index);
          try {
            const image = stackViewport.getCurrentImageData();
            if (image && image.metadata) {
              const photometricInterpretation = image.metadata.PhotometricInterpretation;
              const shouldInvert = photometricInterpretation === 'MONOCHROME1';
              
              if (shouldInvert !== isInverted) {
                console.log(`DEBUG: Image ${index + 1} requires different inversion: ${shouldInvert}`);
                setIsInverted(shouldInvert);
                
                const properties = stackViewport.getProperties();
                stackViewport.setProperties({
                  ...properties,
                  invert: shouldInvert
                });
                stackViewport.render();
              }
            }
          } catch (photoError) {
            console.warn('Could not check photometric interpretation for new image:', photoError);
          }
        }, 150);
        
        console.log(`DEBUG: Successfully navigated to image ${index + 1}/${imageIds.length}`);
        
      } catch (error) {
        console.error('DEBUG: Error in navigation:', error);
        // Try to stay on current image if navigation fails
      } finally {
        setLoadingNavigation(false);
      }
    }
  }, [viewport, imageIds, currentImageIndex, saveCurrentImageSettings, restoreImageSettings]);
  
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
        
        // Save settings after flip
        setTimeout(() => {
          saveCurrentImageSettings();
        }, 50);
        
      } catch (error) {
        console.error('Error flipping image horizontally:', error);
      }
    }
  }, [viewport, isFlippedHorizontal, saveCurrentImageSettings]);

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
        
        // Save settings after invert
        setTimeout(() => {
          saveCurrentImageSettings();
        }, 50);
        
      } catch (error) {
        console.error('Error inverting image:', error);
      }
    }
  }, [viewport, isInverted, saveCurrentImageSettings]);

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

  // Debug function to analyze image data and identify dimension issues
  const debugImageInfo = useCallback(async () => {
    if (!viewport) {
      console.log('DEBUG: No viewport available');
      return;
    }
    
    try {
      // Get the current image
      const image = viewport.getImageData();
      if (!image) {
        console.log('DEBUG: No image data available');
        return;
      }
      
      console.log('DEBUG: Image Information:', {
        dimensions: image.dimensions,
        spacing: image.spacing,
        origin: image.origin,
        direction: image.direction,
        scalarData: image.scalarData ? {
          length: image.scalarData.length,
          constructor: image.scalarData.constructor.name,
          bytesPerElement: image.scalarData.BYTES_PER_ELEMENT
        } : 'No scalar data',
        metadata: image.metadata
      });
      
      // Check if dimensions match pixel data
      if (image.dimensions && image.scalarData) {
        const expectedPixels = image.dimensions[0] * image.dimensions[1];
        const actualPixels = image.scalarData.length;
        
        console.log('DEBUG: Pixel data check:', {
          expectedPixels,
          actualPixels,
          match: expectedPixels === actualPixels,
          ratio: actualPixels / expectedPixels
        });
        
        if (expectedPixels !== actualPixels) {
          console.error('🚨 DIMENSION MISMATCH DETECTED! This causes pixel reordering (word -> rdwo effect)');
          console.error(`Expected: ${image.dimensions[0]} x ${image.dimensions[1]} = ${expectedPixels} pixels`);
          console.error(`Actual: ${actualPixels} pixels`);
          console.error(`Ratio: ${actualPixels / expectedPixels}`);
          
          // Try to guess actual dimensions
          const possibleDimensions = [];
          for (let width = 100; width <= 2048; width += 4) {
            if (actualPixels % width === 0) {
              const height = actualPixels / width;
              if (height > 100 && height <= 2048) {
                possibleDimensions.push({ width, height });
              }
            }
          }
          
          console.log('DEBUG: All possible dimensions for this pixel count:', possibleDimensions.slice(0, 10));
          
          // Show the most likely candidates (common medical image sizes)
          const likelyCandidates = possibleDimensions.filter(d => 
            (d.width >= 256 && d.width <= 1024) && (d.height >= 256 && d.height <= 1024)
          );
          console.log('🎯 MOST LIKELY CORRECT DIMENSIONS:', likelyCandidates);
          
          // Show square candidates separately (very common in medical imaging)
          const squareCandidates = possibleDimensions.filter(d => d.width === d.height);
          console.log('📐 SQUARE DIMENSION CANDIDATES:', squareCandidates.slice(0, 5));
          
          // Alert about the specific issue
          console.error('💡 SOLUTION: The backend metadata endpoint needs to return the correct dimensions.');
          console.error('💡 The pixel data is being read with wrong width/height, causing reordering.');
        } else {
          console.log('✅ Dimensions match pixel data - no reordering issue');
        }
      }
      
      // Get viewport properties
      const properties = viewport.getProperties();
      console.log('DEBUG: Viewport properties:', properties);
      
      // Get the actual canvas size
      const canvas = viewport.canvas;
      console.log('DEBUG: Canvas info:', {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight
      });
      
      // Try to get cornerstone image object for more details
      try {
        const cornerstoneImage = viewport.getCornerstoneImage && viewport.getCornerstoneImage();
        if (cornerstoneImage) {
          console.log('DEBUG: Cornerstone image object:', {
            width: cornerstoneImage.width,
            height: cornerstoneImage.height,
            color: cornerstoneImage.color,
            columnPixelSpacing: cornerstoneImage.columnPixelSpacing,
            rowPixelSpacing: cornerstoneImage.rowPixelSpacing,
            minPixelValue: cornerstoneImage.minPixelValue,
            maxPixelValue: cornerstoneImage.maxPixelValue,
            sizeInBytes: cornerstoneImage.sizeInBytes
          });
        }
      } catch (err) {
        console.log('DEBUG: Could not get cornerstone image object:', err);
      }
      
    } catch (error) {
      console.error('DEBUG: Error getting image info:', error);
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
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Images</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500 mb-4">{error}</p>
            
            {/* Check if this is the specific Orthanc database issue */}
            {(error && typeof error === 'string' && (error.includes('database inconsistency') || error.includes('PACS server') || error.includes('not accessible'))) && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <h4 className="font-semibold text-blue-800 mb-2">💡 Alternative Viewer Available</h4>
                <p className="text-sm text-blue-700 mb-3">
                  The PACS server has configuration issues, but you can still view this study using Stone Web Viewer:
                </p>
                <Button 
                  onClick={() => {
                    const orthancUrl = 'http://192.168.20.172:8042';
                    // Extract study UID from studyMetadata or construct from imageIds
                    let studyUid = studyMetadata?.studyInstanceUID;
                    if (!studyUid && imageIds.length > 0) {
                      // Try to extract from the first image ID
                      const firstImageId = imageIds[0];
                      const match = firstImageId.match(/studies\/([^\/]+)\//);
                      if (match) {
                        studyUid = match[1];
                      }
                    }
                    
                    if (studyUid) {
                      const stoneUrl = `${orthancUrl}/stone-webviewer/index.html?study=${studyUid}`;
                      window.open(stoneUrl, '_blank');
                    } else {
                      // Fallback to general Stone Web Viewer
                      const stoneUrl = `${orthancUrl}/stone-webviewer/`;
                      window.open(stoneUrl, '_blank');
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  🔗 Open in Stone Web Viewer
                </Button>
              </div>
            )}
            
            <Button onClick={retryViewer} className="w-full" variant="outline">
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
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={debugImageInfo}
              title="Debug Image Info - Check Console"
              className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800"
            >
              🔍
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
            style={{ 
              minHeight: '400px',
              position: 'relative',
              overflow: 'hidden' // Prevent image wrapping/overflow
            }}
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
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>No Images Available</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">
                      No DICOM images found for this study. This may be due to PACS server configuration issues.
                    </p>
                    
                    {/* Stone Web Viewer Fallback */}
                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                      <h4 className="font-semibold text-blue-800 mb-2">💡 Try Alternative Viewer</h4>
                      <p className="text-sm text-blue-700 mb-3">
                        You can still view this study using Stone Web Viewer:
                      </p>
                      <Button 
                        onClick={() => {
                          const orthancUrl = 'http://192.168.20.172:8042';
                          // Extract study UID from studyMetadata
                          let studyUid = studyMetadata?.studyInstanceUID;
                          
                          if (studyUid) {
                            const stoneUrl = `${orthancUrl}/stone-webviewer/index.html?study=${studyUid}`;
                            window.open(stoneUrl, '_blank');
                          } else {
                            // Fallback to general Stone Web Viewer
                            const stoneUrl = `${orthancUrl}/stone-webviewer/`;
                            window.open(stoneUrl, '_blank');
                          }
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                      >
                        🔗 Open in Stone Web Viewer
                      </Button>
                    </div>
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

              {/* Thumbnail Images - Series-level or Image-level based on study size */}
              <div className="flex gap-1 flex-1 overflow-x-auto">
                {(() => {
                  // For large studies with multiple series (typically CT/MR), show series-level thumbnails
                  const shouldUseSeriesThumbnails = imageIds.length > 20 && seriesInfo.length > 1;
                  
                  if (shouldUseSeriesThumbnails) {
                    console.log(`DEBUG: Using series-level thumbnails for ${seriesInfo.length} series`);
                    
                    // Calculate which series the current image belongs to
                    let currentSeriesIndex = 0;
                    let imageCountSoFar = 0;
                    for (let i = 0; i < seriesInfo.length; i++) {
                      if (currentImageIndex < imageCountSoFar + seriesInfo[i].instanceCount) {
                        currentSeriesIndex = i;
                        break;
                      }
                      imageCountSoFar += seriesInfo[i].instanceCount;
                    }
                    
                    return seriesInfo.map((series, seriesIndex) => {
                      // Calculate the first image index for this series
                      let seriesStartIndex = 0;
                      for (let i = 0; i < seriesIndex; i++) {
                        seriesStartIndex += seriesInfo[i].instanceCount;
                      }
                      
                      const representativeImageId = imageIds[seriesStartIndex];
                      const isActiveSeries = seriesIndex === currentSeriesIndex;
                      
                      return (
                        <div
                          key={series.seriesId}
                          className="flex-shrink-0 relative"
                          title={`${series.seriesDescription} (${series.instanceCount} images)`}
                        >
                          <ThumbnailImage
                            imageId={representativeImageId}
                            index={seriesStartIndex}
                            isActive={isActiveSeries}
                            onClick={() => goToImage(seriesStartIndex)}
                          />
                          {/* Series info overlay */}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b">
                            <div className="font-medium truncate">{series.seriesDescription || `Series ${seriesIndex + 1}`}</div>
                            <div className="text-xs opacity-75">{series.instanceCount} imgs</div>
                          </div>
                        </div>
                      );
                    });
                  } else {
                    // For small studies or single series, show individual image thumbnails
                    console.log(`DEBUG: Using image-level thumbnails for ${imageIds.length} images`);
                    return imageIds.map((imageId, index) => {
                      return (
                        <ThumbnailImage
                          key={imageId}
                          imageId={imageId}
                          index={index}
                          isActive={index === currentImageIndex}
                          onClick={() => goToImage(index)}
                        />
                      );
                    });
                  }
                })()}
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
  const isLoadingRef = useRef(false);
  
  // Use Intersection Observer for lazy loading thumbnails
  useEffect(() => {
    const element = thumbRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingRef.current && !isLoaded) {
          setShouldLoad(true);
          observer.disconnect(); // Only load once
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
        console.log(`DEBUG: Loading thumbnail ${index + 1}`);
        
        // Small delay to stagger thumbnail loading
        await new Promise(resolve => setTimeout(resolve, index * 100));
        
        if (!mounted) return;
        
        // Use shared rendering engine to prevent WebGL context leaks
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
        
        // Load the single image with shorter timeout for thumbnails
        const loadPromise = (thumbViewport as any).setStack([imageId], 0);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Thumbnail load timeout')), 8000)
        );
        
        await Promise.race([loadPromise, timeoutPromise]);
        
        if (!mounted) return;
        
        // Safe render for thumbnail with retry logic
        let renderAttempts = 0;
        const maxRenderAttempts = 3;
        
        const attemptRender = () => {
          try {
            // Reset camera and center thumbnail image
            thumbViewport.resetCamera();
            
            // Try to fit to canvas for proper centering
            if (typeof thumbViewport.fitToCanvas === 'function') {
              thumbViewport.fitToCanvas();
            }
            
            thumbViewport.render();
            console.log(`DEBUG: Thumbnail ${index + 1} rendered successfully`);
            if (mounted) {
              setIsLoaded(true);
              isLoadingRef.current = false;
            }
          } catch (renderError) {
            console.warn(`Thumbnail render error for ${index} (attempt ${renderAttempts + 1}):`, renderError);
            renderAttempts++;
            if (renderAttempts < maxRenderAttempts && mounted) {
              setTimeout(attemptRender, 200 * renderAttempts);
            } else {
              isLoadingRef.current = false;
            }
          }
        };
        
        attemptRender();
        
      } catch (err) {
        console.warn(`Failed to load thumbnail ${index}:`, err);
        if (mounted) {
          setError(true);
          isLoadingRef.current = false;
        }
      }
    };

    loadThumbnail();
    
    return () => {
      mounted = false;
      isLoadingRef.current = false;
    };
  }, [shouldLoad, imageId, index, isLoaded]);
  
  // Only cleanup on unmount, not on navigation
  useEffect(() => {
    return () => {
      // Only clean up when component is actually unmounting
      if (viewportIdRef.current && sharedThumbnailEngine) {
        try {
          sharedThumbnailEngine.disableElement(viewportIdRef.current);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      releaseSharedThumbnailEngine();
    };
  }, []);
  
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
      title={`Image ${index + 1}`}
    >
      <div
        ref={thumbRef}
        className="w-full h-full bg-black rounded-sm"
      />
      
      {/* Loading state */}
      {!isLoaded && !error && shouldLoad && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      )}
      
      {/* Placeholder for not-yet-loaded thumbnails */}
      {!isLoaded && !error && !shouldLoad && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-sm">
          <div className="text-xs text-muted-foreground font-medium">
            {index + 1}
          </div>
        </div>
      )}
      
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