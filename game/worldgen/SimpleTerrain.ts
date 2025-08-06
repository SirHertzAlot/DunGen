// Simplified terrain generator to get the system working
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';

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
  type: 'grassland' | 'forest' | 'desert' | 'mountain' | 'swamp' | 'tundra' | 'ocean' | 'marsh' | 'bog' | 'cave';
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

export class SimpleTerrain {
  private static instance: SimpleTerrain;
  private seed: number = 12345;

  public static getInstance(): SimpleTerrain {
    if (!SimpleTerrain.instance) {
      SimpleTerrain.instance = new SimpleTerrain();
    }
    return SimpleTerrain.instance;
  }

  // Simple noise function using sine/cosine
  private noise(x: number, z: number, frequency: number = 0.01, amplitude: number = 1): number {
    const value = Math.sin(x * frequency + this.seed) * Math.cos(z * frequency + this.seed * 1.3) * amplitude;
    return (value + 1) / 2; // Normalize to 0-1
  }

  // Generate a terrain chunk with realistic variety
  public generateChunk(chunkX: number, chunkZ: number, size: number = 64): TerrainChunk {
    const heightmap: number[][] = [];
    
    // Create unique seed for this chunk
    const chunkSeed = this.hashChunk(chunkX, chunkZ);
    
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const worldX = chunkX * size + x;
        const worldZ = chunkZ * size + z;
        
        // Multi-octave noise for realistic terrain
        let height = 0;
        
        // Base terrain (large features)
        height += this.noise(worldX, worldZ, 0.005, 20);
        
        // Medium features
        height += this.noise(worldX + chunkSeed, worldZ + chunkSeed, 0.015, 10);
        
        // Fine details
        height += this.noise(worldX * 2 + chunkSeed, worldZ * 2 + chunkSeed, 0.08, 3);
        
        // Add some variety based on chunk position
        const chunkVariation = Math.sin(chunkX * 0.3) * Math.cos(chunkZ * 0.3) * 15;
        height += chunkVariation;
        
        // Clamp to reasonable range
        height = Math.max(0, Math.min(80, height));
        
        heightmap[z][x] = height;
      }
    }

    // Determine biome based on chunk position
    const biome: BiomeType = this.getBiome(chunkX, chunkZ);

    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size,
      heightmap,
      biomes: [biome],
      features: [],
      generated: true,
      lastAccessed: Date.now()
    };

    logger.info('Generated terrain chunk', {
      service: 'SimpleTerrain',
      chunkX,
      chunkZ,
      biome: biome.type,
      avgHeight: this.getAverageHeight(heightmap)
    });

    return chunk;
  }

  private hashChunk(chunkX: number, chunkZ: number): number {
    return (chunkX * 73856093 + chunkZ * 19349663 + this.seed) >>> 0;
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;
    
    const elevation = this.noise(x, z, 0.01, 1);
    const temperature = this.noise(x + 100, z + 100, 0.008, 1);
    const moisture = this.noise(x + 200, z + 200, 0.012, 1);

    // Determine biome type based on elevation, temperature, moisture
    let biomeType: BiomeType['type'] = 'grassland';
    let heightScale = 20;
    let noiseScale = 0.05;

    if (elevation > 0.7) {
      biomeType = 'mountain';
      heightScale = 40;
      noiseScale = 0.03;
    } else if (elevation < 0.3) {
      biomeType = 'marsh';
      heightScale = 8;
      noiseScale = 0.1;
    } else if (temperature > 0.7 && moisture < 0.3) {
      biomeType = 'desert';
      heightScale = 15;
      noiseScale = 0.06;
    } else if (temperature < 0.3) {
      biomeType = 'tundra';
      heightScale = 12;
      noiseScale = 0.04;
    } else if (moisture > 0.6) {
      biomeType = 'forest';
      heightScale = 25;
      noiseScale = 0.07;
    }

    return {
      type: biomeType,
      elevation,
      moisture,
      temperature,
      noiseScale,
      heightScale
    };
  }

  private getAverageHeight(heightmap: number[][]): number {
    let total = 0;
    let count = 0;
    
    for (const row of heightmap) {
      for (const height of row) {
        total += height;
        count++;
      }
    }
    
    return count > 0 ? total / count : 0;
  }

  // Generate heightmap image data
  public generateHeightmapImage(chunk: TerrainChunk): Buffer {
    const size = chunk.size;
    const imageData = Buffer.alloc(size * size * 4); // RGBA

    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const height = chunk.heightmap[z][x];
        const normalizedHeight = Math.floor((height / 80) * 255);
        
        const index = (z * size + x) * 4;
        imageData[index] = normalizedHeight;     // R
        imageData[index + 1] = normalizedHeight; // G
        imageData[index + 2] = normalizedHeight; // B
        imageData[index + 3] = 255;              // A
      }
    }

    return imageData;
  }
}