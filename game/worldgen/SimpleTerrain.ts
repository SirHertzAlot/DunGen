// Configuration-driven terrain generator with hot-loadable YAML configs
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';
import { TerrainConfigManager, TerrainTypeConfig } from './TerrainConfig';
import { NoiseEngine } from './NoiseEngine';

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
  private configManager: TerrainConfigManager;
  private noiseEngine: NoiseEngine;

  public static getInstance(): SimpleTerrain {
    if (!SimpleTerrain.instance) {
      SimpleTerrain.instance = new SimpleTerrain();
    }
    return SimpleTerrain.instance;
  }

  constructor() {
    this.configManager = TerrainConfigManager.getInstance();
    this.noiseEngine = new NoiseEngine(this.seed);
  }

  // Simple noise function using sine/cosine (fallback)
  private noise(x: number, z: number, frequency: number = 0.01, amplitude: number = 1): number {
    const value = Math.sin(x * frequency + this.seed) * Math.cos(z * frequency + this.seed * 1.3) * amplitude;
    return (value + 1) / 2; // Normalize to 0-1
  }

  // Generate terrain chunk using configuration-driven system
  public generateChunk(chunkX: number, chunkZ: number, size: number = 64): TerrainChunk {
    try {
      const chunkSeed = this.hashChunk(chunkX, chunkZ);
      const biome = this.getBiomeFromConfig(chunkX, chunkZ);
      const terrainConfig = this.configManager.getTerrainType(biome.type);
      
      if (!terrainConfig) {
        throw new Error(`No terrain configuration found for biome: ${biome.type}`);
      }

      const genParams = this.configManager.getGenerationParameters();
      const seedMultipliers = genParams.unique_seed_multipliers;
      
      const heightmap: number[][] = [];

      // Generate heightmap using configuration-driven noise algorithms
      for (let z = 0; z < size; z++) {
        heightmap[z] = [];
        for (let x = 0; x < size; x++) {
          const worldX = chunkX * size + x;
          const worldZ = chunkZ * size + z;
          
          let height = 0;
          
          // Apply each noise algorithm from configuration
          for (let i = 0; i < terrainConfig.noise_algorithms.length; i++) {
            const algorithm = terrainConfig.noise_algorithms[i];
            const seedOffset = chunkSeed * seedMultipliers[i % seedMultipliers.length];
            
            height += this.noiseEngine.applyNoiseAlgorithm(
              algorithm,
              worldX,
              worldZ,
              seedOffset,
              terrainConfig.height_range[1] - terrainConfig.height_range[0]
            );
          }
          
          // Add chunk-specific variation to prevent repetition
          height += this.getChunkVariation(worldX, worldZ, chunkX, chunkZ, genParams);
          
          // Apply edge blending for seamless chunk transitions
          height = this.applyEdgeBlending(height, x, z, size, chunkX, chunkZ, genParams);
          
          // Clamp to terrain configuration range
          height = Math.max(
            terrainConfig.height_range[0], 
            Math.min(terrainConfig.height_range[1], height)
          );
          
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

      logger.info(`Generated terrain chunk (${chunkX}, ${chunkZ}) - ${biome.type} biome with ${terrainConfig.noise_algorithms.length} algorithms`);

      return chunk;
    } catch (error: any) {
      logger.error(`Failed to generate terrain chunk (${chunkX}, ${chunkZ}): ${error.message}`);
      throw new Error('Failed to generate terrain chunk');
    }
  }

  private hashChunk(chunkX: number, chunkZ: number): number {
    return (chunkX * 73856093 + chunkZ * 19349663 + this.seed) >>> 0;
  }

  // Configuration-driven biome determination using hot-loadable YAML config  
  private getBiomeFromConfig(chunkX: number, chunkZ: number): BiomeType {
    const chunkSeed = this.hashChunk(chunkX, chunkZ);
    const biomeX = chunkX * 0.15;  
    const biomeZ = chunkZ * 0.15;
    
    // Generate biome characteristics
    const elevation = this.noise(biomeX, biomeZ, 0.008, 1);
    const temperature = this.noise(biomeX + 1000, biomeZ + 1000, 0.012, 1);
    const moisture = this.noise(biomeX + 2000, biomeZ + 2000, 0.009, 1);
    
    // Add chunk-specific randomness
    const chunkVariation = (chunkSeed % 1000) / 1000.0;
    
    // Use configuration manager to determine terrain type
    const terrainType = this.configManager.determineTerrainType(elevation, temperature, moisture, chunkVariation);
    const terrainConfig = this.configManager.getTerrainType(terrainType);
    
    return {
      type: terrainType as any,
      elevation,
      moisture,
      temperature,
      noiseScale: terrainConfig?.noise_algorithms[0]?.frequency || 0.05,
      heightScale: terrainConfig?.height_range[1] || 20
    };
  }

  // Configuration-driven chunk variation
  private getChunkVariation(worldX: number, worldZ: number, chunkX: number, chunkZ: number, genParams: any): number {
    // Use generation parameters from config
    const strength = genParams.chunk_variation_strength;
    const chunkVariation = Math.sin(chunkX * 0.47) * Math.cos(chunkZ * 0.61) * 3 * strength;
    const localVariation = this.noise(worldX, worldZ, 0.1, 2 * strength);
    return chunkVariation + localVariation;
  }

  // Seamless edge blending between chunks
  private applyEdgeBlending(height: number, localX: number, localZ: number, size: number, chunkX: number, chunkZ: number, genParams: any): number {
    const blendDistance = genParams.edge_blending_distance;
    const smoothing = genParams.transition_smoothing;
    
    // Calculate distance to chunk edges
    const distToLeft = localX;
    const distToRight = size - 1 - localX;
    const distToTop = localZ;
    const distToBottom = size - 1 - localZ;
    
    // Find minimum distance to any edge
    const minDistToEdge = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    
    // Only apply blending near edges
    if (minDistToEdge >= blendDistance) {
      return height;
    }
    
    // Calculate blend factor (0 at edge, 1 at blend distance)
    const blendFactor = Math.min(1, minDistToEdge / blendDistance);
    const smoothBlend = this.smoothStep(blendFactor);
    
    // Sample neighboring chunk heights for blending
    const neighborHeights: number[] = [];
    
    // Sample heights from neighboring chunks at edges
    if (distToLeft < blendDistance) {
      neighborHeights.push(this.sampleNeighborHeight(chunkX - 1, chunkZ, localX + size, localZ));
    }
    if (distToRight < blendDistance) {
      neighborHeights.push(this.sampleNeighborHeight(chunkX + 1, chunkZ, localX - size, localZ));
    }
    if (distToTop < blendDistance) {
      neighborHeights.push(this.sampleNeighborHeight(chunkX, chunkZ - 1, localX, localZ + size));
    }
    if (distToBottom < blendDistance) {
      neighborHeights.push(this.sampleNeighborHeight(chunkX, chunkZ + 1, localX, localZ - size));
    }
    
    // Average neighboring heights
    let avgNeighborHeight = height;
    if (neighborHeights.length > 0) {
      avgNeighborHeight = neighborHeights.reduce((sum, h) => sum + h, 0) / neighborHeights.length;
    }
    
    // Apply smoothing factor from config
    const finalBlend = smoothBlend * (1 - smoothing) + smoothing;
    
    // Blend between current height and neighbor average
    return height * finalBlend + avgNeighborHeight * (1 - finalBlend);
  }

  // Smooth step function for better blending curves
  private smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  // Sample height from neighboring chunk (simplified approximation)
  private sampleNeighborHeight(neighborChunkX: number, neighborChunkZ: number, sampleX: number, sampleZ: number): number {
    // Use the same noise-based approach to approximate neighbor heights
    const worldX = neighborChunkX * 64 + sampleX;
    const worldZ = neighborChunkZ * 64 + sampleZ;
    
    // Generate approximate height using same base noise
    const biome = this.getBiomeFromConfig(neighborChunkX, neighborChunkZ);
    const baseHeight = this.noise(worldX, worldZ, biome.noiseScale, biome.heightScale);
    
    return baseHeight;
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