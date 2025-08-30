import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface HeightmapVisualizerProps {
  chunkX: number;
  chunkZ: number;
}

export default function HeightmapVisualizer({ chunkX, chunkZ }: HeightmapVisualizerProps) {
  const [imageData, setImageData] = useState<{
    src: string;
    minHeight: number;
    maxHeight: number;
    size: number;
  } | null>(null);

  const { isLoading, error } = useQuery({
    queryKey: [`/api/worldgen/heightmap/${chunkX}/${chunkZ}`],
    queryFn: async () => {
      const response = await fetch(`/api/worldgen/heightmap/${chunkX}/${chunkZ}`);
      if (!response.ok) {
        throw new Error(`Failed to load heightmap: ${response.statusText}`);
      }

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

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      setImageData({
        src: imageUrl,
        minHeight,
        maxHeight,
        size: chunk.size,
      });

      return { imageUrl, minHeight, maxHeight, size: chunk.size };
    },
  });

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
