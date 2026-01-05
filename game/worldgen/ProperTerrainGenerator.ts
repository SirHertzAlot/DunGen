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
  baseHeight: number;
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

    // Apply smoothing pass to soften edges
    this.applySmoothingPass(heightmap, size);

    this.chunkCache.set(cacheKey, chunk);
    
    if (this.chunkCache.size > 100) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }

    log.info("Generated terrain chunk with rollback algorithm logic", {
      service: "ProperTerrainGenerator",
      chunkX,
      chunkZ,
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
    const zoomFactor = 100; // From algorithm script
    const xOffset = 10000; // From algorithm script
    const yOffset = 10000; // From algorithm script

    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        // Absolute world coordinates for seamless sampling
        const worldX = (chunkX * size) + x;
        const worldZ = (chunkZ * size) + z;
        
        // Sampling multiple octaves to mimic noiseDetail(9, 0.5)
        const xVal = worldX / zoomFactor + xOffset;
        const yVal = worldZ / zoomFactor + yOffset;
        
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxAmplitude = 0;
        
        // 9 octaves with 0.5 persistence from algorithm
        for (let i = 0; i < 9; i++) {
          noiseValue += amplitude * (this.noise2D(xVal * frequency, yVal * frequency) + 1) / 2;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        
        noiseValue /= maxAmplitude;

        // Apply algorithm's height mappings:
        // 0.2 to 0.4: water (ocean)
        // 0.4 to 0.5: sand (desert)
        // 0.5 to 0.7: grass (grassland)
        // 0.7 to 0.75: trees (forest/mountain)
        
        // Final height mapping to 0-1 range based on the algorithm's thresholds
        let finalHeight = noiseValue;
        
        // We normalize noiseValue as the script assumes min is 0.2
        finalHeight = (finalHeight - 0.2) / 0.6; // Scale 0.2-0.8 range to 0.0-1.0
        finalHeight = Math.max(0, Math.min(1, finalHeight));
        
        heightmap[z][x] = finalHeight;
      }
    }

    return heightmap;
  }

  private applySmoothingPass(heightmap: number[][], size: number): void {
    const smoothed = JSON.parse(JSON.stringify(heightmap));
    for (let z = 1; z < size - 1; z++) {
      for (let x = 1; x < size - 1; x++) {
        let total = 0;
        let count = 0;
        for (let sz = -1; sz <= 1; sz++) {
          for (let sx = -1; sx <= 1; sx++) {
            total += smoothed[z + sz][x + sx];
            count++;
          }
        }
        heightmap[z][x] = total / count;
      }
    }
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;

    // Use deterministic noise for biomes
    const noiseVal = (this.noise2D(x, z) + 1) / 2;

    let biomeType: BiomeType["type"] = "grassland";
    let heightScale = 0.15;
    let baseHeight = 0.5;

    // Mapping biomes to the algorithm's thresholds
    if (noiseVal < 0.4) {
      biomeType = "ocean";
      baseHeight = 0.2;
    } else if (noiseVal < 0.5) {
      biomeType = "desert";
      baseHeight = 0.45;
    } else if (noiseVal < 0.7) {
      biomeType = "grassland";
      baseHeight = 0.6;
    } else {
      biomeType = "forest";
      baseHeight = 0.75;
    }

    return {
      type: biomeType,
      elevation: noiseVal,
      moisture: noiseVal,
      temperature: noiseVal,
      noiseScale: 0.05,
      heightScale,
      baseHeight,
    };
  }
}
