'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ZoomIn, ZoomOut, RotateCw, Move, Square, Circle, 
  Ruler, MousePointer, RotateCcw, Maximize, Settings,
  FlipHorizontal, Palette, Trash2, ArrowLeft, ArrowRight,
  Eye, EyeOff, ArrowUpRight, Crosshair, Triangle
} from 'lucide-react';
import AuthService from '@/lib/auth';
import DicomOverlay from './DicomOverlay';
import { useAnnotationAutoSave } from '@/hooks/useAnnotationAutoSave';

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
  ArrowAnnotateTool,
  CobbAngleTool,
  ProbeTool,
  AngleTool,
  addTool,
  Enums as ToolsEnums,
  annotation
} from '@cornerstonejs/tools';
import { init as dicomImageLoaderInit } from '@cornerstonejs/dicom-image-loader';
import * as cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const { ViewportType } = CoreEnums;
const { MouseBindings } = ToolsEnums;

// WADO-RS metadata pre-registration
async function preRegisterWadorsMetadata(imageIds: string[], pacsServerId?: string | null): Promise<void> {
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
          let metadataUrl = framesUrl.replace('/frames/1', '/metadata');
          
          // Add PACS server ID parameter if provided
          if (pacsServerId) {
            const separator = metadataUrl.includes('?') ? '&' : '?';
            metadataUrl += `${separator}pacs_server_id=${pacsServerId}`;
          }
          
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
        addTool(ArrowAnnotateTool);
        addTool(CobbAngleTool);
        addTool(ProbeTool);
        addTool(AngleTool);
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
  pacsServerId?: string | null;
  // DICOM overlay props
  showOverlay?: boolean;
  setShowOverlay?: (show: boolean) => void;
  examinations?: any[];
  enhancedDicomData?: any[];
  isFullWindow?: boolean;
  hideToolbar?: boolean;
  viewportIdSuffix?: string; // Unique suffix for viewport IDs in multi-viewport mode
  // Multi-viewport layout props
  currentLayout?: {cols: number, rows: number};
}

type Tool = 'wwwc' | 'zoom' | 'pan' | 'length' | 'rectangle' | 'ellipse' | 'arrow' | 'cobb' | 'probe' | 'angle';

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
  pacsServerId,
  showOverlay = false,
  setShowOverlay,
  examinations = [],
  enhancedDicomData = [],
  isFullWindow = false,
  hideToolbar = false,
  viewportIdSuffix = '',
  currentLayout = {cols: 1, rows: 1}
}) => {
  const mainViewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<any>(null);
  const toolGroupRef = useRef<any>(null);
  
  // Multi-viewport state
  const [activeViewportIndex, setActiveViewportIndex] = useState<number>(0);
  const multiViewportRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const multiViewports = useRef<Map<number, any>>(new Map());
  const isMultiViewport = currentLayout.cols * currentLayout.rows > 1;
  
  
  const [imageIds, setImageIds] = useState<string[]>(initialImageIds);
  
  // Initialize annotation auto-save
  const { handleCornerstoneEvent, isSaving } = useAnnotationAutoSave({
    studyUid: studyMetadata?.studyInstanceUID || '',
    enabled: !!studyMetadata?.studyInstanceUID,
  });
  
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<Tool>('wwwc');
  const [isInverted, setIsInverted] = useState<boolean>(false);
  const [isFlippedHorizontal, setIsFlippedHorizontal] = useState<boolean>(false);
  
  // Dynamic overlay data state
  const [dynamicOverlayData, setDynamicOverlayData] = useState<{
    windowLevel?: { windowWidth: number; windowCenter: number };
    zoomPercentage?: number;
    mousePosition?: { x: number; y: number; pixelValue?: number };
  }>({});

  // Get active viewport helper
  const getActiveViewport = useCallback(() => {
    if (currentLayout.cols * currentLayout.rows > 1) {
      return multiViewports.current.get(activeViewportIndex);
    }
    return viewportRef.current;
  }, [activeViewportIndex, currentLayout]);

  // Update dynamic overlay data with current W/L and zoom
  const updateDynamicOverlayData = useCallback(() => {
    const stackViewport = getActiveViewport();
    if (!stackViewport) {
      return;
    }

    try {
      // Get current window/level settings
      const properties = stackViewport.getProperties();
      const voiRange = properties?.voiRange;
      
      if (voiRange) {
        const windowWidth = voiRange.upper - voiRange.lower;
        const windowCenter = (voiRange.upper + voiRange.lower) / 2;
        
        setDynamicOverlayData(prev => ({
          ...prev,
          windowLevel: { windowWidth, windowCenter }
        }));
      } else {
        // Try to get W/L from image metadata or viewport settings
        try {
          // Method 1: Try viewport's current transfer function
          const transferFunction = stackViewport.getTransferFunction();
          
          // Method 2: Try to get from image data
          const imageData = stackViewport.getImageData();
          
          if (imageData && (imageData.windowWidth || imageData.windowCenter)) {
            const windowWidth = imageData.windowWidth || 400;
            const windowCenter = imageData.windowCenter || 200;
            
            setDynamicOverlayData(prev => ({
              ...prev,
              windowLevel: { windowWidth, windowCenter }
            }));
          }
        } catch (altError) {
          // Continue without W/L data
        }
      }
      
      // Get zoom percentage instead of aspect ratio
      try {
        const camera = stackViewport.getCamera();
        if (camera && camera.parallelScale) {
          // Get the canvas/viewport size to calculate proper zoom
          const canvas = stackViewport.canvas;
          const imageData = stackViewport.getImageData();
          
          if (canvas && imageData && imageData.dimensions) {
            // Calculate zoom based on how much of the image fits in the viewport
            const imageWidth = imageData.dimensions[0];
            const imageHeight = imageData.dimensions[1];
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const currentScale = camera.parallelScale;
            
            // Calculate what the parallelScale would be for a "fit-to-window" view
            // parallelScale represents half the height of the visible area
            // For fit-to-window, we want the smaller dimension to determine the scale
            const scaleToFitWidth = imageWidth * canvasHeight / (2 * canvasWidth);
            const scaleToFitHeight = imageHeight / 2;
            const fitToWindowScale = Math.min(scaleToFitWidth, scaleToFitHeight);
            
            // Zoom percentage = (fit-to-window scale / current scale) * 100
            const zoomPercentage = Math.round((fitToWindowScale / currentScale) * 100);
            
            setDynamicOverlayData(prev => ({
              ...prev,
              zoomPercentage: Math.max(1, Math.min(2000, zoomPercentage)) // Clamp between 1% and 2000%
            }));
          } else {
            // Fallback to simpler calculation if we can't get dimensions
            const estimatedFitScale = 200; // Fallback estimate
            const zoomPercentage = Math.round((estimatedFitScale / camera.parallelScale) * 100);
            
            setDynamicOverlayData(prev => ({
              ...prev,
              zoomPercentage: Math.max(10, Math.min(1000, zoomPercentage))
            }));
          }
        }
      } catch (zoomError) {
        // Continue without zoom data
      }
    } catch (error) {
      // Continue without overlay updates
    }
  }, [getActiveViewport]);

  // Set up event listeners for real-time updates during user interactions
  React.useEffect(() => {
    if (!showOverlay) return;
    
    // Function to set up listeners once viewport is ready
    const setupEventListeners = () => {
      const stackViewport = getActiveViewport();
      
      if (!stackViewport) {
        return false;
      }

      const viewportElement = stackViewport.element;
      
      if (!viewportElement) {
        return false;
      }

      // Throttled mouse move handler for real-time updates during drag
      let lastMouseUpdate = 0;
      const handleMouseMove = (event: any) => {
        // Only during mouse button press (active tool interaction)
        if (event.buttons > 0) {
          const now = Date.now();
          // Throttle to max 20 updates per second (50ms)
          if (now - lastMouseUpdate > 50) {
            lastMouseUpdate = now;
            updateDynamicOverlayData();
          }
        }
      };

      // Update when image is rendered (initial load, tool activation changes, etc.)
      const handleImageRendered = () => {
        updateDynamicOverlayData();
      };

      // Update when viewport camera changes (zoom/pan operations complete)
      const handleCameraModified = () => {
        updateDynamicOverlayData();
      };

      // Update when VOI (window/level) changes are applied
      const handleVoiModified = () => {
        updateDynamicOverlayData();
      };

      // Add event listeners for real-time updates during user interactions
      viewportElement.addEventListener('cornerstoneimagerendered', handleImageRendered);
      viewportElement.addEventListener('cornerstonecameramodified', handleCameraModified);
      viewportElement.addEventListener('cornerstonevoimodified', handleVoiModified);
      
      // Listen for mouse move events for real-time updates during tool interactions
      viewportElement.addEventListener('mousemove', handleMouseMove);
      
      // Also listen for Cornerstone-specific interaction events
      viewportElement.addEventListener('cornerstoneviewportcameramodified', handleCameraModified);
      viewportElement.addEventListener('cornerstoneviewportvoimodified', handleVoiModified);

      // Add annotation monitoring for auto-save
      let lastAnnotationCount = 0;
      let isMouseDownOnAnnotationTool = false;
      let lastAnnotationToolUsed: string | null = null;

      // Function to get current annotation state
      const getCurrentAnnotationState = () => {
        try {
          const frameOfReferenceUID = stackViewport.getFrameOfReferenceUID();
          console.log('Getting annotations for frame:', frameOfReferenceUID);
          
          // Try multiple methods to get annotations
          let allAnnotations: any = {};
          
          // Method 1: Get all annotations
          try {
            allAnnotations = annotation.state.getAnnotations();
            console.log('Method 1 - All annotations:', allAnnotations);
          } catch (e) {
            console.log('Method 1 failed:', e);
          }
          
          // Method 2: Get annotations for specific frame
          if (frameOfReferenceUID && (!allAnnotations || Object.keys(allAnnotations).length === 0)) {
            try {
              allAnnotations = annotation.state.getAnnotations(frameOfReferenceUID);
              console.log('Method 2 - Frame annotations:', allAnnotations);
            } catch (e) {
              console.log('Method 2 failed:', e);
            }
          }
          
          // Method 3: Get annotations by element
          if (!allAnnotations || Object.keys(allAnnotations).length === 0) {
            try {
              allAnnotations = annotation.state.getAnnotations(null, stackViewport.element);
              console.log('Method 3 - Element annotations:', allAnnotations);
            } catch (e) {
              console.log('Method 3 failed:', e);
            }
          }
          
          const stateMap = new Map();
          
          // Handle different annotation structure formats
          if (allAnnotations) {
            // Format 1: Direct tool-based structure
            if (typeof allAnnotations === 'object' && !Array.isArray(allAnnotations)) {
              Object.keys(allAnnotations).forEach(key => {
                const value = allAnnotations[key];
                
                // Check if this is a frame-based structure
                if (key === frameOfReferenceUID || key.includes('FrameOfReference')) {
                  // Frame-based structure
                  if (typeof value === 'object') {
                    Object.keys(value).forEach(toolName => {
                      const toolAnnotations = value[toolName] || [];
                      if (Array.isArray(toolAnnotations)) {
                        toolAnnotations.forEach((ann: any) => {
                          if (ann.annotationUID) {
                            stateMap.set(ann.annotationUID, {
                              toolName,
                              annotationUID: ann.annotationUID,
                              metadata: ann.metadata,
                              data: ann.data
                            });
                          }
                        });
                      }
                    });
                  }
                } else {
                  // Direct tool-based structure
                  const toolAnnotations = value || [];
                  if (Array.isArray(toolAnnotations)) {
                    toolAnnotations.forEach((ann: any) => {
                      if (ann.annotationUID) {
                        stateMap.set(ann.annotationUID, {
                          toolName: key,
                          annotationUID: ann.annotationUID,
                          metadata: ann.metadata,
                          data: ann.data
                        });
                      }
                    });
                  }
                }
              });
            }
          }
          
          console.log('Final state map size:', stateMap.size, 'annotations:', Array.from(stateMap.keys()));
          return stateMap;
        } catch (error) {
          console.warn('Error getting annotation state:', error);
          return new Map();
        }
      };

      // Function to detect and handle new annotations
      const detectAndHandleNewAnnotations = () => {
        try {
          const currentState = getCurrentAnnotationState();
          const newAnnotations: any[] = [];
          
          // Find annotations that exist in current state but not in previous state
          const previousAnnotationState = (window as any).previousAnnotationState || new Map();
          currentState.forEach((annotation, uid) => {
            if (!previousAnnotationState.has(uid)) {
              newAnnotations.push(annotation);
            }
          });
          
          // Process each new annotation
          newAnnotations.forEach(newAnnotation => {
            try {
              console.log('New annotation detected:', newAnnotation);
              
              // Create synthetic event for useAnnotationAutoSave
              const syntheticEvent = {
                detail: {
                  annotation: {
                    annotationUID: newAnnotation.annotationUID,
                    data: newAnnotation.data || {},
                    metadata: {
                      toolName: newAnnotation.toolName,
                      seriesInstanceUID: studyMetadata?.studyInstanceUID || '',
                      sopInstanceUID: studyMetadata?.studyInstanceUID || '',
                      frameOfReferenceUID: stackViewport.getFrameOfReferenceUID(),
                      ...newAnnotation.metadata
                    },
                    imageId: imageIds[currentImageIndex] || 'current'
                  },
                  changeType: 'completed'
                }
              };
              
              console.log('Triggering annotation auto-save for:', newAnnotation.toolName);
              handleCornerstoneEvent(syntheticEvent);
            } catch (error) {
              console.warn('Error processing new annotation:', error);
            }
          });
          
          // Update previous state
          (window as any).previousAnnotationState = new Map(currentState);
          
        } catch (error) {
          console.warn('Error detecting new annotations:', error);
        }
      };

      // Check if current tool is an annotation tool (creates persistent annotations)
      const isAnnotationTool = (tool: string) => {
        const annotationTools = ['length', 'rectangle', 'ellipse', 'arrow', 'cobb', 'probe', 'angle'];
        return annotationTools.includes(tool);
      };

      // Mouse down handler for annotation tracking
      const handleMouseDown = (event: MouseEvent) => {
        try {
          // Get the active primary mouse button tool from ToolGroup
          const activeTool = toolGroupRef.current?.getActivePrimaryMouseButtonTool();
          
          // Map Cornerstone3D tool names to our internal tool names
          const mapToolName = (toolName: string): string => {
            const toolMap: Record<string, string> = {
              'LengthTool': 'length',
              'RectangleROITool': 'rectangle', 
              'EllipticalROITool': 'ellipse',
              'ArrowAnnotateTool': 'arrow',
              'CobbAngleTool': 'cobb',
              'ProbeTool': 'probe',
              'AngleTool': 'angle',
              'WindowLevelTool': 'wwwc',
              'ZoomTool': 'zoom',
              'PanTool': 'pan'
            };
            return toolMap[toolName] || toolName?.toLowerCase() || 'wwwc';
          };
          
          const currentTool = mapToolName(activeTool);
          
          console.log('Mouse down detected, active tool from ToolGroup:', activeTool, '-> mapped to:', currentTool);
          if (isAnnotationTool(currentTool)) {
            isMouseDownOnAnnotationTool = true;
            lastAnnotationToolUsed = currentTool;
            // Capture current annotation state before potential new annotation
            (window as any).previousAnnotationState = getCurrentAnnotationState();
            console.log('Mouse down on annotation tool:', currentTool, 'Captured state with', (window as any).previousAnnotationState.size, 'annotations');
          } else {
            console.log('Current tool is not an annotation tool:', currentTool);
          }
        } catch (error) {
          console.warn('Error in mousedown handler:', error);
        }
      };

      // Helper function to get tool name
      const getToolName = (tool: string) => {
        const toolMap: any = {
          'wwwc': WindowLevelTool.toolName,
          'zoom': ZoomTool.toolName,
          'pan': PanTool.toolName,
          'length': LengthTool.toolName,
          'rectangle': RectangleROITool.toolName,
          'ellipse': EllipticalROITool.toolName,
          'arrow': ArrowAnnotateTool.toolName,
          'cobb': CobbAngleTool.toolName,
          'probe': ProbeTool.toolName,
          'angle': AngleTool.toolName
        };
        return toolMap[tool];
      };

      // Mouse up handler for annotation detection
      const handleMouseUp = async (event: MouseEvent) => {
        try {
          if (isMouseDownOnAnnotationTool && lastAnnotationToolUsed) {
            console.log('Mouse up after annotation tool use, checking for new annotations...');
            
            // Use Promise instead of setTimeout
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
            
            detectAndHandleNewAnnotations();
            isMouseDownOnAnnotationTool = false;
          }
        } catch (error) {
          console.warn('Error in mouseup handler:', error);
        }
      };

      // Add mouse event listeners
      viewportElement.addEventListener('mousedown', handleMouseDown);
      viewportElement.addEventListener('mouseup', handleMouseUp);

      // Listen for window resize and fullscreen changes to update zoom percentage
      const handleResizeOrFullscreen = () => {
        // Small delay to ensure layout has updated
        setTimeout(() => {
          // Force rendering engine to resize and recalculate
          const renderingEngine = renderingEngineRef.current;
          const currentViewport = viewportRef.current;
          if (renderingEngine && currentViewport) {
            try {
              renderingEngine.resize(true, true);
              // Don't reset camera - that changes zoom level, just render
              currentViewport.render();
            } catch (resizeError) {
              // Fallback to just render
              try {
                currentViewport.render();
              } catch (renderError) {
                // Ignore render errors
              }
            }
          }
          updateDynamicOverlayData();
        }, 150);
      };
      
      window.addEventListener('resize', handleResizeOrFullscreen);
      document.addEventListener('fullscreenchange', handleResizeOrFullscreen);
      document.addEventListener('webkitfullscreenchange', handleResizeOrFullscreen);
      document.addEventListener('mozfullscreenchange', handleResizeOrFullscreen);
      document.addEventListener('MSFullscreenChange', handleResizeOrFullscreen);

      // Initial update
      updateDynamicOverlayData();

      return { 
        viewportElement, 
        handleImageRendered, 
        handleCameraModified, 
        handleVoiModified,
        handleMouseMove,
        handleResizeOrFullscreen,
        handleMouseDown,
        handleMouseUp
      };
    };

    // Try to set up listeners immediately
    let listenerSetup = setupEventListeners();
    
    // If not ready, retry until viewport is available
    let retryInterval: NodeJS.Timeout | null = null;
    if (!listenerSetup) {
      retryInterval = setInterval(() => {
        listenerSetup = setupEventListeners();
        if (listenerSetup) {
          clearInterval(retryInterval!);
        }
      }, 100); // Check every 100ms
    }

    return () => {
      // Clear retry interval if still running
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      
      // Clean up event listeners if they were set up
      if (listenerSetup && typeof listenerSetup === 'object') {
        const { 
          viewportElement, 
          handleImageRendered, 
          handleCameraModified,
          handleVoiModified,
          handleMouseMove,
          handleResizeOrFullscreen,
          handleMouseDown,
          handleMouseUp
        } = listenerSetup;
        if (viewportElement) {
          viewportElement.removeEventListener('cornerstoneimagerendered', handleImageRendered);
          viewportElement.removeEventListener('cornerstonecameramodified', handleCameraModified);
          viewportElement.removeEventListener('cornerstonevoimodified', handleVoiModified);
          viewportElement.removeEventListener('mousemove', handleMouseMove);
          viewportElement.removeEventListener('cornerstoneviewportcameramodified', handleCameraModified);
          viewportElement.removeEventListener('cornerstoneviewportvoimodified', handleVoiModified);
          
          // Remove mouse event listeners
          viewportElement.removeEventListener('mousedown', handleMouseDown);
          viewportElement.removeEventListener('mouseup', handleMouseUp);
          
          // Remove window and fullscreen listeners
          window.removeEventListener('resize', handleResizeOrFullscreen);
          document.removeEventListener('fullscreenchange', handleResizeOrFullscreen);
          document.removeEventListener('webkitfullscreenchange', handleResizeOrFullscreen);
          document.removeEventListener('mozfullscreenchange', handleResizeOrFullscreen);
          document.removeEventListener('MSFullscreenChange', handleResizeOrFullscreen);
        }
      }
    };
  }, [showOverlay, updateDynamicOverlayData]);

  // Handle full window mode changes - recalculate zoom when layout changes
  useEffect(() => {
    if (!viewportRef.current) return;
    
    // Small delay to ensure layout has fully updated
    const timeoutId = setTimeout(() => {
      const renderingEngine = renderingEngineRef.current;
      const currentViewport = viewportRef.current;
      
      if (renderingEngine && currentViewport) {
        try {
          renderingEngine.resize(true, true);
          currentViewport.render();
          updateDynamicOverlayData();
        } catch (error) {
          // Fallback to just update overlay data
          updateDynamicOverlayData();
        }
      }
    }, 200); // Slightly longer delay for full window transitions
    
    return () => clearTimeout(timeoutId);
  }, [isFullWindow, updateDynamicOverlayData]);
  
  const initializationRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const imageSettingsRef = useRef<Map<number, ImageSettings>>(new Map());
  
  // Update local imageIds when prop changes
  useEffect(() => {
    setImageIds(initialImageIds);
  }, [initialImageIds]);

  // Save/restore per-image settings
  const saveCurrentImageSettings = useCallback(() => {
    const activeViewport = getActiveViewport();
    if (!activeViewport) return;
    
    try {
      const properties = activeViewport.getProperties();
      const camera = activeViewport.getCamera();
      
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
  }, [currentImageIndex, isInverted, isFlippedHorizontal, getActiveViewport]);
  
  const restoreImageSettings = useCallback((imageIndex: number) => {
    const activeViewport = getActiveViewport();
    if (!activeViewport) return;
    
    const settings = imageSettingsRef.current.get(imageIndex);
    if (!settings) return;
    
    try {
      // Restore window/level
      if (settings.windowLevel) {
        const properties = activeViewport.getProperties();
        const lowerBound = settings.windowLevel.windowCenter - settings.windowLevel.windowWidth / 2;
        const upperBound = settings.windowLevel.windowCenter + settings.windowLevel.windowWidth / 2;
        
        activeViewport.setProperties({
          ...properties,
          voiRange: { lower: lowerBound, upper: upperBound },
          invert: settings.isInverted
        });
      }
      
      // Restore zoom and pan
      if (settings.zoom && settings.pan) {
        const camera = activeViewport.getCamera();
        activeViewport.setCamera({
          ...camera,
          parallelScale: settings.zoom,
          focalPoint: [settings.pan.x, settings.pan.y, camera.focalPoint[2]]
        });
      }
      
      // Restore flip state
      const element = activeViewport.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = settings.isFlippedHorizontal ? 'scaleX(-1)' : 'scaleX(1)';
      }
      
      // Update UI state
      setIsInverted(settings.isInverted);
      setIsFlippedHorizontal(settings.isFlippedHorizontal);
      
      activeViewport.render();
      
    } catch (error) {
      // Ignore restore errors
    }
  }, [getActiveViewport]);

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

  // Initialize Cornerstone3D (single viewport only)
  useEffect(() => {
    if (initializationRef.current) return;
    
    // Skip single viewport initialization if we're in multiviewport mode
    const totalViewports = currentLayout.cols * currentLayout.rows;
    if (totalViewports > 1) return;
    
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
        const renderingEngineId = `projectionDicomViewer-${Date.now()}${viewportIdSuffix}`;
        const engine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = engine;

        const viewportId = `projectionViewport-${Date.now()}${viewportIdSuffix}`;
        const viewportInput = {
          viewportId,
          element: element,
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        viewportRef.current = stackViewport;

        // Determine start index 
        const startIndex = Math.min(currentImageIndex, imageIds.length - 1);
        
        try {
          await preRegisterWadorsMetadata(imageIds, pacsServerId);
          
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

        const toolGroupId = `projectionDicomViewerToolGroup-${Date.now()}${viewportIdSuffix}`;
        
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
          tg.addTool(ArrowAnnotateTool.toolName);
          tg.addTool(CobbAngleTool.toolName);
          tg.addTool(ProbeTool.toolName);
          tg.addTool(AngleTool.toolName);
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
  }, [imageIds, currentLayout]);

  // Multi-viewport initialization
  useEffect(() => {
    const totalViewports = currentLayout.cols * currentLayout.rows;
    
    if (totalViewports <= 1 || !imageIds.length) return;
    
    let isMounted = true;
    
    const initMultiViewports = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Wait for all viewport elements to be ready
        const waitForElements = async () => {
          const maxRetries = 50;
          for (let retry = 0; retry < maxRetries; retry++) {
            if (!isMounted) {
              console.log('Component unmounted while waiting for elements');
              return false;
            }
            
            let allReady = true;
            for (let i = 0; i < totalViewports; i++) {
              const element = multiViewportRefs.current.get(i);
              if (!element || element.offsetParent === null) {
                allReady = false;
                break;
              }
            }
            if (allReady) return true;
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
          }
          console.warn('Timed out waiting for viewport elements');
          return false;
        };
        
        const elementsReady = await waitForElements();
        if (!elementsReady || !isMounted) {
          console.log('Elements not ready or component unmounted');
          return;
        }
        
        await initializeCornerstone();
        
        
        const renderingEngineId = `multiViewportEngine-${Date.now()}${viewportIdSuffix}`;
        const engine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = engine;
        
        // Create viewport specs for setViewports
        const viewportSpecs: any[] = [];
        for (let i = 0; i < totalViewports; i++) {
          const element = multiViewportRefs.current.get(i);
          if (element && element.offsetParent !== null && isMounted) {
            viewportSpecs.push({
              viewportId: `multiViewport-${i}-${Date.now()}${viewportIdSuffix}`,
              element: element,
              type: ViewportType.STACK,
            });
          }
        }
        
        if (!isMounted || viewportSpecs.length === 0) {
          console.log('No valid viewport specs created:', { isMounted, specsLength: viewportSpecs.length });
          return;
        }
        
        // Enable all viewports at once
        engine.setViewports(viewportSpecs);
        
        // Setup each viewport with the same image
        const imageIndex = Math.min(currentImageIndex, imageIds.length - 1);
        await preRegisterWadorsMetadata(imageIds, pacsServerId);
        
        for (let i = 0; i < viewportSpecs.length; i++) {
          if (!isMounted) {
            console.log(`Component unmounted during viewport ${i} setup`);
            break;
          }
          
          const spec = viewportSpecs[i];
          try {
            const viewport = engine.getViewport(spec.viewportId);
            if (!viewport) {
              console.warn(`Failed to get viewport ${i} with ID ${spec.viewportId}`);
              continue;
            }
            
            multiViewports.current.set(i, viewport);
            
            // Load same image to all viewports (no extra API calls)
            await viewport.setStack([imageIds[imageIndex]], 0);
            viewport.resetCamera();
            viewport.render();
            
            // Apply canvas styling
            const canvas = viewport.canvas;
            if (canvas) {
              canvas.style.objectFit = 'contain';
              canvas.style.width = '100%';
              canvas.style.height = '100%';
            }
          } catch (viewportError) {
            console.warn(`Failed to setup viewport ${i}:`, viewportError);
            // Don't break the loop, try to setup other viewports
          }
        }
        
        // Setup tools for multi-viewport
        const toolGroupId = `multiViewportToolGroup-${Date.now()}${viewportIdSuffix}`;
        
        try {
          ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch (e) {
          // Tool group doesn't exist
        }
        
        const tg = ToolGroupManager.createToolGroup(toolGroupId);
        toolGroupRef.current = tg;
        
        // Add tools to group
        tg.addTool(WindowLevelTool.toolName);
        tg.addTool(ZoomTool.toolName);
        tg.addTool(PanTool.toolName);
        tg.addTool(LengthTool.toolName);
        tg.addTool(RectangleROITool.toolName);
        tg.addTool(EllipticalROITool.toolName);
        tg.addTool(ArrowAnnotateTool.toolName);
        tg.addTool(CobbAngleTool.toolName);
        tg.addTool(ProbeTool.toolName);
        tg.addTool(AngleTool.toolName);
        
        // Add all viewports to tool group
        for (const spec of viewportSpecs) {
          tg.addViewport(spec.viewportId, renderingEngineId);
        }
        
        // Set default tools
        tg.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
        tg.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
        });
        tg.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: MouseBindings.Auxiliary }],
        });
        
        if (isMounted) {
          setLoading(false);
        }
        
      } catch (error) {
        console.error('Multi-viewport initialization failed:', error);
        if (isMounted) {
          setError(error instanceof Error ? error.message : 'Failed to initialize multi-viewport');
          setLoading(false);
        }
      }
    };
    
    // Clean up previous single viewport if switching to multi-viewport
    if (viewportRef.current && renderingEngineRef.current) {
      try {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        viewportRef.current = null;
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    const timeoutId = setTimeout(() => {
      initMultiViewports();
    }, 100);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      
      // Clean up multi-viewports
      multiViewports.current.clear();
      
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
  }, [currentLayout, imageIds, pacsServerId, viewportIdSuffix]);

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
      toolGroupRef.current.setToolPassive(ArrowAnnotateTool.toolName);
      toolGroupRef.current.setToolPassive(CobbAngleTool.toolName);
      toolGroupRef.current.setToolPassive(ProbeTool.toolName);
      toolGroupRef.current.setToolPassive(AngleTool.toolName);
      
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
        case 'arrow':
          toolGroupRef.current.setToolActive(ArrowAnnotateTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'cobb':
          toolGroupRef.current.setToolActive(CobbAngleTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'probe':
          toolGroupRef.current.setToolActive(ProbeTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }],
          });
          break;
        case 'angle':
          toolGroupRef.current.setToolActive(AngleTool.toolName, {
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
    const activeViewport = getActiveViewport();
    if (!activeViewport || index < 0 || index >= imageIds.length || index === currentImageIndex) {
      return;
    }

    try {
      // Save current image settings
      saveCurrentImageSettings();
      
      // Load the target image
      await activeViewport.setStack([imageIds[index]], 0);
      
      // Update current index
      setCurrentImageIndex(index);
      
      // Restore settings for the new image
      restoreImageSettings(index);
      
      // Check photometric interpretation for the new image
      try {
        const image = activeViewport.getCurrentImageData();
        if (image && image.metadata) {
          const photometricInterpretation = image.metadata.PhotometricInterpretation;
          const shouldInvert = photometricInterpretation === 'MONOCHROME1';
          
          if (shouldInvert !== isInverted) {
            setIsInverted(shouldInvert);
            
            const properties = activeViewport.getProperties();
            activeViewport.setProperties({
              ...properties,
              invert: shouldInvert
            });
            activeViewport.render();
          }
        }
      } catch (photoError) {
        // Ignore
      }
      
    } catch (error) {
      // Ignore navigation errors
    }
  }, [currentImageIndex, imageIds, saveCurrentImageSettings, restoreImageSettings, isInverted, getActiveViewport]);

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
    const activeViewport = getActiveViewport();
    if (activeViewport) {
      activeViewport.resetCamera();
      
      const properties = activeViewport.getProperties();
      activeViewport.setProperties({
        ...properties,
        invert: true
      });
      
      const element = activeViewport.element;
      const canvas = element.querySelector('canvas');
      if (canvas) {
        canvas.style.transform = 'scaleX(1)';
      }
      
      setIsInverted(true);
      setIsFlippedHorizontal(false);
      
      safeRender(activeViewport);
    }
  }, [safeRender, getActiveViewport]);

  const rotateImage = useCallback((degrees: number) => {
    const activeViewport = getActiveViewport();
    if (activeViewport) {
      try {
        const camera = activeViewport.getCamera();
        const currentRotation = camera.viewUp || [0, -1, 0];
        
        const angle = (degrees * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const newViewUp = [
          currentRotation[0] * cos - currentRotation[1] * sin,
          currentRotation[0] * sin + currentRotation[1] * cos,
          currentRotation[2]
        ];
        
        activeViewport.setCamera({
          ...camera,
          viewUp: newViewUp
        });
        safeRender(activeViewport);
      } catch (error) {
        // Ignore
      }
    }
  }, [safeRender, getActiveViewport]);

  const flipHorizontal = useCallback(() => {
    const activeViewport = getActiveViewport();
    if (activeViewport) {
      try {
        const newHorizontalState = !isFlippedHorizontal;
        setIsFlippedHorizontal(newHorizontalState);
        
        const element = activeViewport.element;
        const canvas = element.querySelector('canvas');
        if (canvas) {
          canvas.style.transform = newHorizontalState ? 'scaleX(-1)' : 'scaleX(1)';
        }
        
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore
      }
    }
  }, [isFlippedHorizontal, saveCurrentImageSettings, getActiveViewport]);

  const invertImage = useCallback(() => {
    const activeViewport = getActiveViewport();
    if (activeViewport) {
      try {
        const newInvertState = !isInverted;
        setIsInverted(newInvertState);
        
        const properties = activeViewport.getProperties();
        activeViewport.setProperties({
          ...properties,
          invert: newInvertState
        });
        
        safeRender(activeViewport);
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore
      }
    }
  }, [isInverted, safeRender, saveCurrentImageSettings, getActiveViewport]);

  const clearAnnotations = useCallback(() => {
    const activeViewport = getActiveViewport();
    if (activeViewport) {
      try {
        const frameOfReferenceUID = activeViewport.getFrameOfReferenceUID();
        
        annotation.state.removeAllAnnotations();
        
        if (frameOfReferenceUID) {
          annotation.state.removeFrameOfReferenceAnnotations(frameOfReferenceUID);
        }
        
        const element = activeViewport.element;
        if (element) {
          const svgLayer = element.querySelector('.cornerstone-svg-layer');
          if (svgLayer) {
            svgLayer.innerHTML = '';
          }
        }
        
        safeRender(activeViewport);
        
      } catch (error) {
        try {
          const element = activeViewport.element;
          if (element) {
            const svgLayer = element.querySelector('.cornerstone-svg-layer');
            if (svgLayer) {
              svgLayer.innerHTML = '';
              safeRender(activeViewport);
            }
          }
        } catch (fallbackError) {
          // Ignore
        }
      }
    }
  }, [safeRender, getActiveViewport]);

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
            <Button
              variant={activeTool === 'ellipse' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('ellipse')}
              title="Elliptical ROI"
            >
              <Circle className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'arrow' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('arrow')}
              title="Arrow Annotation"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'angle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('angle')}
              title="Angle Measurement"
            >
              <Triangle className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'cobb' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('cobb')}
              title="Cobb Angle"
            >
              <Triangle className="h-4 w-4 rotate-45" />
            </Button>
            <Button
              variant={activeTool === 'probe' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setToolActive('probe')}
              title="Probe Tool"
            >
              <Crosshair className="h-4 w-4" />
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
        {currentLayout.cols * currentLayout.rows > 1 ? (
          // Multi-viewport grid layout
          <div className="flex-1 bg-black">
            <div 
              className={`grid gap-[1px] bg-gray-800 h-full p-[1px]`}
              style={{
                gridTemplateColumns: `repeat(${currentLayout.cols}, 1fr)`,
                gridTemplateRows: `repeat(${currentLayout.rows}, 1fr)`
              }}
            >
              {Array.from({ length: currentLayout.cols * currentLayout.rows }, (_, index) => (
                <div
                  key={`viewport-${index}`}
                  ref={(el) => multiViewportRefs.current.set(index, el)}
                  className={`relative bg-black cursor-pointer transition-all ${
                    activeViewportIndex === index 
                      ? 'ring-2 ring-blue-500 ring-inset' 
                      : 'hover:ring-1 hover:ring-gray-500'
                  }`}
                  onClick={() => setActiveViewportIndex(index)}
                  style={{ 
                    minHeight: '200px',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    </div>
                  )}
                  
                  <div className="absolute top-2 left-2 text-white text-xs px-2 py-1 rounded z-20 bg-black/70">
                    {index + 1}
                  </div>
                  
                  {showOverlay && activeViewportIndex === index && (
                    <DicomOverlay
                      isVisible={true}
                      studyMetadata={studyMetadata}
                      examinations={examinations}
                      enhancedDicomData={enhancedDicomData}
                      windowLevel={dynamicOverlayData.windowLevel}
                      zoomPercentage={dynamicOverlayData.zoomPercentage}
                      mousePosition={dynamicOverlayData.mousePosition}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Single DICOM Viewport
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
            windowLevel={dynamicOverlayData.windowLevel}
            zoomPercentage={dynamicOverlayData.zoomPercentage}
            mousePosition={dynamicOverlayData.mousePosition}
          />
          </div>
        )}
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
                  viewportIdSuffix={viewportIdSuffix}
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
  viewportIdSuffix?: string;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = ({ imageId, index, isActive, onClick, viewportIdSuffix = '' }) => {
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
        
        const thumbViewportId = `thumbViewport-${index}-persistent${viewportIdSuffix || ''}`;
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