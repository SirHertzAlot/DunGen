import logger from "../../logging/logger";
import { v4 as uuidv4 } from "uuid";
import p5 from "p5";

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
  private seed: number = 12345;
  private p5Instance: any;

  private constructor() {
    // We use a headless p5 instance for noise generation
    this.p5Instance = new (p5 as any)(() => {});
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

    // Setup p5 noise detail - mimicking the script's setup
    this.p5Instance.noiseDetail(9, 0.5);
    this.p5Instance.noiseSeed(this.seed);

    // Generate heightmap using p5.js noise
    const heightmap = this.generateHeightmapWithP5(
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

    log.info("Generated terrain chunk with p5.js noise", {
      service: "ProperTerrainGenerator",
      chunkX,
      chunkZ,
      biome: biome.type,
    });

    return chunk;
  }

  private generateHeightmapWithP5(
    chunkX: number,
    chunkZ: number,
    size: number,
    biome: BiomeType
  ): number[][] {
    const heightmap: number[][] = [];
    const zoomFactor = 100; // From the provided script
    // Using large offsets as suggested in the script to avoid mirroring
    const xOffset = 10000 + chunkX * size;
    const yOffset = 10000 + chunkZ * size;

    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        // Map chunk local coords to noise space
        // Using (x / zoomFactor) + xOffset pattern from script for continuity
        const xVal = (x / zoomFactor) + (chunkX * size / zoomFactor) + 10000;
        const yVal = (z / zoomFactor) + (chunkZ * size / zoomFactor) + 10000;
        
        // Get noise value (0-1)
        let noiseValue = this.p5Instance.noise(xVal, yVal);
        
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
    const elevation = this.p5Instance.noise(x, z);
    const temperature = this.p5Instance.noise(x + 100, z + 100);
    const moisture = this.p5Instance.noise(x + 200, z + 200);

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
