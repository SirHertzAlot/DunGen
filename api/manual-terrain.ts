import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SimpleTerrain, TerrainParams } from '../game/worldgen/SimpleTerrain';

interface ManualTerrainRequest {
  chunkX: number;
  chunkZ: number;
  algorithm: string;
  size: number;
  frequency: number;
  amplitude: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  erosionIterations?: number;
  smoothingPasses?: number;
  customParams?: any;
}

export async function generateManualTerrain(req: Request, res: Response) {
  try {
    const config: ManualTerrainRequest = req.body;
    
    // Validate required parameters
    if (config.chunkX === undefined || config.chunkZ === undefined || !config.algorithm || !config.size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: chunkX, chunkZ, algorithm, size'
      });
    }

    console.log(`Manual terrain generation: ${config.algorithm} at (${config.chunkX}, ${config.chunkZ}) - Size: ${config.size}x${config.size}, Heights: ${config.minHeight || 0} to ${config.maxHeight || 400}`);

    // Get SimpleTerrain instance
    const terrainGenerator = SimpleTerrain.getInstance();
    
    // Convert request config to TerrainParams
    const terrainParams: TerrainParams = {
      chunkX: config.chunkX,
      chunkZ: config.chunkZ,
      algorithm: config.algorithm.toLowerCase(),
      size: config.size,
      frequency: config.frequency || 0.01,
      amplitude: config.amplitude || 300,
      octaves: config.octaves || 6,
      seed: config.seed || (config.chunkX * 1000 + config.chunkZ),
      minHeight: config.minHeight || 0,
      maxHeight: config.maxHeight || 400,
      erosionIterations: config.erosionIterations || 0,
      smoothingPasses: config.smoothingPasses || 0
    };

    // Generate terrain chunk using SimpleTerrain
    const terrainChunk = terrainGenerator.generateChunk(
      config.chunkX, 
      config.chunkZ, 
      terrainParams
    );

    // Calculate statistics without flattening to avoid stack overflow
    let totalHeight = 0;
    let totalCells = 0;
    
    for (let y = 0; y < terrainChunk.size; y++) {
      for (let x = 0; x < terrainChunk.size; x++) {
        totalHeight += terrainChunk.heightmap[y][x];
        totalCells++;
      }
    }
    
    const avgHeight = totalHeight / totalCells;
    
    const result = {
      id: terrainChunk.id,
      x: terrainChunk.chunkX,
      z: terrainChunk.chunkZ,
      size: terrainChunk.size,
      heightmap: terrainChunk.heightmap,
      algorithm: terrainChunk.algorithm,
      generated: true,
      lastAccessed: terrainChunk.generatedAt,
      stats: {
        minHeight: terrainChunk.minHeight,
        maxHeight: terrainChunk.maxHeight,
        avgHeight: avgHeight.toFixed(2),
        range: terrainChunk.maxHeight - terrainChunk.minHeight
      }
    };
    
    console.log(`Generated ${config.algorithm} terrain: Min=${terrainChunk.minHeight.toFixed(1)}, Max=${terrainChunk.maxHeight.toFixed(1)}, Range=${(terrainChunk.maxHeight - terrainChunk.minHeight).toFixed(1)}`);

    res.json({
      success: true,
      data: result,
      message: `Generated ${config.algorithm} terrain with height range ${terrainChunk.minHeight.toFixed(1)} to ${terrainChunk.maxHeight.toFixed(1)}`
    });
    
  } catch (error) {
    console.error('Manual terrain generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Manual terrain generation failed',
      details: error instanceof Error ? error.stack : String(error)
    });
  }
}