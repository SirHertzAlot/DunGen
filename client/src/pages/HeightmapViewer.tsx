import HeightmapVisualizer from '@/components/HeightmapVisualizer';

export default function HeightmapViewer() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Heightmap Quality Review</h1>
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
      </div>
    </div>
  );
}
