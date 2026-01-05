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

  private constructor() {
    // Simplex noise is more backend-stable than p5.js
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
    size: number = 64,
  ): TerrainChunk {
    const biome = this.getBiome(chunkX, chunkZ);

    // Generate heightmap using Simplex noise
    // We'll mimic the p5 noise behavior: multiple octaves
    const heightmap = this.generateHeightmap(
      chunkX,
      chunkZ,
      size,
      biome
    );

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

    log.info("Generated terrain chunk with Simplex noise", {
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
        // Map chunk local coords to noise space
        const worldX = (chunkX * size) + x;
        const worldZ = (chunkZ * size) + z;
        
        const xVal = worldX / zoomFactor + xOffset;
        const yVal = worldZ / zoomFactor + yOffset;
        
        // Simplex noise returns -1 to 1, we map to 0-1
        // We use fractional Brownian motion (fBm) to mimic noiseDetail(9, 0.5)
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxAmplitude = 0;
        
        // 9 octaves with 0.5 persistence
        for (let i = 0; i < 9; i++) {
          noiseValue += amplitude * (this.noise2D(xVal * frequency, yVal * frequency) + 1) / 2;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        
        noiseValue /= maxAmplitude;
        
        // Normalize noiseValue as script assumes min is 0.2 and max is 0.8
        let normalized = (noiseValue - 0.2) / 0.6;
        normalized = Math.max(0, Math.min(1, normalized));
        
        // Scale by biome height and add elevation base
        let height = (normalized * biome.heightScale) + (biome.elevation * 20);
        
        // Clamp to 0-100 range
        heightmap[z][x] = Math.max(0, Math.min(100, height));
      }
    }

    return heightmap;
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;

    // Determine biome using noise
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
