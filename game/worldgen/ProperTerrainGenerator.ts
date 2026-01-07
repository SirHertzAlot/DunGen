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
  private readonly DEFAULT_CHUNK_SIZE = 256;

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
    
    if (this.chunkCache.size > 100) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }

    log.info("Generated large terrain chunk with neighbor sampling", {
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
    const zoomFactor = 200;
    const xOffset = 10000;
    const yOffset = 10000;
    const blendWidth = 16; // Wider blend for smoother mesh

    // We use a shared noise space based on absolute world coordinates.
    // This is the most reliable way to ensure edge values match perfectly without iterative "collapsing".
    // Noise is deterministic, so sampling at the same world coordinates from different chunks
    // will yield the exact same values.
    
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const worldX = (chunkX * size) + x;
        const worldZ = (chunkZ * size) + z;
        
        // Sampling multiple octaves of noise at absolute world coordinates
        const sampleHeight = (wx: number, wz: number) => {
          const xVal = wx / zoomFactor + xOffset;
          const yVal = wz / zoomFactor + yOffset;
          
          let val = 0;
          let amp = 1;
          let freq = 1;
          let maxAmp = 0;
          
          for (let i = 0; i < 9; i++) {
            val += amp * (this.noise2D(xVal * freq, yVal * freq) + 1) / 2;
            maxAmp += amp;
            amp *= 0.5;
            freq *= 2;
          }
          return val / maxAmp;
        };

        let noiseValue = sampleHeight(worldX, worldZ);
        
        let normalized = (noiseValue - 0.2) / 0.6;
        normalized = Math.max(0, Math.min(1, normalized));
        
        // We also need to blend the BIOME effects at the edges to avoid biome height discrepancies
        // For a true "mesh", we sample neighboring biome properties if near edges
        let effectiveHeightScale = biome.heightScale;
        let effectiveElevation = biome.elevation;

        if (x < blendWidth || x > size - blendWidth || z < blendWidth || z > size - blendWidth) {
          // Check neighbors
          const nx = x < blendWidth ? -1 : (x > size - blendWidth ? 1 : 0);
          const nz = z < blendWidth ? -1 : (z > size - blendWidth ? 1 : 0);
          
          if (nx !== 0 || nz !== 0) {
            const neighborBiome = this.getBiome(chunkX + nx, chunkZ + nz);
            
            // Calculate distance factor to neighbor
            let d = 1.0;
            if (nx !== 0) d = Math.min(d, (nx < 0 ? x : size - 1 - x) / blendWidth);
            if (nz !== 0) d = Math.min(d, (nz < 0 ? z : size - 1 - z) / blendWidth);
            
            // Linear interpolate biome parameters
            effectiveHeightScale = neighborBiome.heightScale * (1 - d) + biome.heightScale * d;
            effectiveElevation = neighborBiome.elevation * (1 - d) + biome.elevation * d;
          }
        }

        let height = (normalized * effectiveHeightScale) + (effectiveElevation * 20);
        heightmap[z][x] = Math.max(0, Math.min(100, height));
      }
    }

    return heightmap;
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;

    // Use deterministic noise for biomes too, ensures neighbors agree on boundaries
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
