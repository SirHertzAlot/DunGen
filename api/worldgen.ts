import { Router } from 'express';
import { TerrainGenerator } from '../game/worldgen/TerrainGenerator';
import { logger } from '../logging/logger';

const router = Router();

// Initialize terrain generator
let terrainGenerator: TerrainGenerator;

try {
  terrainGenerator = TerrainGenerator.getInstance();
  logger.info('Terrain generator initialized for API', {
    service: 'WorldGenAPI'
  });
} catch (error) {
  logger.error('Failed to initialize terrain generator', {
    service: 'WorldGenAPI',
    error: error instanceof Error ? error.message : 'Unknown error'
  });
}

// Get terrain chunk data
router.get('/chunk/:x/:z', async (req, res) => {
  try {
    const chunkX = parseInt(req.params.x);
    const chunkZ = parseInt(req.params.z);

    if (isNaN(chunkX) || isNaN(chunkZ)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chunk coordinates'
      });
    }

    const chunk = await terrainGenerator.getChunk(chunkX, chunkZ);

    // Ensure heightmap is a flat array with correct size
    let flatHeightmap = chunk.heightmap;
    if (Array.isArray(chunk.heightmap[0])) {
      // If it's 2D, flatten it
      flatHeightmap = (chunk.heightmap as number[][]).flat();
    }

    // Validate heightmap data and ensure we have the expected size (64x64 = 4096)
    const expectedSize = chunk.size * chunk.size;
    if (flatHeightmap.length !== expectedSize) {
      logger.warn('Heightmap size mismatch', {
        service: 'WorldGenAPI',
        expected: expectedSize,
        actual: flatHeightmap.length,
        chunkSize: chunk.size
      });
    }

    const validHeightmap = (flatHeightmap as number[]).map(h => 
      (typeof h === 'number' && !isNaN(h)) ? h : 0
    );

    res.json({
      success: true,
      data: {
        id: chunk.id,
        position: [chunkX, chunkZ],
        size: chunk.size,
        heightmap: validHeightmap,
        biomes: chunk.biomes,
        features: chunk.features,
        generated: chunk.generated
      }
    });

  } catch (error) {
    logger.error('Failed to get terrain chunk', {
      service: 'WorldGenAPI',
      chunkX: req.params.x,
      chunkZ: req.params.z,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate terrain chunk'
    });
  }
});

// Get height at specific coordinates
router.get('/height/:x/:z', async (req, res) => {
  try {
    const worldX = parseFloat(req.params.x);
    const worldZ = parseFloat(req.params.z);

    if (isNaN(worldX) || isNaN(worldZ)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid world coordinates'
      });
    }

    const height = await terrainGenerator.getHeightAtPosition(worldX, worldZ);

    res.json({
      success: true,
      data: {
        position: [worldX, worldZ],
        height: height
      }
    });

  } catch (error) {
    logger.error('Failed to get height at position', {
      service: 'WorldGenAPI',
      worldX: req.params.x,
      worldZ: req.params.z,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get height at position'
    });
  }
});

// Get biome at specific coordinates
router.get('/biome/:x/:z', async (req, res) => {
  try {
    const worldX = parseFloat(req.params.x);
    const worldZ = parseFloat(req.params.z);

    if (isNaN(worldX) || isNaN(worldZ)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid world coordinates'
      });
    }

    const biome = await terrainGenerator.getBiomeAtPosition(worldX, worldZ);

    res.json({
      success: true,
      data: {
        position: [worldX, worldZ],
        biome: biome
      }
    });

  } catch (error) {
    logger.error('Failed to get biome at position', {
      service: 'WorldGenAPI',
      worldX: req.params.x,
      worldZ: req.params.z,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get biome at position'
    });
  }
});

// Get features in a region
router.get('/features', async (req, res) => {
  try {
    const { minX, minZ, maxX, maxZ } = req.query;

    if (!minX || !minZ || !maxX || !maxZ) {
      return res.status(400).json({
        success: false,
        error: 'Missing region parameters (minX, minZ, maxX, maxZ)'
      });
    }

    const features = await terrainGenerator.getFeaturesInRegion(
      parseFloat(minX as string),
      parseFloat(minZ as string),
      parseFloat(maxX as string),
      parseFloat(maxZ as string)
    );

    res.json({
      success: true,
      data: {
        region: { minX, minZ, maxX, maxZ },
        features: features,
        count: features.length
      }
    });

  } catch (error) {
    logger.error('Failed to get features in region', {
      service: 'WorldGenAPI',
      region: req.query,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get features in region'
    });
  }
});

// Get world generation configuration
router.get('/config', async (req, res) => {
  try {
    const config = terrainGenerator.getConfig();

    res.json({
      success: true,
      data: {
        world: config.world,
        biomes: Object.keys(config.biomes),
        pipeline_steps: config.pipeline.steps.map(step => ({
          name: step.name,
          type: step.type,
          enabled: step.enabled
        }))
      }
    });

  } catch (error) {
    logger.error('Failed to get world generation config', {
      service: 'WorldGenAPI',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get world generation config'
    });
  }
});

// Get multiple chunks in a region (for efficient loading)
router.get('/region/:minX/:minZ/:maxX/:maxZ', async (req, res) => {
  try {
    const minX = parseInt(req.params.minX);
    const minZ = parseInt(req.params.minZ);
    const maxX = parseInt(req.params.maxX);
    const maxZ = parseInt(req.params.maxZ);

    if (isNaN(minX) || isNaN(minZ) || isNaN(maxX) || isNaN(maxZ)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid region coordinates'
      });
    }

    // Limit region size to prevent excessive data transfer
    const maxRegionSize = 4;
    if (maxX - minX > maxRegionSize || maxZ - minZ > maxRegionSize) {
      return res.status(400).json({
        success: false,
        error: `Region too large. Maximum size is ${maxRegionSize}x${maxRegionSize} chunks`
      });
    }

    const chunks = [];
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const chunk = await terrainGenerator.getChunk(x, z);
        chunks.push({
          id: chunk.id,
          position: [x, z],
          size: chunk.size,
          heightmap: chunk.heightmap,
          biomes: chunk.biomes,
          features: chunk.features
        });
      }
    }

    res.json({
      success: true,
      data: {
        region: { minX, minZ, maxX, maxZ },
        chunks: chunks,
        count: chunks.length
      }
    });

  } catch (error) {
    logger.error('Failed to get region chunks', {
      service: 'WorldGenAPI',
      region: [req.params.minX, req.params.minZ, req.params.maxX, req.params.maxZ],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate region chunks'
    });
  }
});

export default router;