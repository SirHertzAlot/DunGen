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

    this.applySmoothingPass(heightmap, size);

    this.chunkCache.set(cacheKey, chunk);
    
    if (this.chunkCache.size > 100) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }

    log.info("Generated terrain chunk using algorithm logic", {
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
    const zoomFactor = 100;
    const xOffset = 10000;
    const yOffset = 10000;

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
        
        heightmap[z][x] = Math.max(0, Math.min(1, noiseValue));
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

    const noiseVal = (this.noise2D(x, z) + 1) / 2;

    let biomeType: BiomeType["type"] = "grassland";

    if (noiseVal < 0.4) {
      biomeType = "ocean";
    } else if (noiseVal < 0.5) {
      biomeType = "desert";
    } else if (noiseVal < 0.7) {
      biomeType = "grassland";
    } else {
      biomeType = "forest";
    }

    return {
      type: biomeType,
      elevation: noiseVal,
      moisture: noiseVal,
      temperature: noiseVal,
      noiseScale: 0.05,
      heightScale: 1.0,
      baseHeight: 0.0,
    };
  }
}
