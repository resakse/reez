'use client';

import React, { useEffect, useRef, useState } from 'react';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import dicomParser from 'dicom-parser';
import Hammer from 'hammerjs';
import { getStudyImageIds } from '@/lib/orthanc'; // Correct import

// --- Single, Global Initialization ---
let isCornerstoneInitialized = false;
const initializeCornerstone = () => {
  if (isCornerstoneInitialized) return;
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.Hammer = Hammer;
  cornerstoneTools.init({ showSVGCursors: true });
  isCornerstoneInitialized = true;
};
// --- End Initialization ---

interface DicomViewerProps {
  studyId: string;
}

const DicomViewer: React.FC<DicomViewerProps> = ({ studyId }) => {
  const mainViewportRef = useRef(null);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeCornerstone();
    if (studyId) {
      const fetchAndSetImageIds = async () => {
        try {
          setError(null);
          const ids = await getStudyImageIds(studyId);
          setImageIds(ids);
          if (ids.length > 0) {
            setActiveImageId(ids[0]);
          }
        } catch (err) {
          console.error('Error fetching DICOM data:', err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        }
      };
      fetchAndSetImageIds();
    }
  }, [studyId]);

  useEffect(() => {
    const element = mainViewportRef.current;
    if (element && activeImageId) {
      cornerstone.enable(element);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cornerstone.loadImage(activeImageId).then((image: any) => {
        cornerstone.displayImage(element, image);
        // Basic tool setup
        cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
        cornerstoneTools.setToolActive('Zoom', { mouseButtonMask: 1 });
      }).catch((error: unknown) => {
          console.error(`Failed to load image ${activeImageId}`, error);
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
            cornerstone.disable(element);
        } catch {
            // It can throw error if element is already disabled, safely ignore
        }
      }
    };
  }, [activeImageId, error]);

  if (error) {
    return <div className="text-red-500 text-center p-4">Error: {error}</div>;
  }

  if (imageIds.length === 0) {
    return <div className="text-center p-4">Loading study...</div>;
  }
  
  return (
    <div>
      <h2 className="text-xl font-bold mb-2">DICOM Viewer: {studyId}</h2>
      <div className="flex gap-4">
        {/* Thumbnail sidebar */}
        <div className="flex flex-col gap-2 overflow-y-auto" style={{maxHeight: '512px'}}>
          {imageIds.map(imageId => (
            <Thumbnail
              key={imageId}
              imageId={imageId}
              isActive={imageId === activeImageId}
              onClick={() => setActiveImageId(imageId)}
            />
          ))}
        </div>
        
        {/* Main Viewport */}
        <div
          ref={mainViewportRef}
          className="rounded-lg shadow-md"
          style={{ minWidth: '512px', height: '512px', backgroundColor: 'black' }}
        ></div>
      </div>
    </div>
  );
};

interface ThumbnailProps {
  imageId: string;
  isActive: boolean;
  onClick: () => void;
}

const Thumbnail: React.FC<ThumbnailProps> = ({ imageId, isActive, onClick }) => {
  const thumbRef = useRef(null);
  useEffect(() => {
    const element = thumbRef.current;
    if (element) {
      cornerstone.enable(element);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cornerstone.loadImage(imageId).then((image: any) => {
        cornerstone.displayImage(element, image);
      }).catch((err: unknown) => {
        console.error(`Failed to load thumbnail for ${imageId}`, err);
      });
    }
    return () => {
      if (element) {
        try {
            cornerstone.disable(element);
        } catch {
            // It can throw error if element is already disabled, safely ignore
        }
      }
    };
  }, [imageId]);

  return (
    <div
      ref={thumbRef}
      onClick={onClick}
      className={`cursor-pointer border-2 ${
        isActive ? 'border-blue-500' : 'border-transparent'
      }`}
      style={{ minWidth: '100px', height: '100px', backgroundColor: 'black' }}
    ></div>
  );
};

export default DicomViewer; 