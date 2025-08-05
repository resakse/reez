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
  FlipHorizontal, Palette, Eye, EyeOff
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
async function preRegisterWadorsMetadata(imageIds: string[], pacsServerId?: string | null): Promise<void> {
  try {
    // Get the DICOM image loader from window or import
    const dicomImageLoader = (window as any).cornerstoneDICOMImageLoader || cornerstoneDICOMImageLoader;
    
    if (!dicomImageLoader?.wadors?.metaDataManager) {
      return;
    }
    
    // Process all images concurrently with higher parallelism
    const maxConcurrent = 10;
    const semaphore = Array(maxConcurrent).fill(0);
    let activeRequests = 0;
    
    await Promise.all(imageIds.map(async (imageId, index) => {
      // Wait for available slot
      while (activeRequests >= maxConcurrent) {
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      }
      activeRequests++;
      
      try {
        if (!imageId.startsWith('wadors:')) {
          return; // Skip non-WADO-RS images
        }
        
        try {
          // Extract frames URL and convert to metadata URL
          const framesUrl = imageId.replace('wadors:', '');
          let metadataUrl = framesUrl.replace('/frames/1', '/metadata');
          
          // Add PACS server ID parameter if provided
          if (pacsServerId) {
            const separator = metadataUrl.includes('?') ? '&' : '?';
            metadataUrl += `${separator}pacs_server_id=${pacsServerId}`;
          }
          
          // Fetch metadata from our endpoint
          const response = await AuthService.authenticatedFetch(metadataUrl);
          
          if (!response.ok) {
            return;
          }
          
          const metadataArray = await response.json();
          const metadata = metadataArray[0]; // WADO-RS returns array format
          
          // Validate metadata structure
          if (!metadata || typeof metadata !== 'object') {
            return;
          }
          
          // Ensure critical tags are present and properly formatted
          const criticalTags = ['00280010', '00280011', '00280100', '00280002', '00280004'];
          let isValid = true;
          
          for (const tag of criticalTags) {
            if (!metadata[tag]?.Value || !Array.isArray(metadata[tag].Value)) {
              isValid = false;
            }
          }
          
          // Add additional validation for samplesPerPixel (00280002)
          if (metadata['00280002']?.Value?.[0] === undefined) {
            // Provide default value
            if (!metadata['00280002']) metadata['00280002'] = { vr: 'US', Value: [1] };
            else if (!metadata['00280002'].Value) metadata['00280002'].Value = [1];
            else if (metadata['00280002'].Value[0] === undefined) metadata['00280002'].Value[0] = 1;
          }
          
          // Add photometricInterpretation if missing (00280004)
          if (!metadata['00280004']?.Value?.[0]) {
            if (!metadata['00280004']) metadata['00280004'] = { vr: 'CS', Value: ['MONOCHROME2'] };
            else if (!metadata['00280004'].Value) metadata['00280004'].Value = ['MONOCHROME2'];
          }
          
          if (!isValid) {
            return;
          }
          
          // Register metadata with Cornerstone WADO-RS metadata manager
          dicomImageLoader.wadors.metaDataManager.add(imageId, metadata);
          
        } catch (error) {
          // Continue with other images even if one fails
        }
      } finally {
        activeRequests--;
      }
    }));
    
  } catch (error) {
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
      // Initialize Cornerstone3D libraries in sequence
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
            // Continue without authentication - images should still load via proxy
          }
        },
        // Optimize for performance and multi-image loading
        useWebWorkers: true,
        maxWebWorkers: 4, // Increase for better concurrent loading
        strict: false, // Allow more lenient DICOM parsing
        decodeConfig: {
          convertFloatPixelDataToInt: false,
          use16BitDataType: true,
          usePDFJS: false,
          useWebGL: false, // Disable WebGL to prevent GPU issues
        },
        // Configure image loader for better error handling
        errorInterceptor: (error: any) => {
          // Don't throw - let the viewer handle gracefully
          return error;
        },
        // Optimized web worker config for better performance
        webWorkerTaskPools: {
          decodeTask: {
            maxConcurrency: 4,
            targetUtilization: 0.8 // Higher utilization for better throughput
          }
        }
      });
      
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
        
      } catch (metaDataError) {
        // Ignore metadata provider registration errors
      }
      
      await toolsInit();
      
      // Add all tools to the global state with error checking
      try {
        addTool(WindowLevelTool);
        addTool(ZoomTool);
        addTool(PanTool);
        addTool(LengthTool);
        addTool(RectangleROITool);
        addTool(EllipticalROITool);
        addTool(StackScrollTool);
      } catch (toolError) {
        throw new Error(`Tool registration failed: ${toolError.message}`);
      }
      
      isCornerstoneInitialized = true;
    } catch (error) {
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
  pacsServerId?: string | null;
  // DICOM overlay props
  showOverlay?: boolean;
  setShowOverlay?: (show: boolean) => void;
  examinations?: any[];
  enhancedDicomData?: any[];
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

// Smart Windowed Loading interfaces
interface ImageWindow {
  centerIndex: number;
  preloadCount: number;
  cacheSize: number;
  urls: Map<number, string>;
}

interface ImageCache {
  maxSize: number;
  currentWindow: number[];
  lruQueue: number[];
  memoryLimit: number;
  imageData: Map<number, string>;
}

interface SeriesLoadingState {
  seriesId: string;
  seriesUID: string;
  totalImages: number;
  loadedRanges: Array<{start: number, end: number}>;
  isActive: boolean;
}

const SimpleDicomViewer: React.FC<SimpleDicomViewerProps> = ({ 
  imageIds: initialImageIds, 
  seriesInfo = [], 
  studyMetadata,
  pacsServerId,
  showOverlay = false,
  setShowOverlay,
  examinations = [],
  enhancedDicomData = []
}) => {
  // Debug re-renders with detailed prop change tracking
  const renderCountRef = useRef(0);
  const prevPropsRef = useRef({ imageIds: initialImageIds, seriesInfo, studyMetadata });
  
  renderCountRef.current++;
  const currentProps = { imageIds: initialImageIds, seriesInfo, studyMetadata };
  const prevProps = prevPropsRef.current;
  
  const propsChanged = {
    imageIds: JSON.stringify(prevProps.imageIds) !== JSON.stringify(currentProps.imageIds),
    seriesInfo: JSON.stringify(prevProps.seriesInfo) !== JSON.stringify(currentProps.seriesInfo),
    studyMetadata: JSON.stringify(prevProps.studyMetadata) !== JSON.stringify(currentProps.studyMetadata)
  };
  
  if (propsChanged.imageIds || propsChanged.seriesInfo || propsChanged.studyMetadata) {
    // Props have changed, component will re-render
  }
  
  prevPropsRef.current = currentProps;

  const mainViewportRef = useRef<HTMLDivElement>(null);
  // Add debugging wrapper for state setters
  const createDebugSetter = (name: string, setter: any) => {
    return (...args: any[]) => {
      return setter(...args);
    };
  };

  const [imageIds, setImageIdsRaw] = useState<string[]>(initialImageIds);
  // Convert engine/viewport/toolGroup to refs - they don't need to trigger re-renders
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<any>(null);
  const toolGroupRef = useRef<any>(null);
  
  // Keep only UI-affecting state as actual state
  const [currentImageIndex, setCurrentImageIndexRaw] = useState<number>(0);
  const [error, setErrorRaw] = useState<string | null>(null);
  const [loading, setLoadingRaw] = useState<boolean>(true);
  const [loadingNavigation, setLoadingNavigationRaw] = useState<boolean>(false);
  const [switchingSeries, setSwitchingSeriesRaw] = useState<boolean>(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Convert loading states to refs if they don't need to trigger UI updates
  const isStackLoadingRef = useRef<boolean>(false);
  const backgroundLoadingRef = useRef<boolean>(false);
  const [activeTool, setActiveToolRaw] = useState<Tool>('wwwc');
  const [isPlaying, setIsPlayingRaw] = useState<boolean>(false);
  const [isInverted, setIsInvertedRaw] = useState<boolean>(false);  // Will be set automatically based on PhotometricInterpretation
  const [isFlippedHorizontal, setIsFlippedHorizontalRaw] = useState<boolean>(false);
  const [isToolbarMinimized, setIsToolbarMinimizedRaw] = useState<boolean>(false);
  const [toolbarPosition, setToolbarPositionRaw] = useState({ x: 0, y: 16 }); // Initial position
  const [loadingSeries, setLoadingSeriesRaw] = useState<Set<string>>(new Set());
  const [windowLoadingStatus, setWindowLoadingStatus] = useState<{
    isLoading: boolean;
    phase: 'immediate' | 'background' | 'progressive' | 'idle';
    progress: number;
    eta: number; // estimated time remaining in ms
    seriesId: string;
  } | null>(null);
  
  // Debug-wrapped setters
  const setImageIds = createDebugSetter('imageIds', setImageIdsRaw);
  
  // Ref setters for non-UI state - no re-renders
  const setRenderingEngine = (engine: RenderingEngine | null) => {
    renderingEngineRef.current = engine;
  };
  const setViewport = (viewport: any) => {
    viewportRef.current = viewport;
  };
  const setToolGroup = (toolGroup: any) => {
    toolGroupRef.current = toolGroup;
  };
  const setCurrentImageIndex = createDebugSetter('currentImageIndex', setCurrentImageIndexRaw);
  const setError = createDebugSetter('error', setErrorRaw);
  const setLoading = createDebugSetter('loading', setLoadingRaw);
  const setLoadingNavigation = createDebugSetter('loadingNavigation', setLoadingNavigationRaw);
  const setSwitchingSeries = createDebugSetter('switchingSeries', setSwitchingSeriesRaw);
  
  // Delayed loading indicator - only shows after 150ms for cache misses
  const setLoadingNavigationDelayed = (isLoading: boolean) => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    if (isLoading) {
      // Show loading indicator immediately
      setLoadingNavigation(true);
    } else {
      // Immediately hide loading indicator
      setLoadingNavigation(false);
    }
  };
  
  // Ref setters for internal loading states
  const setBackgroundLoading = (value: boolean) => {
    backgroundLoadingRef.current = value;
  };
  const setIsStackLoading = (value: boolean) => {
    isStackLoadingRef.current = value;
  };
  const setActiveTool = createDebugSetter('activeTool', setActiveToolRaw);
  const setIsPlaying = createDebugSetter('isPlaying', setIsPlayingRaw);
  const setIsInverted = createDebugSetter('isInverted', setIsInvertedRaw);
  const setIsFlippedHorizontal = createDebugSetter('isFlippedHorizontal', setIsFlippedHorizontalRaw);
  const setIsToolbarMinimized = createDebugSetter('isToolbarMinimized', setIsToolbarMinimizedRaw);
  const setToolbarPosition = createDebugSetter('toolbarPosition', setToolbarPositionRaw);
  const setLoadingSeries = createDebugSetter('loadingSeries', setLoadingSeriesRaw);
  
  // Current series tracking for new simplified loading system
  const [currentSeriesId, setCurrentSeriesId] = useState<string | null>(null);
  
  
  // Performance monitoring
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    timeToFirstImage: number | null;
    cacheHitRate: number;
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    averageLoadTime: number;
    loadTimes: number[];
  }>({
    timeToFirstImage: null,
    cacheHitRate: 0,
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageLoadTime: 0,
    loadTimes: []
  });
  
  const performanceStartTime = useRef<number>(Date.now());
  const firstImageLoadTime = useRef<number | null>(null);
  
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  
  // Create convenience references for easier access
  const renderingEngine = renderingEngineRef.current;
  const viewport = viewportRef.current;
  const toolGroup = toolGroupRef.current;
  const isStackLoading = isStackLoadingRef.current;
  const backgroundLoading = backgroundLoadingRef.current;

  // Store per-image settings
  const imageSettingsRef = useRef<Map<number, ImageSettings>>(new Map());
  const saveSettingsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track initialization state to prevent double loading
  const initializationRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  // Track if bulk loading has been initiated to prevent duplicate useEffect runs
  const bulkLoadingInitiatedRef = useRef(false);
  
  // Removed idle expansion refs - no longer needed
  
  // Series loading progress tracking - shows loaded/total for each series
  const [seriesLoadingProgress, setSeriesLoadingProgressRaw] = useState<Record<string, {loaded: number, total: number}>>({});
  const setSeriesLoadingProgress = createDebugSetter('seriesLoadingProgress', setSeriesLoadingProgressRaw);
  
  // Track which series are currently being loaded to avoid duplicates
  const activeSeriesLoaders = useRef<Set<string>>(new Set());
  
  // Track which series have been fully loaded
  const loadedSeries = useRef<Map<string, string[]>>(new Map());
  
  // Track representative images for thumbnails (one per series)
  const representativeImages = useRef<Map<string, string>>(new Map());
  
  // Track current loading controller to cancel previous loads
  const currentLoadingController = useRef<AbortController | null>(null);
  
  // Progressive series loading: immediate first batch + background loading of remaining batches
  const loadSeriesInBackground = useCallback(async (seriesKey: string, series: any) => {
    // Prevent duplicate loading of same series
    if (activeSeriesLoaders.current.has(seriesKey)) {
      return;
    }
    
    // Create abort controller for this loading operation
    const abortController = new AbortController();
    currentLoadingController.current = abortController;
    
    activeSeriesLoaders.current.add(seriesKey);
    
    // Check if we're resuming a partially loaded series (not first-time loading)
    const existingCached = loadedSeries.current.get(seriesKey);
    const expectedTotalImages = series.instanceCount || 1;
    
    if (existingCached && existingCached.length > 0 && existingCached.length < expectedTotalImages) {
      // We're resuming - skip the first batch loading and go straight to sequential loading
      try {
        setImageIds(existingCached); // Show existing progress immediately
        // Ensure representative image is stored for thumbnail
        if (existingCached.length > 0) {
          representativeImages.current.set(seriesKey, existingCached[0]);
        }
        
        // Jump directly to sequential loading from where we left off
        let currentImageIds = [...existingCached];
        const batchSize = 20;
        
        // Calculate starting point for loading (resume from where we left off)
        const startingBatch = Math.floor(currentImageIds.length / batchSize);
        const startingImageIndex = startingBatch * batchSize;
        
        // Only proceed if there are more images to load
        if (startingImageIndex < expectedTotalImages) {
          // Sequential batch loading for remaining images
          const loadBatchSequentially = async (start: number, batchIndex: number): Promise<string[]> => {
            try {
              const response = await AuthService.authenticatedFetch(
                `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyMetadata?.studyInstanceUID}/series/${series.seriesInstanceUID}/images/bulk?start=${start}&count=${batchSize}`
              );
              
              if (!response.ok) return [];
              
              const batchData = await response.json();
              const batchImages = batchData.images || [];
              const batchImageUrls = batchImages.map((img: any) => img.imageUrl);
              
              if (batchImageUrls.length === 0) return [];
              
              const wadorsImageIds = batchImageUrls.map((url: string) => `wadors:${url}`);
              await preRegisterWadorsMetadata(wadorsImageIds, pacsServerId);
              
              // Load images in this batch
              const { imageLoader } = await import('@cornerstonejs/core');
              const imageLoadPromises = wadorsImageIds.map(async (imageId) => {
                try {
                  await imageLoader.loadAndCacheImage(imageId);
                } catch (err) {
                  // Silent fail for individual images
                }
              });
              
              await Promise.all(imageLoadPromises);
              return wadorsImageIds;
              
            } catch (error) {
              return [];
            }
          };
          
          // Load remaining batches sequentially
          for (let start = Math.max(batchSize, startingImageIndex); start < expectedTotalImages; start += batchSize) {
            if (abortController.signal.aborted) {
              activeSeriesLoaders.current.delete(seriesKey);
              return;
            }
            
            const batchIndex = Math.floor(start / batchSize);
            const batchImageIds = await loadBatchSequentially(start, batchIndex);
            
            if (batchImageIds.length > 0) {
              if (abortController.signal.aborted) {
                activeSeriesLoaders.current.delete(seriesKey);
                return;
              }
              
              currentImageIds = [...currentImageIds, ...batchImageIds];
              setImageIds(currentImageIds);
              loadedSeries.current.set(seriesKey, [...currentImageIds]);
            }
          }
        }
        
        // Mark as completed
        setSwitchingSeries(false);
        return;
        
      } catch (err) {
        // Fall through to normal loading if resume fails
      }
    }
    
    try {
      const totalImages = series.instanceCount || 1;
      const { imageLoader } = await import('@cornerstonejs/core');
      const batchSize = 20;
      let loaded = 0;
      let actualTotalImages = totalImages;
      
      // Initialize progress tracking
      setSeriesLoadingProgress(prev => ({ 
        ...prev, 
        [seriesKey]: { loaded: 0, total: totalImages } 
      }));
      
      // Get actual total image count quickly
      const initialResponse = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyMetadata?.studyInstanceUID}/series/${series.seriesInstanceUID}/images/bulk?start=0&count=1`
      );
      
      if (initialResponse.ok) {
        const initialData = await initialResponse.json();
        if (initialData.totalImages) {
          actualTotalImages = initialData.totalImages;
          setSeriesLoadingProgress(prev => ({ 
            ...prev, 
            [seriesKey]: { loaded: 0, total: actualTotalImages } 
          }));
        }
      }
      
      // PHASE 1: Load first batch synchronously for immediate display
      const loadFirstBatch = async (): Promise<string[]> => {
        try {
          const response = await AuthService.authenticatedFetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyMetadata?.studyInstanceUID}/series/${series.seriesInstanceUID}/images/bulk?start=0&count=${batchSize}`
          );
          
          if (!response.ok) return [];
          
          const batchData = await response.json();
          const batchImages = batchData.images || [];
          const batchImageUrls = batchImages.map((img: any) => img.imageUrl);
          
          if (batchImageUrls.length === 0) return [];
          
          // Convert to WADORS format and register metadata
          const wadorsImageIds = batchImageUrls.map((url: string) => `wadors:${url}`);
          await preRegisterWadorsMetadata(wadorsImageIds, pacsServerId);
          
          // Load all images in first batch
          const imageLoadPromises = wadorsImageIds.map(async (imageId) => {
            try {
              await imageLoader.loadAndCacheImage(imageId);
              loaded++;
            } catch (err) {
              loaded++; // Count failed images to keep progress moving
            }
          });
          
          await Promise.all(imageLoadPromises);
          
          // Update progress for first batch
          setSeriesLoadingProgress(prev => ({ 
            ...prev, 
            [seriesKey]: { loaded, total: actualTotalImages } 
          }));
          
          return wadorsImageIds;
        } catch (error) {
          return [];
        }
      };
      
      // Load and display first batch immediately
      const firstBatchImageIds = await loadFirstBatch();
      
      // Check if loading was aborted
      if (abortController.signal.aborted) {
        activeSeriesLoaders.current.delete(seriesKey);
        return;
      }
      
      setImageIds(firstBatchImageIds); // Show first batch immediately
      
      // Store first batch in cache and representative image for thumbnails
      if (firstBatchImageIds.length > 0) {
        loadedSeries.current.set(seriesKey, [...firstBatchImageIds]);
        // Store first image as representative for thumbnail
        representativeImages.current.set(seriesKey, firstBatchImageIds[0]);
        setLoading(false);
        setSwitchingSeries(false);
      }
      
      // PHASE 2: Load remaining batches sequentially in background
      if (actualTotalImages > batchSize) {
        let currentImageIds = [...firstBatchImageIds]; // Start with first batch
        
        // Check if we're resuming a partially loaded series
        const existingCached = loadedSeries.current.get(seriesKey);
        if (existingCached && existingCached.length > firstBatchImageIds.length) {
          // Resume from existing progress
          currentImageIds = [...existingCached];
          setImageIds(currentImageIds); // Update UI with existing progress
        }
        
        // Sequential batch loading function
        const loadBatchSequentially = async (start: number, batchIndex: number): Promise<string[]> => {
          try {
            const response = await AuthService.authenticatedFetch(
              `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyMetadata?.studyInstanceUID}/series/${series.seriesInstanceUID}/images/bulk?start=${start}&count=${batchSize}`
            );
            
            if (!response.ok) return [];
            
            const batchData = await response.json();
            const batchImages = batchData.images || [];
            const batchImageUrls = batchImages.map((img: any) => img.imageUrl);
            
            if (batchImageUrls.length === 0) return [];
            
            const wadorsImageIds = batchImageUrls.map((url: string) => `wadors:${url}`);
            await preRegisterWadorsMetadata(wadorsImageIds, pacsServerId);
            
            // Load images in this batch
            const imageLoadPromises = wadorsImageIds.map(async (imageId) => {
              try {
                await imageLoader.loadAndCacheImage(imageId);
                loaded++;
                
                // Throttled progress updates
                if (loaded % 5 === 0 || loaded === actualTotalImages) {
                  setSeriesLoadingProgress(prev => ({ 
                    ...prev, 
                    [seriesKey]: { loaded, total: actualTotalImages } 
                  }));
                }
              } catch (err) {
                loaded++;
              }
            });
            
            await Promise.all(imageLoadPromises);
            return wadorsImageIds;
            
          } catch (error) {
            return [];
          }
        };
        
        // Calculate starting point for loading (resume from where we left off)
        const startingBatch = Math.floor(currentImageIds.length / batchSize);
        const startingImageIndex = startingBatch * batchSize;
        
        // Load batches sequentially starting from where we left off
        for (let start = Math.max(batchSize, startingImageIndex); start < actualTotalImages; start += batchSize) {
          const batchIndex = Math.floor(start / batchSize);
          const batchImageIds = await loadBatchSequentially(start, batchIndex);
          
          if (batchImageIds.length > 0) {
            // Check if loading was aborted before updating UI
            if (abortController.signal.aborted) {
              activeSeriesLoaders.current.delete(seriesKey);
              return;
            }
            
            // Add this batch to current images and update UI immediately
            currentImageIds = [...currentImageIds, ...batchImageIds];
            setImageIds(currentImageIds);
            
            // Update the loaded series cache with current progress
            loadedSeries.current.set(seriesKey, [...currentImageIds]);
          }
        }
      }
      
      // Final progress update
      setSeriesLoadingProgress(prev => ({ 
        ...prev, 
        [seriesKey]: { loaded: actualTotalImages, total: actualTotalImages } 
      }));
      
      // Series is already stored progressively during loading, no need to store again
      
      // Remove progress indicator after brief delay
      setTimeout(() => {
        setSeriesLoadingProgress(prev => {
          const updated = { ...prev };
          delete updated[seriesKey];
          return updated;
        });
      }, 1000);
      
    } catch (err) {
      // Clean up on error
      setSeriesLoadingProgress(prev => {
        const updated = { ...prev };
        delete updated[seriesKey];
        return updated;
      });
      // Clear switching state on error
      setSwitchingSeries(false);
      setLoading(false);
    } finally {
      activeSeriesLoaders.current.delete(seriesKey);
    }
  }, [studyMetadata?.studyInstanceUID]);

  // Smart series switching that handles already loaded/loading series
  const switchToSeries = useCallback((seriesKey: string, series: any) => {
    
    // If this is the current series, do nothing
    if (currentSeriesId === seriesKey) {
      return;
    }
    
    // Cancel any previous loading to prevent UI conflicts
    if (currentLoadingController.current) {
      currentLoadingController.current.abort();
      currentLoadingController.current = null;
    }
    
    // Check if series is already fully loaded
    const cachedImages = loadedSeries.current.get(seriesKey);
    const expectedTotalImages = series.instanceCount || 1;
    
    if (cachedImages && cachedImages.length > 0) {
      // Switch to cached images immediately
      setImageIds(cachedImages);
      setCurrentImageIndex(0);
      setCurrentSeriesId(seriesKey);
      
      // Check if this series is fully loaded or needs to resume downloading
      if (cachedImages.length >= expectedTotalImages) {
        // Series is fully loaded
        setSwitchingSeries(false);
        return;
      } else {
        // Series is partially loaded - resume downloading in background
        setSwitchingSeries(true);
        loadSeriesInBackground(seriesKey, series);
        return;
      }
    }
    
    // Check if series is currently loading
    if (activeSeriesLoaders.current.has(seriesKey)) {
      // Series is loading - just switch to it and show current progress
      const currentProgress = loadedSeries.current.get(seriesKey) || [];
      setImageIds(currentProgress);
      setCurrentImageIndex(0);
      setCurrentSeriesId(seriesKey);
      setSwitchingSeries(true); // Show progress indicator
      return;
    }
    
    // Series not loaded and not loading - start fresh loading
    setSwitchingSeries(true);
    setLoading(true);
    
    // Clear imageIds when switching to a new series to prevent mixing
    setImageIds([]);
    
    // Reset to first image of new series
    setCurrentImageIndex(0);
    
    // Update current series
    setCurrentSeriesId(seriesKey);
    
    // Start loading this series in background
    loadSeriesInBackground(seriesKey, series);
  }, [loadSeriesInBackground, currentSeriesId]);
  
  // Only load series when explicitly requested (first series auto-loads, others load on thumbnail click)
  // Removed automatic continuous loading - series only load when user clicks thumbnail



  // CRITICAL: Update local imageIds when prop changes - required for viewport initialization
  useEffect(() => {
    setImageIdsRaw(initialImageIds);
  }, [initialImageIds]);

  // Initialize Smart Windowed Loading on page load
  useEffect(() => {
    // Prevent duplicate execution of this useEffect
    if (bulkLoadingInitiatedRef.current) {
      return;
    }
    
    if (seriesInfo.length > 0 && studyMetadata?.studyInstanceUID) {
      bulkLoadingInitiatedRef.current = true; // Mark as initiated
      
      // Automatically start loading the first series (active series)
      if (seriesInfo[0]) {
        const firstSeries = seriesInfo[0];
        const firstSeriesKey = firstSeries.seriesInstanceUID || 'series-0';
        
        // Switch to and start loading first series
        switchToSeries(firstSeriesKey, firstSeries);
        
        // Reset performance metrics for new session
        performanceStartTime.current = Date.now();
        firstImageLoadTime.current = null;
        setPerformanceMetrics({
          timeToFirstImage: null,
          cacheHitRate: 0,
          totalRequests: 0,
          cacheHits: 0,
          cacheMisses: 0,
          averageLoadTime: 0,
          loadTimes: []
        });
      }
    }
  }, [seriesInfo, studyMetadata]);

  // Removed the old complex loadImageWindow function - replaced with simpler series-based loading

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
    } catch (error) {
      // Ignore save errors
    }
  }, [viewport]);
  
  const restoreImageSettings = useCallback((imageIndex: number) => {
    if (!viewport) return;
    
    const settings = imageSettingsRef.current.get(imageIndex);
    if (!settings) {
      return;
    }
    
    try {
      
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
      // Ignore restore errors
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
        }
      }
    }
  }, []);

  // Helper function to handle DICOM loading errors, especially buffer overruns
  const handleDicomError = useCallback((error: any, imageId: string, retryCallback?: () => Promise<void>) => {
    const errorMessage = (error?.message?.toLowerCase && error.message.toLowerCase()) || '';
    
    // Check for specific error types - ensure errorMessage is a string
    if (errorMessage && (errorMessage.includes('buffer overrun') || errorMessage.includes('parsedicomdatasetexplicit'))) {
      // Removed toast notification
      
      // For buffer overrun errors, try to reload immediately
      if (retryCallback) {
        retryCallback().catch(retryError => {
          // Ignore retry errors
        });
      }
      
      return 'buffer_overrun';
    } else if (errorMessage && (errorMessage.includes('timeout') || errorMessage.includes('network'))) {
      // Removed toast notification
      return 'network_timeout';
    } else if (errorMessage && (errorMessage.includes('404') || errorMessage.includes('not found'))) {
      // Removed toast notification
      return 'not_found';
    } else {
      // Removed toast notification
      return 'unknown';
    }
  }, []);
  
  // Initialize Cornerstone3D - with better DOM readiness
  useEffect(() => {
    // Prevent double initialization
    if (initializationRef.current) {
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
        return true; // Prevent default error handling
      }
      // Let other errors through
      if (originalError) {
        return originalError(message, source, lineno, colno, error);
      }
      return false;
    };
    
    window.onerror = handleVTKError;

    if (!imageIds || imageIds.length === 0) {
      setLoading(false);
      return;
    }

    // If viewport already exists, just add new images to the stack instead of reinitializing
    if (viewport) {
      try {
        // Update the existing viewport with new images (setStack is not async)
        viewport.setStack(imageIds, Math.min(currentImageIndex, imageIds.length - 1));
        viewport.render();
        setLoading(false);
        return;
      } catch (error) {
        // Fall through to full reinitialization
      }
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
        // Prevent multiple simultaneous loads
        if (isStackLoading) {
          return;
        }
        
        // Batch initial state updates to reduce re-renders
        setIsStackLoading(true);
        setLoading(true);
        setError(null);

        // Wait for DOM element to be ready and visible
        const element = await waitForElement();
        
        await initializeCornerstone();
        const renderingEngineId = `simpleDicomViewer-${Date.now()}`;  // Unique ID to prevent conflicts
        const engine = new RenderingEngine(renderingEngineId);
        setRenderingEngine(engine);

        const viewportId = `stackViewport-${Date.now()}`;  // Unique ID to prevent conflicts
        const viewportInput = {
          viewportId,
          element: element, // Use the element we waited for
          type: ViewportType.STACK,
        };

        engine.enableElement(viewportInput);
        const stackViewport = engine.getViewport(viewportId);
        setViewport(stackViewport);

        if (imageIds.length === 0) {
          throw new Error('No image IDs provided');
        }
        
        // Ensure currentImageIndex is valid
        const startIndex = Math.min(currentImageIndex, imageIds.length - 1);
        
        try {
          // Pre-register WADO-RS metadata for the limited images only
          await preRegisterWadorsMetadata(imageIds, pacsServerId);
          
          // Check PhotometricInterpretation from metadata BEFORE loading image
          let shouldInvert = false;
          try {
            const { metaData } = await import('@cornerstonejs/core');
            const imagePixelModule = metaData.get('imagePixelModule', imageIds[startIndex]);
            if (imagePixelModule?.photometricInterpretation === 'MONOCHROME1') {
              shouldInvert = true;
            }
            setIsInverted(shouldInvert);
          } catch (metaErr) {
            // Ignore metadata errors, use default
          }
          
          // Load WADO-RS image - NO FALLBACK TO WADOURI
          await stackViewport.setStack([imageIds[startIndex]], 0);
          
          // Set inversion immediately after stack is loaded
          if (shouldInvert) {
            const properties = stackViewport.getProperties();
            stackViewport.setProperties({
              ...properties,
              invert: shouldInvert
            });
          }
          
        } catch (stackError) {
          // Use our enhanced error handler
          const errorType = handleDicomError(stackError, imageIds[startIndex] || 'unknown', async () => {
            // Retry logic for stack loading
            await stackViewport.setStack(imageIds, startIndex);
          });
          
          // If it's a buffer overrun, try loading just the current image
          if (errorType === 'buffer_overrun' && imageIds.length > 0) {
            try {
              await stackViewport.setStack([imageIds[startIndex]], 0);
              // Removed toast notification
            } catch (singleImageError) {
              throw singleImageError;
            }
          } else {
            throw stackError;
          }
        }
        
        // Fit image to viewport while preserving aspect ratio and centering
        stackViewport.resetCamera();
        
        // Simple: just reset camera and render
        stackViewport.resetCamera();
        stackViewport.render();
        
        // Apply CSS to fill viewport while maintaining aspect ratio
        const canvas = stackViewport.canvas;
        if (canvas) {
          canvas.style.objectFit = 'cover';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
        }
        
        stackViewport.render();


        // Set up ResizeObserver for aspect ratio preservation
        if (element && !resizeObserverRef.current) {
          resizeObserverRef.current = new ResizeObserver((entries) => {
            if (engine && stackViewport) {
              // Use a small delay to ensure proper resize handling, especially after fullscreen exit
              setTimeout(() => {
                try {
                  // Resize the rendering engine first with force flag
                  engine.resize(true, true); // Force immediate resize
                  
                  // Simple resize handling - just reset camera
                  setTimeout(() => {
                    stackViewport.resetCamera();
                    stackViewport.render();
                    
                    // Force canvas to fill viewport while maintaining aspect ratio
                    const canvas = stackViewport.canvas;
                    if (canvas) {
                      canvas.style.objectFit = 'cover';
                      canvas.style.width = '100%';
                      canvas.style.height = '100%';
                    }
                  }, 50);
                  
                } catch (engineResizeError) {
                  // Fallback if engine resize fails
                  stackViewport.resetCamera();
                  stackViewport.render();
                }
              }, 100); // Small delay to handle fullscreen transition
            }
          });
          
          resizeObserverRef.current.observe(element);
        }

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
        } catch (toolError) {
          throw new Error(`Tool group setup failed: ${toolError.message}`);
        }

        // Add viewport to tool group AFTER metadata is registered and images are loaded
        // This prevents the "Cannot read properties of undefined (reading 'includes')" error
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
        } catch (activationError) {
          throw new Error(`Tool activation failed: ${activationError.message}`);
        }

        // Add event listener for window/level changes
        const viewportElement = stackViewport.element;
        viewportElement.addEventListener('cornerstoneimagerendered', () => {
          // Save settings immediately
          saveCurrentImageSettings();
        });

        // Batch final state updates to reduce re-renders
        setLoading(false);
        setIsStackLoading(false);
      } catch (err) {
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
          // Ignore destruction errors
        }
      }
      
      // Clean up tool group
      if (toolGroup) {
        try {
          ToolGroupManager.destroyToolGroup(toolGroup.id);
        } catch (e) {
          // Ignore destruction errors
        }
      }
    };
  }, [imageIds]); // Reinitialize when local imageIds state changes

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
      // Ignore tool activation errors
    }
  }, [toolGroup]);
  
  // Smart Navigation with windowed loading support
  const goToImage = useCallback(async (index: number) => {
    
    // Read current index from state functional update to avoid dependency
    setCurrentImageIndex(prevIndex => {
      
      if (viewport && index >= 0 && index !== prevIndex) {
        (async () => {
          try {
            // Save current image settings before navigating
            saveCurrentImageSettings();
            
            // Simple approach: just try to load the image directly
            
            // Update performance metrics
            setPerformanceMetrics(prev => ({
              ...prev,
              totalRequests: prev.totalRequests + 1,
              cacheHitRate: prev.cacheHits / (prev.totalRequests + 1) * 100
            }));
            
            // Show loading indicator for navigation
            setLoadingNavigationDelayed(true);
              
              // Simple navigation: just use the available imageIds directly
              const targetImageId = imageIds[index];
              if (targetImageId && viewport) {
                try {
                  // Navigate directly to the target image
                  await viewport.setStack([targetImageId], 0);
                  
                  // Stay within current series - no automatic series switching
                } catch (err) {
                  // Don't throw error, just log it
                }
              } else {
              }
            
            // Restore settings immediately
            restoreImageSettings(index);
            try {
              const image = viewport.getCurrentImageData();
              if (image && image.metadata) {
                const photometricInterpretation = image.metadata.PhotometricInterpretation;
                const shouldInvert = photometricInterpretation === 'MONOCHROME1';
                
                if (shouldInvert !== isInverted) {
                  setIsInverted(shouldInvert);
                  
                  const properties = viewport.getProperties();
                  viewport.setProperties({
                    ...properties,
                    invert: shouldInvert
                  });
                  viewport.render();
                }
              }
            } catch (photoError) {
              // Ignore photometric interpretation errors
            }
            
          } catch (error) {
            // Try to stay on current image if navigation fails
          } finally {
            setLoadingNavigationDelayed(false);
          }
        })();
        return index;
      }
      return prevIndex;
    });
  }, [viewport, imageIds, seriesInfo, currentSeriesId, switchToSeries]);
  
  // Removed old progressive expansion system - new system loads entire series automatically
  
  // Get the image boundaries for the current series only
  const getCurrentSeriesBounds = useCallback(() => {
    if (!currentSeriesId || seriesInfo.length === 0) {
      return { startIndex: 0, endIndex: imageIds.length - 1, seriesImageCount: imageIds.length };
    }
    
    // Find current series
    const currentSeries = seriesInfo.find(s => 
      (s.seriesInstanceUID || `series-${seriesInfo.indexOf(s)}`) === currentSeriesId
    );
    
    if (!currentSeries) {
      return { startIndex: 0, endIndex: imageIds.length - 1, seriesImageCount: imageIds.length };
    }
    
    // Since we only load images for the current series (other series load on demand),
    // the current series images should be the only ones in imageIds
    const progressData = seriesLoadingProgress[currentSeriesId];
    const seriesImageCount = progressData ? progressData.loaded : imageIds.length;
    
    return { 
      startIndex: 0, 
      endIndex: seriesImageCount - 1, 
      seriesImageCount 
    };
  }, [currentSeriesId, seriesInfo, imageIds.length, seriesLoadingProgress]);

  const nextImage = useCallback(() => {
    setCurrentImageIndex(prevIndex => {
      const { endIndex, seriesImageCount } = getCurrentSeriesBounds();
      const nextIndex = prevIndex + 1;
      
      
      if (nextIndex <= endIndex) {
        goToImage(nextIndex);
      } else {
      }
      return prevIndex; // Return previous index since goToImage will update it
    });
  }, [goToImage, getCurrentSeriesBounds]);
  
  const prevImage = useCallback(() => {
    setCurrentImageIndex(prevIndex => {
      const { startIndex } = getCurrentSeriesBounds();
      const newIndex = prevIndex - 1;
      
      
      if (newIndex >= startIndex) {
        goToImage(newIndex);
      } else {
      }
      return prevIndex; // Return previous index since goToImage will update it
    });
  }, [goToImage, getCurrentSeriesBounds]);
  
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
        // Ignore rotation errors
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
        }
        
        // Save settings after flip
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore flip errors
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
        
        // Save settings after invert
        saveCurrentImageSettings();
        
      } catch (error) {
        // Ignore invert errors
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
        
      } catch (error) {
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
          // Ignore fallback errors
        }
      }
    }
  }, [viewport]);

  const toggleOverlayVisibility = useCallback(() => {
    if (setShowOverlay) {
      setShowOverlay(!showOverlay);
    }
  }, [showOverlay, setShowOverlay]);

  
  // Mouse wheel navigation for scrollbar - only works when there are multiple images
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      // Only handle wheel events on the viewport when there are multiple images
      if (!mainViewportRef.current?.contains(event.target as Node) || imageIds.length <= 1) {
        return;
      }
      
      event.preventDefault();
      
      // If no viewport, do nothing
      if (!viewport) {
        return;
      }
      
      const delta = event.deltaY > 0 ? 1 : -1;
      
      // Calculate new index within current imageIds (which should only contain current series after switchToSeries)
      const newIndex = Math.max(0, Math.min(currentImageIndex + delta, imageIds.length - 1));
      
      // Only navigate if we're actually changing index
      if (newIndex !== currentImageIndex && imageIds[newIndex]) {
        setCurrentImageIndex(newIndex);
        
        // Use direct viewport navigation
        viewport.setStack([imageIds[newIndex]], 0).then(() => {
          viewport.render();
        }).catch(() => {
          // Ignore navigation errors - stay on current image
        });
      }
    };

    const element = mainViewportRef.current;
    if (element) {
      element.addEventListener('wheel', handleWheel, { passive: false });
      return () => element.removeEventListener('wheel', handleWheel);
    }
  }, [viewport, currentImageIndex, imageIds]);

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

  // Adaptive window sizing based on connection speed and device memory
  const getOptimalWindowSize = useCallback(() => {
    // Base window size
    let windowSize = 10;
    
    // Adjust based on device memory if available
    if ('deviceMemory' in navigator) {
      const deviceMemory = (navigator as any).deviceMemory; // GB
      if (deviceMemory >= 8) {
        windowSize = 15; // High memory device
      } else if (deviceMemory <= 2) {
        windowSize = 6;  // Low memory device
      }
    }
    
    // Adjust based on connection speed if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection.effectiveType === '4g') {
        windowSize = Math.min(windowSize * 1.5, 20); // Fast connection
      } else if (connection.effectiveType === '3g') {
        windowSize = Math.max(windowSize * 0.7, 5);   // Slower connection
      } else if (connection.effectiveType === '2g') {
        windowSize = Math.max(windowSize * 0.5, 3);   // Very slow connection
      }
    }
    
    return Math.round(windowSize);
  }, []);
  
  // Cleanup playback on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      // Removed idle expansion cleanup
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
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
        // Ignore destruction errors
      }
      setRenderingEngine(null);
    }
    if (toolGroup) {
      try {
        ToolGroupManager.destroyToolGroup(toolGroup.id);
      } catch (e) {
        // Ignore destruction errors
      }
      setToolGroup(null);
    }
    setViewport(null);
    
    // Trigger re-initialization immediately
    // The useEffect will run again naturally
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
  const showBlockingLoading = loading && !switchingSeries; // Only block for initial viewport setup
  const showNoImages = !loading && !switchingSeries && imageIds.length === 0;
  
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
              </>
            )}
          </div>
        </div>



        {/* Main Viewport - Full size */}
        <div className="flex-1 relative flex">
          {/* DICOM Viewport */}
          <div
            ref={mainViewportRef}
            className="flex-1 bg-black"
            style={{ 
              minHeight: '400px',
              position: 'relative',
              overflow: 'hidden',
              // Force the canvas to maintain aspect ratio
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* Loading Overlay - Only for initial viewport setup */}
            {showBlockingLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Card className="w-96">
                  <CardHeader>
                    <CardTitle>Loading DICOM Images...</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    {(() => {
                      const progressData = seriesLoadingProgress[currentSeriesId];
                      if (progressData && progressData.total > 0) {
                        const loadPercentage = Math.round((progressData.loaded / progressData.total) * 100);
                        return (
                          <div className="text-center mt-2">
                            <p>Loading images: {progressData.loaded}/{progressData.total}</p>
                            <div className="w-full bg-muted rounded-full h-2 mt-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all duration-300" 
                                style={{ width: `${loadPercentage}%` }}
                              ></div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{loadPercentage}% complete</p>
                          </div>
                        );
                      }
                      return <p className="text-center mt-2">Preparing first images...</p>;
                    })()}
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Subtle Navigation Loading Indicator - Top Right Corner */}
            {loadingNavigation && (
              <div className="absolute top-4 right-20 z-20 animate-in fade-in-0 duration-200">
                <div className="bg-background/90 backdrop-blur-sm border rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                  <span className="text-xs font-medium">Loading...</span>
                </div>
              </div>
            )}
            
            
            {/* Performance Metrics Debug Panel (bottom-left) */}
            {process.env.NODE_ENV === 'development' && performanceMetrics.timeToFirstImage && (
              <div className="absolute bottom-4 left-4 z-10">
                <Card className="w-72">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">📊 Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Time to first image:</span>
                      <span className={performanceMetrics.timeToFirstImage! < 500 ? 'text-green-600' : 
                                     performanceMetrics.timeToFirstImage! < 1000 ? 'text-yellow-600' : 'text-red-600'}>
                        {performanceMetrics.timeToFirstImage}ms
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cache hit rate:</span>
                      <span className={performanceMetrics.cacheHitRate > 90 ? 'text-green-600' : 
                                     performanceMetrics.cacheHitRate > 70 ? 'text-yellow-600' : 'text-red-600'}>
                        {performanceMetrics.cacheHitRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cache hits/misses:</span>
                      <span>{performanceMetrics.cacheHits}/{performanceMetrics.cacheMisses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg load time:</span>
                      <span>{performanceMetrics.averageLoadTime.toFixed(0)}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cache size:</span>
                      <span>Series-based loading</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Target: &lt;500ms first image, &gt;90% cache hit rate
                    </div>
                  </CardContent>
                </Card>
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
                          const studyUid = studyMetadata?.studyInstanceUID;
                          
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
            
            {/* DICOM Overlay - Positioned within viewport */}
            <DicomOverlay
              isVisible={showOverlay}
              studyMetadata={studyMetadata}
              examinations={examinations}
              enhancedDicomData={enhancedDicomData}
            />
          </div>
          
          {/* Vertical Scrollbar for Series Navigation */}
          {!showBlockingLoading && !showNoImages && imageIds.length > 1 && (
            <div className="w-6 bg-muted/5 border-l flex flex-col">
              {/* Series Image Counter */}
              <div className="px-1 py-1 border-b bg-background/90 text-center">
                <div className="text-xs font-medium text-muted-foreground">
                  {currentImageIndex + 1}/{imageIds.length}
                </div>
              </div>
              
              {/* Vertical Scrollbar */}
              <div className="flex-1 relative px-1 py-2">
                <div 
                  className="w-3 h-full bg-muted/30 rounded-sm relative mx-auto cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickY = e.clientY - rect.top;
                    const percentage = clickY / rect.height;
                    const newIndex = Math.floor(percentage * imageIds.length);
                    const clampedIndex = Math.max(0, Math.min(newIndex, imageIds.length - 1));
                    
                    if (clampedIndex !== currentImageIndex && imageIds[clampedIndex]) {
                      setCurrentImageIndex(clampedIndex);
                      if (viewport) {
                        viewport.setStack([imageIds[clampedIndex]], 0).then(() => {
                          viewport.render();
                        }).catch(() => {
                          // Ignore navigation errors
                        });
                      }
                    }
                  }}
                >
                  {/* Scrollbar Thumb */}
                  <div 
                    className="absolute w-full bg-primary rounded-sm transition-all duration-200 hover:bg-primary/80 cursor-grab active:cursor-grabbing"
                    style={{
                      height: Math.max(16, (1 / imageIds.length) * 100) + '%',
                      top: (currentImageIndex / Math.max(1, imageIds.length - 1)) * (100 - Math.max(16, (1 / imageIds.length) * 100)) + '%'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const scrollbarRect = e.currentTarget.parentElement!.getBoundingClientRect();
                      const thumbHeight = e.currentTarget.offsetHeight;
                      const trackHeight = scrollbarRect.height;
                      const usableHeight = trackHeight - thumbHeight;
                      
                      // Calculate where on the thumb the user clicked
                      const thumbRect = e.currentTarget.getBoundingClientRect();
                      const clickOffsetY = e.clientY - thumbRect.top;
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        // Calculate new thumb position based on mouse position minus the click offset
                        const mouseRelativeToTrack = moveEvent.clientY - scrollbarRect.top - clickOffsetY;
                        const newThumbTop = Math.max(0, Math.min(mouseRelativeToTrack, usableHeight));
                        
                        // Convert thumb position to image index
                        const percentage = usableHeight > 0 ? newThumbTop / usableHeight : 0;
                        const newIndex = Math.round(percentage * (imageIds.length - 1));
                        const clampedIndex = Math.max(0, Math.min(newIndex, imageIds.length - 1));
                        
                        if (clampedIndex !== currentImageIndex && imageIds[clampedIndex]) {
                          setCurrentImageIndex(clampedIndex);
                          if (viewport) {
                            viewport.setStack([imageIds[clampedIndex]], 0).then(() => {
                              viewport.render();
                            }).catch(() => {
                              // Ignore navigation errors
                            });
                          }
                        }
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnails Strip - Bottom */}
        {!showBlockingLoading && !showNoImages && (imageIds.length > 1 || seriesInfo.length > 1) && (
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

              {/* Thumbnails - Show individual images for current series, or series thumbnails if multiple series */}
              <div className="flex gap-1 flex-1 overflow-x-auto">
                {(() => {
                  // Debug logging
                  console.log('🔍 THUMBNAIL DEBUG - X-RAY FIX:', {
                    seriesInfoLength: seriesInfo.length,
                    imageIdsLength: imageIds.length,
                    currentSeriesId,
                    modality: studyMetadata?.modality,
                    imageIds: imageIds.slice(0, 3) // First 3 for debugging
                  });
                  
                  // Check if this is an X-ray study (CR, DR, XR) with few series that should show individual images
                  const isXRayStudy = studyMetadata?.modality && ['CR', 'DR', 'XR', 'DX'].includes(studyMetadata.modality);
                  const shouldShowIndividualImages = isXRayStudy && seriesInfo.length <= 5;
                  
                  // If we have multiple series but it's an X-ray study with few series, treat each series as individual image
                  if (shouldShowIndividualImages) {
                    console.log('🔍 X-RAY THUMBNAILS:', {
                      seriesInfo: seriesInfo.map(s => ({
                        uid: s.seriesInstanceUID, 
                        desc: s.seriesDescription,
                        count: s.instanceCount
                      })),
                      representativeImages: Array.from(representativeImages.current.entries())
                    });
                    
                    return seriesInfo.map((series, seriesIndex) => {
                      // Get representative image for this series  
                      const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                      let representativeImageId = representativeImages.current.get(seriesKey);
                      
                      console.log(`🔍 Series ${seriesIndex}:`, {
                        seriesKey,
                        representativeImageId,
                        hasImage: !!representativeImageId
                      });
                      
                      // If no representative image stored, create one by fetching the first instance of this series
                      if (!representativeImageId) {
                        // For X-ray studies, we need to fetch the first instance ID of this series
                        // For now, show a placeholder and load the actual image asynchronously
                        console.log(`🔧 Need to load first instance for series ${seriesIndex}: ${series.seriesInstanceUID}`);
                        
                        // Try to fetch the first image of this series asynchronously
                        (async () => {
                          try {
                            const response = await AuthService.authenticatedFetch(
                              `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/studies/${studyMetadata?.studyInstanceUID}/series/${series.seriesInstanceUID}/images/bulk?start=0&count=1`
                            );
                            
                            if (response.ok) {
                              const data = await response.json();
                              const firstImage = data.images?.[0];
                              if (firstImage?.imageUrl) {
                                const representativeImageUrl = `wadors:${firstImage.imageUrl}`;
                                representativeImages.current.set(seriesKey, representativeImageUrl);
                                console.log(`✅ Loaded representative image for series ${seriesIndex}:`, representativeImageUrl);
                                
                                // Force a re-render to show the new thumbnail
                                setImageIds(prev => [...prev]); // Trigger re-render
                              }
                            }
                          } catch (error) {
                            console.log(`❌ Failed to load representative image for series ${seriesIndex}:`, error);
                          }
                        })();
                        
                        // For now, skip this thumbnail until the image loads
                        return null;
                      }
                      
                      // Check if this series is currently active
                      const isActiveSeries = currentSeriesId === seriesKey;
                      
                      const handleSeriesClick = async () => {
                        const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                        
                        // Switch to this series
                        switchToSeries(seriesKey, series);
                        
                        // Navigate to first image of this series
                        goToImage(0);
                      };
                      
                      return (
                        <div
                          key={series.seriesId}
                          className="flex-shrink-0 flex flex-col items-center"
                          title={`${series.seriesDescription} (${series.instanceCount} images)`}
                        >
                          <ThumbnailImage
                            imageId={representativeImageId}
                            index={seriesIndex}
                            isActive={isActiveSeries}
                            onClick={handleSeriesClick}
                          />
                          
                          {/* Series name below thumbnail - shorter for X-ray */}
                          <div className="text-xs text-center mt-1 max-w-16 truncate">
                            {series.seriesDescription?.split(' ')[0] || `View ${seriesIndex + 1}`}
                          </div>
                        </div>
                      );
                    });
                  } 
                  // If we have multiple series, show series thumbnails
                  else if (seriesInfo.length > 1) {
                    return seriesInfo.map((series, seriesIndex) => {
                      // Get representative image for this series
                      const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                      const representativeImageId = representativeImages.current.get(seriesKey);
                      if (!representativeImageId) return null;
                      
                      // Check if this series is currently active
                      const isActiveSeries = currentSeriesId === seriesKey;
                      
                      const handleSeriesClick = async () => {
                        const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                        
                        // Only reset image position if switching to a different series
                        const isDifferentSeries = currentSeriesId !== seriesKey;
                        
                        // Switch to this series and start loading it
                        switchToSeries(seriesKey, series);
                        
                        // Only navigate to first image if switching to different series
                        if (isDifferentSeries) {
                          goToImage(seriesIndex);
                        }
                      };
                      
                      return (
                        <div
                          key={series.seriesId}
                          className="flex-shrink-0 flex flex-col items-center"
                          title={`${series.seriesDescription} (${series.instanceCount} images)`}
                        >
                          <div className="relative">
                            <ThumbnailImage
                              imageId={representativeImageId}
                              index={seriesIndex}
                              isActive={isActiveSeries}
                              onClick={handleSeriesClick}
                            />
                            
                            {/* Progress bar - shows loaded/total images in this series */}
                            {(() => {
                              const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                              const progressData = seriesLoadingProgress[seriesKey];
                              
                              // Show progress if series is being loaded
                              if (progressData && progressData.total > 0) {
                                const progressPercent = Math.round((progressData.loaded / progressData.total) * 100);
                                
                                return (
                                  <div className="absolute bottom-0 left-0 right-0">
                                    <Progress value={progressPercent} className="h-1 rounded-none" />
                                  </div>
                                );
                              }
                              
                              return null;
                            })()}
                          </div>
                          
                          {/* Series name below thumbnail */}
                          <div className="text-xs text-center mt-1 max-w-20 truncate">
                            {series.seriesDescription || `Series ${seriesIndex + 1}`}
                            {/* Series loading status using new progress system */}
                            {(() => {
                              const seriesKey = series.seriesInstanceUID || `series-${seriesIndex}`;
                              const progressData = seriesLoadingProgress[seriesKey];
                              
                              if (progressData && progressData.total > 0) {
                                const loadPercentage = Math.round((progressData.loaded / progressData.total) * 100);
                                
                                if (loadPercentage > 0 && loadPercentage < 100) {
                                  return (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {loadPercentage}% loaded
                                    </div>
                                  );
                                } else if (loadPercentage === 100) {
                                  return (
                                    <div className="text-xs text-green-600 mt-0.5">
                                      ✓ Fully loaded
                                    </div>
                                  );
                                }
                              }
                              return null;
                            })()} 
                          </div>
                        </div>
                      );
                    });
                  } else if (imageIds.length > 1 && imageIds.length <= 10) {
                    // Single series with few images - show individual image thumbnails (for X-ray, etc.)
                    // Limit to 10 images to avoid UI clutter for CT/MRI slices
                    return imageIds.map((imageId, imageIndex) => {
                      const isActiveImage = currentImageIndex === imageIndex;
                      
                      const handleImageClick = () => {
                        if (imageIndex !== currentImageIndex) {
                          goToImage(imageIndex);
                        }
                      };
                      
                      return (
                        <div
                          key={`image-${imageIndex}`}
                          className="flex-shrink-0 flex flex-col items-center"
                          title={`Image ${imageIndex + 1} of ${imageIds.length}`}
                        >
                          <ThumbnailImage
                            imageId={imageId}
                            index={imageIndex}
                            isActive={isActiveImage}
                            onClick={handleImageClick}
                          />
                          
                          {/* Image number below thumbnail */}
                          <div className="text-xs text-center mt-1">
                            Image {imageIndex + 1}
                          </div>
                        </div>
                      );
                    });
                  } else if (imageIds.length > 10) {
                    // Single series with many images (like CT slices) - show navigation message
                    return (
                      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                        Use mouse wheel or arrow keys to navigate {imageIds.length} images
                      </div>
                    );
                  } else {
                    // Single image - show navigation message
                    return (
                      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                        Single image - no navigation needed
                      </div>
                    );
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
    // Destroy immediately to free resources
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
        // Load thumbnails immediately without staggering
        
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
        const timeoutPromise = new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error('Thumbnail load timeout')), 8000);
          return timer;
        });
        
        await Promise.race([loadPromise, timeoutPromise]);
        
        if (!mounted) return;
        
        // Safe render for thumbnail with retry logic
        let renderAttempts = 0;
        const maxRenderAttempts = 3;
        
        const attemptRender = () => {
          try {
            // Reset camera and apply fixed aspect ratio for thumbnail
            thumbViewport.resetCamera();
            
            // Simple thumbnail - just reset camera
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
            }
          }
        };
        
        attemptRender();
        
      } catch (err) {
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