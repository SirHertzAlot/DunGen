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

    // Apply smoothing pass to soften edges and peaks
    this.applySmoothingPass(heightmap, size);

    this.chunkCache.set(cacheKey, chunk);
    
    if (this.chunkCache.size > 100) {
      const oldestKey = this.chunkCache.keys().next().value;
      if (oldestKey) this.chunkCache.delete(oldestKey);
    }

    log.info("Generated terrain chunk with biome height variance", {
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
    const zoomFactor = 200;
    const xOffset = 10000;
    const yOffset = 10000;
    const blendWidth = 32; // Increased for smoother biome transitions

    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const worldX = (chunkX * size) + x;
        const worldZ = (chunkZ * size) + z;
        
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
        
        // Normalize noiseValue
        let normalized = (noiseValue - 0.2) / 0.6;
        normalized = Math.max(0, Math.min(1, normalized));
        
        let effectiveHeightScale = biome.heightScale;
        let effectiveBaseHeight = biome.baseHeight;

        if (x < blendWidth || x > size - blendWidth || z < blendWidth || z > size - blendWidth) {
          const nx = x < blendWidth ? -1 : (x > size - blendWidth ? 1 : 0);
          const nz = z < blendWidth ? -1 : (z > size - blendWidth ? 1 : 0);
          
          if (nx !== 0 || nz !== 0) {
            const neighborBiome = this.getBiome(chunkX + nx, chunkZ + nz);
            let d = 1.0;
            if (nx !== 0) d = Math.min(d, (nx < 0 ? x : size - 1 - x) / blendWidth);
            if (nz !== 0) d = Math.min(d, (nz < 0 ? z : size - 1 - z) / blendWidth);
            
            effectiveHeightScale = neighborBiome.heightScale * (1 - d) + biome.heightScale * d;
            effectiveBaseHeight = neighborBiome.baseHeight * (1 - d) + biome.baseHeight * d;
          }
        }

        let height = (normalized * effectiveHeightScale) + effectiveBaseHeight;
        heightmap[z][x] = Math.max(0, Math.min(500, height)); // Increased max height for mountains
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

    const elevation = (this.noise2D(x, z) + 1) / 2;
    const temperature = (this.noise2D(x + 100, z + 100) + 1) / 2;
    const moisture = (this.noise2D(x + 200, z + 200) + 1) / 2;

    let biomeType: BiomeType["type"] = "grassland";
    let heightScale = 40;
    let baseHeight = 20;

    // Mountain: Highest (Grey)
    if (elevation > 0.75) {
      biomeType = "mountain";
      heightScale = 300; // Extreme variance for peaks
      baseHeight = 150;  // High starting point
    } 
    // Forest: High (Dark Green)
    else if (moisture > 0.65 && elevation > 0.4) {
      biomeType = "forest";
      heightScale = 60;
      baseHeight = 40;
    }
    // Grassland: Medium (Green)
    else if (elevation > 0.3) {
      biomeType = "grassland";
      heightScale = 30;
      baseHeight = 20;
    }
    // Desert/Sand: Low (Sand color)
    else if (elevation > 0.15) {
      biomeType = "desert";
      heightScale = 15;
      baseHeight = 10;
    }
    // Ocean/Water: Lowest (Blue)
    else {
      biomeType = "ocean";
      heightScale = 10;
      baseHeight = 0;
    }

    return {
      type: biomeType,
      elevation,
      moisture,
      temperature,
      noiseScale: 0.05,
      heightScale,
      baseHeight,
    };
  }
}
