import { Router } from "express";
import { TerrainGenerator } from "../game/worldgen/TerrainGenerator";
import logger from "../logging/logger";

const router = Router();
const genLogger = logger();

// Initialize terrain generator
let terrainGenerator: TerrainGenerator;

try {
  terrainGenerator = TerrainGenerator.getInstance();
  genLogger.info("Terrain generator initialized for API", {
    service: "WorldGenAPI",
  });
} catch (error) {
  const errorMessage =
    error instanceof Error ? error : new Error(String(error));
  genLogger.error(
    "Failed to initialize terrain generator - WorldGenAPI",
    errorMessage,
    {
      service: "WorldGenAPI",
    },
  );
}

// Helper: flatten a 2D number array, or just return a 1D array unchanged
function flattenHeightmap(heightmap: unknown): number[] {
  if (Array.isArray(heightmap) && Array.isArray(heightmap[0])) {
    // 2D array: flatten
    return (heightmap as number[][]).flat();
  }
  // Already flat
  return heightmap as number[];
}

// Get terrain chunk data
router.get("/chunk/:x/:z", async (req, res) => {
  try {
    const chunkX = parseInt(req.params.x);
    const chunkZ = parseInt(req.params.z);

    if (isNaN(chunkX) || isNaN(chunkZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid chunk coordinates",
      });
    }

    const chunk = await terrainGenerator.getChunk(chunkX, chunkZ);

    const flatHeightmap = flattenHeightmap(chunk.heightmap);

    // Validate heightmap data and ensure we have the expected size (64x64 = 4096)
    const expectedSize = chunk.size * chunk.size;
    if (flatHeightmap.length !== expectedSize) {
      genLogger.warn("Heightmap size mismatch", {
        service: "WorldGenAPI",
        expected: expectedSize,
        actual: flatHeightmap.length,
        chunkSize: chunk.size,
      });
    }

    const validHeightmap = flatHeightmap.map((h) =>
      typeof h === "number" && !isNaN(h) ? h : 0,
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
        generated: chunk.generated,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get terrain chunk - WorldGen API", errObj, {
      x: req.params.x,
      z: req.params.z,
      service: "WorldGenAPI",
    });

    res.status(500).json({
      success: false,
      error: "Failed to generate terrain chunk",
    });
  }
});

// Get height at specific coordinates
router.get("/height/:x/:z", async (req, res) => {
  try {
    const worldX = parseFloat(req.params.x);
    const worldZ = parseFloat(req.params.z);

    if (isNaN(worldX) || isNaN(worldZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid world coordinates",
      });
    }

    const height = await terrainGenerator.getHeightAtPosition(worldX, worldZ);

    res.json({
      success: true,
      data: {
        position: [worldX, worldZ],
        height: height,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get height at position - WorldGen API", errObj, {
      x: req.params.x,
      z: req.params.z,
      service: "WorldGenAPI",
    });

    res.status(500).json({
      success: false,
      error: "Failed to get height at position",
    });
  }
});

// Get biome at specific coordinates
router.get("/biome/:x/:z", async (req, res) => {
  try {
    const worldX = parseFloat(req.params.x);
    const worldZ = parseFloat(req.params.z);

    if (isNaN(worldX) || isNaN(worldZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid world coordinates",
      });
    }

    const biome = await terrainGenerator.getBiomeAtPosition(worldX, worldZ);

    res.json({
      success: true,
      data: {
        position: [worldX, worldZ],
        biome: biome,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error : new Error(String("Unknown error"));
    genLogger.error("Failed to get biome at position", errorMessage, {
      service: "WorldGenAPI",
      worldX: req.params.x,
      worldZ: req.params.z,
      error: error instanceof Error ? error : "Unknown error",
    });

    res.status(500).json({
      success: false,
      error: "Failed to get biome at position",
    });
  }
});

// Get features in a region
router.get("/features", async (req, res) => {
  try {
    const { minX, minZ, maxX, maxZ } = req.query;

    if (!minX || !minZ || !maxX || !maxZ) {
      return res.status(400).json({
        success: false,
        error: "Missing region parameters (minX, minZ, maxX, maxZ)",
      });
    }

    const features = await terrainGenerator.getFeaturesInRegion(
      parseFloat(minX as string),
      parseFloat(minZ as string),
      parseFloat(maxX as string),
      parseFloat(maxZ as string),
    );

    res.json({
      success: true,
      data: {
        region: { minX, minZ, maxX, maxZ },
        features: features,
        count: features.length,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get features in region", errObj, {
      region: req.query,
      service: "WorldGenAPI",
    });

    res.status(500).json({
      success: false,
      error: "Failed to get features in region",
    });
  }
});

// Get world generation configuration
router.get("/config", async (req, res) => {
  try {
    const config = terrainGenerator.getConfig();

    res.json({
      success: true,
      data: {
        world: config.world,
        biomes: Object.keys(config.biomes),
        pipeline_steps: config.pipeline.steps.map((step) => ({
          name: step.name,
          type: step.type,
          enabled: step.enabled,
        })),
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get terrain chunk - WorldGen API", errObj, {
      service: "WorldGenAPI",
    });

    res.status(500).json({
      success: false,
      error: "Failed to get world generation config",
    });
  }
});

// Get multiple chunks in a region (for efficient loading)
router.get("/region/:minX/:minZ/:maxX/:maxZ", async (req, res) => {
  try {
    const minX = parseInt(req.params.minX);
    const minZ = parseInt(req.params.minZ);
    const maxX = parseInt(req.params.maxX);
    const maxZ = parseInt(req.params.maxZ);

    if (isNaN(minX) || isNaN(minZ) || isNaN(maxX) || isNaN(maxZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid region coordinates",
      });
    }

    // Limit region size to prevent excessive data transfer
    const maxRegionSize = 4;
    if (maxX - minX > maxRegionSize || maxZ - minZ > maxRegionSize) {
      return res.status(400).json({
        success: false,
        error: `Region too large. Maximum size is ${maxRegionSize}x${maxRegionSize} chunks`,
      });
    }

    const chunks: {
      id: string;
      position: [number, number];
      size: number;
      heightmap: number[];
      biomes: import("../game/worldgen/TerrainGenerator").BiomeType[][];
      features: import("../game/worldgen/TerrainGenerator").TerrainFeature[];
    }[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const chunk = await terrainGenerator.getChunk(x, z);
        const flatHeightmap = flattenHeightmap(chunk.heightmap);

        chunks.push({
          id: chunk.id,
          position: [x, z],
          size: chunk.size,
          heightmap: flatHeightmap,
          biomes: chunk.biomes,
          features: chunk.features,
        });
      }
    }

    res.json({
      success: true,
      data: {
        region: { minX, minZ, maxX, maxZ },
        chunks: chunks,
        count: chunks.length,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get terrain chunk - WorldGen API", errObj, {
      service: "WorldGenAPI",
      region: [
        req.params.minX,
        req.params.minZ,
        req.params.maxX,
        req.params.maxZ,
      ],
    });
    res.status(500).json({
      success: false,
      error: "Failed to generate region chunks",
    });
  }
});

// Export heightmap as visual data for quality review
router.get("/heightmap/:x/:z", async (req, res) => {
  try {
    const chunkX = parseInt(req.params.x);
    const chunkZ = parseInt(req.params.z);

    if (isNaN(chunkX) || isNaN(chunkZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid chunk coordinates",
      });
    }

    const chunk = await terrainGenerator.getChunk(chunkX, chunkZ);

    // Ensure heightmap is a flat array
    const flatHeightmap = flattenHeightmap(chunk.heightmap);

    // Find min/max heights for proper normalization
    const minHeight = Math.min(...flatHeightmap);
    const maxHeight = Math.max(...flatHeightmap);
    const heightRange = maxHeight - minHeight;

    // Convert heightmap to grayscale image data for visual review
    const size = chunk.size; // Should be 64
    const imageData: {
      x: number;
      y: number;
      height: number;
      grayscale: number;
    }[] = [];

    for (let i = 0; i < flatHeightmap.length; i++) {
      // Normalize height to 0-255 grayscale
      const normalizedHeight =
        heightRange > 0
          ? Math.floor(((flatHeightmap[i] - minHeight) / heightRange) * 255)
          : 128;

      imageData.push({
        x: i % size,
        y: Math.floor(i / size),
        height: flatHeightmap[i],
        grayscale: normalizedHeight,
      });
    }

    res.json({
      success: true,
      data: {
        chunkX,
        chunkZ,
        size,
        minHeight,
        maxHeight,
        heightRange,
        imageData,
        rawHeightmap: flatHeightmap,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to get terrain chunk - WorldGen API", errObj, {
      chunkX: req.params.x,
      chunkZ: req.params.z,
      service: "WorldGenAPI",
    });
    res.status(500).json({
      success: false,
      error: "Failed to export heightmap",
    });
  }
});

// Test endpoint to force mountain terrain generation
router.get("/mountain/:x/:z", async (req, res) => {
  try {
    const chunkX = parseInt(req.params.x);
    const chunkZ = parseInt(req.params.z);

    if (isNaN(chunkX) || isNaN(chunkZ)) {
      return res.status(400).json({
        success: false,
        error: "Invalid chunk coordinates",
      });
    }

    const chunk = await terrainGenerator.generateMountainChunk(chunkX, chunkZ);

    // Ensure heightmap is a flat array
    const flatHeightmap = flattenHeightmap(chunk.heightmap);

    const validHeightmap = flatHeightmap.map((h) =>
      typeof h === "number" && !isNaN(h) ? h : 0,
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
        generated: chunk.generated,
      },
    });
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    genLogger.error("Failed to generate mountain chunk", errObj, {
      chunkX: req.params.x,
      chunkZ: req.params.z,
      service: "WorldGenAPI",
    });
    res.status(500).json({
      success: false,
      error: "Failed to generate mountain terrain",
    });
  }
});

export default router;
