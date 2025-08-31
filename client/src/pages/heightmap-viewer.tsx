import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface HeightmapVisualizerProps {
  chunkX: number;
  chunkZ: number;
}

function HeightmapVisualizer({ chunkX, chunkZ }: HeightmapVisualizerProps) {
  const [imageData, setImageData] = useState<{ 
    src: string;
    minHeight: number;
    maxHeight: number;
    size: number;
  } | null>(null);
  
  const { isLoading, error } = useQuery({
    queryKey: [`/api/worldgen/heightmap/${chunkX}/${chunkZ}`],
    queryFn: async () => {
      // Fetch the PNG image directly
      const response = await fetch(`/api/worldgen/heightmap/${chunkX}/${chunkZ}`);
      if (!response.ok) {
        throw new Error(`Failed to load heightmap: ${response.statusText}`);
      }
      
      // Get chunk metadata separately for display info
      const chunkResponse = await fetch(`/api/worldgen/chunk/${chunkX}/${chunkZ}`);
      const chunkResult = await chunkResponse.json();
      
      if (!chunkResult.success) {
        throw new Error(chunkResult.error);
      }
      
      const chunk = chunkResult.data;
      const heights = Array.isArray(chunk.heightmap[0]) 
        ? chunk.heightmap.flat() 
        : chunk.heightmap;
      const minHeight = Math.min(...heights);
      const maxHeight = Math.max(...heights);
      
      // Convert response to blob and create object URL
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      
      setImageData({
        src: imageUrl,
        minHeight,
        maxHeight,
        size: chunk.size
      });
      
      return { imageUrl, minHeight, maxHeight, size: chunk.size };
    }
  });

  // Cleanup object URL when component unmounts or data changes
  useEffect(() => {
    return () => {
      if (imageData?.src) {
        URL.revokeObjectURL(imageData.src);
      }
    };
  }, [imageData]);

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
        <div className="text-red-400 text-xs mt-1">{error instanceof Error ? error.message : 'Unknown error'}</div>
      </div>
    );
  }

  if (!imageData) return null;

  return (
    <div className="bg-gray-700 p-4 rounded">
      <img 
        src={imageData.src}
        alt={`Heightmap for chunk (${chunkX}, ${chunkZ})`}
        className="w-full h-32 border border-gray-600 rounded object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="mt-2 text-xs text-gray-400">
        <div>Chunk ({chunkX}, {chunkZ})</div>
        <div>Range: {imageData.minHeight.toFixed(1)} - {imageData.maxHeight.toFixed(1)}</div>
        <div>Size: {imageData.size}x{imageData.size}</div>
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