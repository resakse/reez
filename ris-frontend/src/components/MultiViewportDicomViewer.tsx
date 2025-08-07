'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Grid2x2, Grid3x3, Split, Eye, EyeOff, 
  RotateCcw, FlipHorizontal2, Maximize2,
  Settings, ZoomIn, Move, Ruler, Square, Circle,
  ArrowUpRight, Triangle, Crosshair
} from 'lucide-react';
import SimpleDicomViewer from './SimpleDicomViewer';

interface ViewportConfig {
  id: string;
  studyUID?: string;
  seriesUID?: string;
  visible: boolean;
  title?: string;
}

interface MultiViewportDicomViewerProps {
  studyUID: string;
  imageIds: string[];
  studyMetadata: any;
  seriesInfo: any[];
  pacsServerId?: string | null;
  availableSeries?: Array<{
    seriesInstanceUID: string;
    seriesDescription: string;
    numberOfImages: number;
  }>;
  className?: string;
}

type LayoutType = '1x1' | '1x2' | '2x1' | '2x2' | '1x3' | '3x1';

const LAYOUT_CONFIGS: Record<LayoutType, {
  name: string;
  icon: React.ReactNode;
  viewports: number;
  gridCols: string;
  gridRows: string;
}> = {
  '1x1': { name: 'Single', icon: <Maximize2 className="h-4 w-4" />, viewports: 1, gridCols: 'grid-cols-1', gridRows: 'grid-rows-1' },
  '1x2': { name: '1×2 Horizontal', icon: <Split className="h-4 w-4" />, viewports: 2, gridCols: 'grid-cols-2', gridRows: 'grid-rows-1' },
  '2x1': { name: '2×1 Vertical', icon: <Split className="h-4 w-4 rotate-90" />, viewports: 2, gridCols: 'grid-cols-1', gridRows: 'grid-rows-2' },
  '2x2': { name: '2×2 Grid', icon: <Grid2x2 className="h-4 w-4" />, viewports: 4, gridCols: 'grid-cols-2', gridRows: 'grid-rows-2' },
  '1x3': { name: '1×3 Horizontal', icon: <Grid3x3 className="h-4 w-4" />, viewports: 3, gridCols: 'grid-cols-3', gridRows: 'grid-rows-1' },
  '3x1': { name: '3×1 Vertical', icon: <Grid3x3 className="h-4 w-4 rotate-90" />, viewports: 3, gridCols: 'grid-cols-1', gridRows: 'grid-rows-3' }
};

const MultiViewportDicomViewer: React.FC<MultiViewportDicomViewerProps> = ({
  studyUID,
  imageIds,
  studyMetadata,
  seriesInfo,
  pacsServerId,
  availableSeries = [],
  className = ''
}) => {
  const [currentLayout, setCurrentLayout] = useState<LayoutType>('1x1');
  const [viewports, setViewports] = useState<ViewportConfig[]>([
    { id: 'viewport-0', studyUID, visible: true, title: 'Viewport 1' }
  ]);
  const [activeViewport, setActiveViewport] = useState<string>('viewport-0');
  const [syncEnabled, setSyncEnabled] = useState(false);

  // Update viewport configs when layout changes
  useEffect(() => {
    const layoutConfig = LAYOUT_CONFIGS[currentLayout];
    const newViewports: ViewportConfig[] = [];
    
    for (let i = 0; i < layoutConfig.viewports; i++) {
      const existingViewport = viewports[i];
      newViewports.push({
        id: `viewport-${i}`,
        studyUID: existingViewport?.studyUID || studyUID,
        seriesUID: existingViewport?.seriesUID,
        visible: true,
        title: `Viewport ${i + 1}`
      });
    }
    
    setViewports(newViewports);
    setActiveViewport(`viewport-0`);
  }, [currentLayout, studyUID]);

  const handleSeriesChange = useCallback((viewportId: string, seriesUID: string) => {
    setViewports(prev => prev.map(vp => 
      vp.id === viewportId 
        ? { ...vp, seriesUID }
        : vp
    ));
  }, []);

  const handleLayoutChange = useCallback((layout: LayoutType) => {
    setCurrentLayout(layout);
  }, []);

  const handleViewportClick = useCallback((viewportId: string) => {
    setActiveViewport(viewportId);
  }, []);

  const layoutConfig = LAYOUT_CONFIGS[currentLayout];

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Multi-viewport toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Layout:</span>
          <div className="flex gap-1">
            {(Object.keys(LAYOUT_CONFIGS) as LayoutType[]).map((layout) => (
              <Button
                key={layout}
                variant={currentLayout === layout ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleLayoutChange(layout)}
                title={LAYOUT_CONFIGS[layout].name}
                className="px-2"
              >
                {LAYOUT_CONFIGS[layout].icon}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={syncEnabled ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSyncEnabled(!syncEnabled)}
            title="Sync viewport actions"
            className="px-2"
          >
            {syncEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <span className="text-xs text-muted-foreground">
            Active: {viewports.find(vp => vp.id === activeViewport)?.title}
          </span>
        </div>
      </div>

      {/* Series selection for each viewport */}
      {currentLayout !== '1x1' && availableSeries.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted/20 border-b">
          {viewports.map((viewport, index) => (
            <div key={viewport.id} className="flex items-center gap-2">
              <span className="text-xs font-medium">{viewport.title}:</span>
              <Select
                value={viewport.seriesUID || ''}
                onValueChange={(value) => handleSeriesChange(viewport.id, value)}
              >
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="Select series..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSeries.map((series) => (
                    <SelectItem key={series.seriesInstanceUID} value={series.seriesInstanceUID}>
                      {series.seriesDescription} ({series.numberOfImages} images)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* Viewport grid */}
      <div className="flex-1 p-1">
        <div 
          className={`grid ${layoutConfig.gridCols} ${layoutConfig.gridRows} gap-1 h-full`}
        >
          {viewports.map((viewport, index) => (
            <Card
              key={viewport.id}
              className={`relative overflow-hidden transition-all duration-200 ${
                activeViewport === viewport.id 
                  ? 'ring-2 ring-blue-500 shadow-lg' 
                  : 'hover:ring-1 hover:ring-muted-foreground/50'
              }`}
              onClick={() => handleViewportClick(viewport.id)}
            >
              <CardContent className="p-0 h-full">
                {viewport.visible && (
                  <SimpleDicomViewer
                    imageIds={imageIds}
                    seriesInfo={seriesInfo}
                    studyMetadata={studyMetadata}
                    pacsServerId={pacsServerId}
                    showOverlay={true}
                    hideToolbar={activeViewport !== viewport.id}
                  />
                )}
              </CardContent>
              
              {/* Viewport label */}
              <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {viewport.title}
                {viewport.seriesUID && availableSeries.find(s => s.seriesInstanceUID === viewport.seriesUID) && (
                  <div className="text-[10px] opacity-75 mt-0.5">
                    {availableSeries.find(s => s.seriesInstanceUID === viewport.seriesUID)?.seriesDescription}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between p-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <div>
          Layout: {layoutConfig.name} | Sync: {syncEnabled ? 'On' : 'Off'}
        </div>
        <div>
          Study: {studyUID.slice(-8)}
        </div>
      </div>
    </div>
  );
};

export default MultiViewportDicomViewer;