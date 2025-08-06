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

  // Generate a terrain chunk with unique biome-specific terrain algorithms
  public generateChunk(chunkX: number, chunkZ: number, size: number = 64): TerrainChunk {
    const chunkSeed = this.hashChunk(chunkX, chunkZ);
    const biome = this.getBiome(chunkX, chunkZ);
    
    // Use chunk-specific seeds for unique generation
    const seedA = (chunkSeed * 73) % 10000;
    const seedB = (chunkSeed * 137) % 10000;
    const seedC = (chunkSeed * 241) % 10000;
    
    const heightmap: number[][] = [];

    // Generate heightmap using biome-specific terrain algorithms
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const worldX = chunkX * size + x;
        const worldZ = chunkZ * size + z;
        
        let height = 0;
        
        // Apply biome-specific terrain generation
        switch (biome.type) {
          case 'mountain':
            height += this.generateMountainTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          case 'desert':
            height += this.generateDesertTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          case 'forest':
            height += this.generateForestTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          case 'swamp':
            height += this.generateSwampTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          case 'tundra':
            height += this.generateTundraTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          case 'marsh':
            height += this.generateMarshTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
            
          default: // grassland
            height += this.generateGrasslandTerrain(worldX, worldZ, seedA, seedB, biome);
            break;
        }
        
        // Add chunk-specific variation to prevent repetition
        height += this.getChunkVariation(worldX, worldZ, chunkX, chunkZ, seedC);
        
        // Clamp to biome-appropriate range
        height = Math.max(0, Math.min(biome.heightScale * 2, height));
        
        heightmap[z][x] = height;
      }
    }

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
      heightScale: biome.heightScale,
      avgHeight: this.getAverageHeight(heightmap)
    });

    return chunk;
  }

  private hashChunk(chunkX: number, chunkZ: number): number {
    return (chunkX * 73856093 + chunkZ * 19349663 + this.seed) >>> 0;
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    // Use chunk coordinates directly to create distinct biome regions
    const chunkSeed = this.hashChunk(chunkX, chunkZ);
    const biomeX = chunkX * 0.15;  // Increased scale for larger biome regions
    const biomeZ = chunkZ * 0.15;
    
    // Generate biome characteristics with more variation
    const elevation = this.noise(biomeX, biomeZ, 0.008, 1);
    const temperature = this.noise(biomeX + 1000, biomeZ + 1000, 0.012, 1);
    const moisture = this.noise(biomeX + 2000, biomeZ + 2000, 0.009, 1);
    
    // Add chunk-specific randomness for unique terrain per chunk
    const chunkVariation = (chunkSeed % 1000) / 1000.0;
    
    // Determine biome with clearer boundaries and more diversity
    let biomeType: BiomeType['type'] = 'grassland';
    let heightScale = 20;
    let noiseScale = 0.05;

    // Mountains - high elevation areas
    if (elevation > 0.65 || (elevation > 0.4 && chunkVariation > 0.8)) {
      biomeType = 'mountain';
      heightScale = Math.floor(35 + chunkVariation * 25); // 35-60 range
      noiseScale = 0.02 + chunkVariation * 0.02; // 0.02-0.04
    }
    // Deserts - hot, dry areas  
    else if (temperature > 0.6 && moisture < 0.4) {
      biomeType = 'desert';
      heightScale = Math.floor(10 + chunkVariation * 15); // 10-25 range
      noiseScale = 0.06 + chunkVariation * 0.04; // 0.06-0.10
    }
    // Swamps - low elevation, high moisture
    else if (elevation < 0.35 && moisture > 0.5) {
      biomeType = 'swamp';
      heightScale = Math.floor(3 + chunkVariation * 8); // 3-11 range
      noiseScale = 0.08 + chunkVariation * 0.05; // 0.08-0.13
    }
    // Tundra - cold areas
    else if (temperature < 0.35) {
      biomeType = 'tundra';
      heightScale = Math.floor(8 + chunkVariation * 12); // 8-20 range
      noiseScale = 0.04 + chunkVariation * 0.03; // 0.04-0.07
    }
    // Forests - moderate temp, high moisture
    else if (moisture > 0.55 && temperature > 0.35) {
      biomeType = 'forest';
      heightScale = Math.floor(20 + chunkVariation * 20); // 20-40 range
      noiseScale = 0.05 + chunkVariation * 0.04; // 0.05-0.09
    }
    // Marshes - low areas with some moisture
    else if (elevation < 0.45 && moisture > 0.35) {
      biomeType = 'marsh';
      heightScale = Math.floor(5 + chunkVariation * 10); // 5-15 range
      noiseScale = 0.07 + chunkVariation * 0.06; // 0.07-0.13
    }
    // Default grassland with variation
    else {
      biomeType = 'grassland';
      heightScale = Math.floor(15 + chunkVariation * 15); // 15-30 range
      noiseScale = 0.04 + chunkVariation * 0.04; // 0.04-0.08
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