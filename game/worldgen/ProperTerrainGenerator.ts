import logger from "../../logging/logger";
import { v4 as uuidv4 } from "uuid";
import { createNoise2D } from "simplex-noise";

const log = logger({ serviceName: "ProperTerrainGenerator" });

export interface TerrainChunk {
  id: string;
  x: number;
  z: number;
  size: number;
  heightmap: number[][];
  biomes: BiomeType[];
  features: TerrainFeature[];
  generated: boolean;
  lastAccessed: number;
}

export interface BiomeType {
  type:
    | "grassland"
    | "forest"
    | "desert"
    | "mountain"
    | "swamp"
    | "tundra"
    | "ocean"
    | "marsh"
    | "bog"
    | "cave";
  elevation: number;
  moisture: number;
  temperature: number;
  noiseScale: number;
  heightScale: number;
}

export interface TerrainFeature {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  properties: Record<string, any>;
}

export class ProperTerrainGenerator {
  private static instance: ProperTerrainGenerator;
  private noise2D: (x: number, y: number) => number;
  private seed: number = 12345;
  private chunkCache: Map<string, TerrainChunk> = new Map();
  private readonly DEFAULT_CHUNK_SIZE = 256; // Increased from 64

  private constructor() {
    this.noise2D = createNoise2D();
  }

  public static getInstance(): ProperTerrainGenerator {
    if (!ProperTerrainGenerator.instance) {
      ProperTerrainGenerator.instance = new ProperTerrainGenerator();
    }
    return ProperTerrainGenerator.instance;
  }

  public generateChunk(
    chunkX: number,
    chunkZ: number,
    size: number = this.DEFAULT_CHUNK_SIZE,
  ): TerrainChunk {
    const cacheKey = `${chunkX},${chunkZ},${size}`;
    if (this.chunkCache.has(cacheKey)) {
      return this.chunkCache.get(cacheKey)!;
    }

    const biome = this.getBiome(chunkX, chunkZ);
    const heightmap = this.generateHeightmap(chunkX, chunkZ, size, biome);

    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size,
      heightmap,
      biomes: [biome],
      features: [],
      generated: true,
      lastAccessed: Date.now(),
    };

    this.chunkCache.set(cacheKey, chunk);
    
    // Simple cache eviction if too large
    if (this.chunkCache.size > 100) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }

    log.info("Generated large terrain chunk", {
      service: "ProperTerrainGenerator",
      chunkX,
      chunkZ,
      size,
      biome: biome.type,
    });

    return chunk;
  }

  private generateHeightmap(
    chunkX: number,
    chunkZ: number,
    size: number,
    biome: BiomeType
  ): number[][] {
    const heightmap: number[][] = [];
    const zoomFactor = 200; // Adjusted for larger chunks
    const xOffset = 10000;
    const yOffset = 10000;
    const edgeBlendSize = 8; // Number of pixels to blend at edges

    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const worldX = (chunkX * size) + x;
        const worldZ = (chunkZ * size) + z;
        
        const xVal = worldX / zoomFactor + xOffset;
        const yVal = worldZ / zoomFactor + yOffset;
        
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxAmplitude = 0;
        
        for (let i = 0; i < 9; i++) {
          noiseValue += amplitude * (this.noise2D(xVal * frequency, yVal * frequency) + 1) / 2;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        
        noiseValue /= maxAmplitude;
        
        let normalized = (noiseValue - 0.2) / 0.6;
        normalized = Math.max(0, Math.min(1, normalized));
        
        let height = (normalized * biome.heightScale) + (biome.elevation * 20);

        // Edge Normalization: Blend edges towards a common height to ensure seamless stitching
        // This is a simpler alternative to referencing neighbors directly
        const distFromEdgeX = Math.min(x, size - 1 - x);
        const distFromEdgeZ = Math.min(z, size - 1 - z);
        const minDistFromEdge = Math.min(distFromEdgeX, distFromEdgeZ);

        if (minDistFromEdge < edgeBlendSize) {
          const blendFactor = minDistFromEdge / edgeBlendSize;
          const targetEdgeHeight = 30; // Common height for all edges
          height = height * blendFactor + targetEdgeHeight * (1 - blendFactor);
        }
        
        heightmap[z][x] = Math.max(0, Math.min(100, height));
      }
    }

    return heightmap;
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;

    const elevation = (this.noise2D(x, z) + 1) / 2;
    const temperature = (this.noise2D(x + 100, z + 100) + 1) / 2;
    const moisture = (this.noise2D(x + 200, z + 200) + 1) / 2;

    let biomeType: BiomeType["type"] = "grassland";
    let heightScale = 25;
    let noiseScale = 0.05;

    if (elevation > 0.7) {
      biomeType = "mountain";
      heightScale = 60;
    } else if (elevation < 0.3) {
      if (moisture > 0.6) {
        biomeType = "marsh";
        heightScale = 10;
      } else {
        biomeType = "desert";
        heightScale = 20;
      }
    } else if (temperature > 0.6 && moisture < 0.4) {
      biomeType = "desert";
      heightScale = 25;
    } else if (temperature < 0.3) {
      biomeType = "tundra";
      heightScale = 15;
    } else if (moisture > 0.6) {
      biomeType = "forest";
      heightScale = 35;
    }

    return {
      type: biomeType,
      elevation,
      moisture,
      temperature,
      noiseScale,
      heightScale,
    };
  }
}
