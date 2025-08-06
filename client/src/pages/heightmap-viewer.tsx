import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface HeightmapData {
  chunkX: number;
  chunkZ: number;
  size: number;
  minHeight: number;
  maxHeight: number;
  heightRange: number;
  imageData: Array<{
    x: number;
    y: number;
    height: number;
    grayscale: number;
  }>;
  rawHeightmap: number[];
}

interface HeightmapVisualizerProps {
  chunkX: number;
  chunkZ: number;
}

function HeightmapVisualizer({ chunkX, chunkZ }: HeightmapVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/worldgen/heightmap/${chunkX}/${chunkZ}`],
    queryFn: async () => {
      const response = await fetch(`/api/worldgen/heightmap/${chunkX}/${chunkZ}`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data as HeightmapData;
    }
  });

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create ImageData for the heightmap
    const imageData = ctx.createImageData(data.size, data.size);
    
    // Fill the image data with grayscale values
    for (let i = 0; i < data.imageData.length; i++) {
      const pixel = data.imageData[i];
      const pixelIndex = (pixel.y * data.size + pixel.x) * 4;
      
      // Set RGB to grayscale value (white = high, black = low)
      imageData.data[pixelIndex] = pixel.grayscale;     // Red
      imageData.data[pixelIndex + 1] = pixel.grayscale; // Green
      imageData.data[pixelIndex + 2] = pixel.grayscale; // Blue
      imageData.data[pixelIndex + 3] = 255;            // Alpha
    }
    
    // Draw the heightmap to canvas
    ctx.putImageData(imageData, 0, 0);
    
  }, [data]);

  if (isLoading) {
    return (
      <div className="bg-gray-700 p-4 rounded">
        <div className="animate-pulse bg-gray-600 h-32 w-full rounded mb-2"></div>
        <div className="text-sm text-gray-400">Loading ({chunkX}, {chunkZ})...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900 p-4 rounded">
        <div className="text-red-300 text-sm">Error loading chunk ({chunkX}, {chunkZ})</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-gray-700 p-4 rounded">
      <canvas 
        ref={canvasRef}
        width={data.size}
        height={data.size}
        className="w-full h-32 border border-gray-600 rounded image-rendering-pixelated"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="mt-2 text-xs text-gray-400">
        <div>Chunk ({chunkX}, {chunkZ})</div>
        <div>Range: {data.minHeight.toFixed(1)} - {data.maxHeight.toFixed(1)}</div>
        <div>Size: {data.size}x{data.size}</div>
      </div>
    </div>
  );
}

export default function HeightmapViewer() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Heightmap Quality Review</h1>
        
        <div className="mb-6">
          <p className="text-gray-300">
            These heightmaps show the actual terrain data being generated. 
            White areas are high elevation, black areas are low elevation.
            Compare these to your reference image to assess quality.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <HeightmapVisualizer chunkX={-1} chunkZ={-1} />
          <HeightmapVisualizer chunkX={0} chunkZ={-1} />
          <HeightmapVisualizer chunkX={1} chunkZ={-1} />
          <HeightmapVisualizer chunkX={-1} chunkZ={0} />
          <HeightmapVisualizer chunkX={0} chunkZ={0} />
          <HeightmapVisualizer chunkX={1} chunkZ={0} />
          <HeightmapVisualizer chunkX={-1} chunkZ={1} />
          <HeightmapVisualizer chunkX={0} chunkZ={1} />
          <HeightmapVisualizer chunkX={1} chunkZ={1} />
        </div>

        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Heightmap Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Quality Checklist</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• Smooth gradients without harsh transitions</li>
                <li>• Natural-looking noise patterns</li>
                <li>• Varied elevation ranges</li>
                <li>• No repetitive patterns</li>
                <li>• Gradual slopes suitable for AI pathfinding</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Reference Comparison</h3>
              <div className="text-sm text-gray-300">
                <p>Compare these generated heightmaps to your reference image:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Similar contrast levels</li>
                  <li>• Natural gradient flow</li>
                  <li>• Realistic terrain features</li>
                  <li>• High-quality detail preservation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}