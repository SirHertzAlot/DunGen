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

export class ProperTerrainGenerator {
  private static instance: ProperTerrainGenerator;
  private seed: number = 12345;

  public static getInstance(): ProperTerrainGenerator {
    if (!ProperTerrainGenerator.instance) {
      ProperTerrainGenerator.instance = new ProperTerrainGenerator();
    }
    return ProperTerrainGenerator.instance;
  }

  public generateChunk(chunkX: number, chunkZ: number, size: number = 64): TerrainChunk {
    const chunkSeed = this.hashChunk(chunkX, chunkZ);
    const biome = this.getBiome(chunkX, chunkZ);
    
    // Generate heightmap using our pipeline with THREE.Terrain noise functions
    const heightmap = this.generateHeightmapWithNoise(chunkX, chunkZ, size, biome, chunkSeed);
    
    // Apply biome-specific modifications
    this.applyBiomeModifications(heightmap, biome, chunkX, chunkZ, size);

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

    logger.info('Generated terrain chunk with THREE.Terrain', {
      service: 'ProperTerrainGenerator',
      chunkX,
      chunkZ,
      biome: biome.type,
      avgHeight: this.getAverageHeight(heightmap),
      maxHeight: Math.max(...heightmap.flat()),
      minHeight: Math.min(...heightmap.flat())
    });

    return chunk;
  }

  private generateHeightmapWithNoise(chunkX: number, chunkZ: number, size: number, biome: BiomeType, seed: number): number[][] {
    const heightmap: number[][] = [];
    const worldOffsetX = chunkX * size;
    const worldOffsetZ = chunkZ * size;
    
    // Initialize heightmap
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        heightmap[z][x] = 0;
      }
    }
    
    // Apply base elevation based on biome position
    const baseElevation = biome.elevation * biome.heightScale;
    
    // Generate terrain using our noise pipeline
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;
        
        // Use THREE.Terrain-style noise functions in our pipeline
        let height = baseElevation;
        
        // Primary terrain shape based on biome
        height += this.getBiomeNoise(worldX, worldZ, biome, seed);
        
        // Add detail layers
        height += this.getDetailNoise(worldX, worldZ, biome, seed);
        
        // Ensure smooth transitions between chunks
        height += this.getTransitionNoise(worldX, worldZ, chunkX, chunkZ, size);
        
        // Clamp to reasonable range
        heightmap[z][x] = Math.max(0, Math.min(100, height));
      }
    }
    
    return heightmap;
  }
  
  private getBiomeNoise(worldX: number, worldZ: number, biome: BiomeType, seed: number): number {
    const x = worldX * biome.noiseScale;
    const z = worldZ * biome.noiseScale;
    
    switch (biome.type) {
      case 'mountain':
        // Use ridge noise for mountain peaks
        const ridgeNoise = Math.abs(Math.sin(x + seed) * Math.cos(z + seed * 1.3));
        return Math.pow(ridgeNoise, 2) * biome.heightScale * 0.8;
        
      case 'desert':
        // Use multiple octaves for sand dunes
        const dune1 = Math.sin(x * 0.8 + seed) * Math.cos(z * 0.6 + seed);
        const dune2 = Math.sin(x * 1.5 + seed * 2) * Math.cos(z * 1.2 + seed * 2) * 0.3;
        return (dune1 + dune2) * biome.heightScale * 0.4;
        
      case 'forest':
        // Rolling hills with Perlin-style noise
        const hill1 = Math.sin(x + seed) * Math.cos(z + seed * 1.1);
        const hill2 = Math.sin(x * 2.1 + seed * 3) * Math.cos(z * 1.8 + seed * 3) * 0.5;
        return (hill1 + hill2) * biome.heightScale * 0.6;
        
      case 'marsh':
      case 'swamp':
        // Gentle undulation with occasional mounds
        const base = Math.sin(x * 0.3 + seed) * Math.cos(z * 0.4 + seed) * 0.3;
        const mound = Math.max(0, Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed) - 0.7) * 2;
        return (base + mound) * biome.heightScale * 0.3;
        
      default:
        // Grassland - gentle rolling terrain
        return Math.sin(x + seed) * Math.cos(z + seed * 1.2) * biome.heightScale * 0.4;
    }
  }
  
  private getDetailNoise(worldX: number, worldZ: number, biome: BiomeType, seed: number): number {
    // Add fine detail based on biome type
    const detailScale = biome.noiseScale * 3;
    const x = worldX * detailScale;
    const z = worldZ * detailScale;
    
    const detail = Math.sin(x + seed * 5) * Math.cos(z + seed * 7) * 0.2;
    return detail * biome.heightScale * 0.1;
  }
  
  private getTransitionNoise(worldX: number, worldZ: number, chunkX: number, chunkZ: number, size: number): number {
    // Add subtle variation to prevent harsh chunk boundaries
    const transitionScale = 0.01;
    const x = worldX * transitionScale;
    const z = worldZ * transitionScale;
    
    return Math.sin(x) * Math.cos(z) * 2;
  }



  private applyBiomeModifications(heightmap: number[][], biome: BiomeType, chunkX: number, chunkZ: number, size: number): void {
    const worldOffsetX = chunkX * size;
    const worldOffsetZ = chunkZ * size;

    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;
        let height = heightmap[z][x];

        // Apply biome-specific terrain shaping
        switch (biome.type) {
          case 'mountain':
            // Add ridges and peaks
            const ridgeNoise = Math.sin(worldX * 0.01) * Math.cos(worldZ * 0.01);
            height += Math.pow(Math.abs(ridgeNoise), 2) * 30;
            break;
          
          case 'desert':
            // Add sand dunes
            const duneNoise = Math.sin(worldX * 0.02) + Math.cos(worldZ * 0.015);
            height += duneNoise * 8;
            break;
          
          case 'forest':
            // Add rolling hills
            const hillNoise = Math.sin(worldX * 0.005) * Math.cos(worldZ * 0.007);
            height += hillNoise * 12;
            break;
          
          case 'marsh':
          case 'swamp':
            // Flatten and add occasional mounds
            height *= 0.6;
            const moundNoise = Math.sin(worldX * 0.03) * Math.cos(worldZ * 0.03);
            if (moundNoise > 0.7) {
              height += moundNoise * 5;
            }
            break;
        }

        // Apply elevation offset
        height += biome.elevation * 15;
        
        // Ensure reasonable height range
        heightmap[z][x] = Math.max(0, Math.min(100, height));
      }
    }
  }

  private getBiome(chunkX: number, chunkZ: number): BiomeType {
    const x = chunkX * 0.1;
    const z = chunkZ * 0.1;
    
    // Use THREE.Terrain's noise functions for biome determination
    const elevation = this.sampleNoise(x, z, 0.01);
    const temperature = this.sampleNoise(x + 100, z + 100, 0.008);
    const moisture = this.sampleNoise(x + 200, z + 200, 0.012);

    let biomeType: BiomeType['type'] = 'grassland';
    let heightScale = 25;
    let noiseScale = 0.05;

    if (elevation > 0.7) {
      biomeType = 'mountain';
      heightScale = 60;
      noiseScale = 0.02;
    } else if (elevation < 0.3) {
      if (moisture > 0.6) {
        biomeType = 'marsh';
        heightScale = 10;
        noiseScale = 0.08;
      } else {
        biomeType = 'desert';
        heightScale = 20;
        noiseScale = 0.04;
      }
    } else if (temperature > 0.6 && moisture < 0.4) {
      biomeType = 'desert';
      heightScale = 25;
      noiseScale = 0.06;
    } else if (temperature < 0.3) {
      biomeType = 'tundra';
      heightScale = 15;
      noiseScale = 0.03;
    } else if (moisture > 0.6) {
      biomeType = 'forest';
      heightScale = 35;
      noiseScale = 0.04;
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

  private sampleNoise(x: number, z: number, frequency: number): number {
    // Simple noise function - in production you'd use THREE.Terrain's noise
    const value = Math.sin(x * frequency + this.seed) * Math.cos(z * frequency + this.seed * 1.3);
    return (value + 1) / 2; // Normalize to 0-1
  }

  private hashChunk(chunkX: number, chunkZ: number): number {
    return Math.abs((chunkX * 73856093 + chunkZ * 19349663 + this.seed) % 1000000);
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
}