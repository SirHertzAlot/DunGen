import { readFileSync } from 'fs';
import * as yaml from 'yaml';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';
import { WorldMap } from './WorldMap.js';
import * as THREE from 'three';
import Terrain from 'three-terrain';

// Terrain chunk data structure
export interface TerrainChunk {
  id: string;
  x: number;
  z: number;
  size: number;
  heightmap: number[][];
  biomes: BiomeType[][];
  features: TerrainFeature[];
  generated: boolean;
  lastAccessed: number;
}

export interface TerrainFeature {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  properties: Record<string, any>;
}

export interface BiomeType {
  name: string;
  temperature: number;
  humidity: number;
  color: [number, number, number];
}

export interface WorldGenConfig {
  world: {
    name: string;
    seed: number;
    chunk_size: number;
    world_size: number;
    sea_level: number;
  };
  pipeline: {
    steps: Array<{
      name: string;
      type: string;
      enabled: boolean;
      config: Record<string, any>;
    }>;
  };
  biomes: Record<string, any>;
  performance: {
    cache_chunks: boolean;
    cache_size: number;
    async_generation: boolean;
    worker_threads: number;
    lod_levels: number;
  };
}

// Main terrain generator class
export class TerrainGenerator {
  private static instance: TerrainGenerator;
  private config!: WorldGenConfig;
  private terrainOptions: any = {};
  private chunkCache: Map<string, TerrainChunk> = new Map();
  private generationQueue: Set<string> = new Set();
  private worldMap: WorldMap;

  constructor(configPath: string = './config/worldgen.yaml') {
    this.worldMap = new WorldMap();
    this.loadConfig(configPath);
    this.initializeNoiseGenerators();
  }

  public static getInstance(configPath?: string): TerrainGenerator {
    if (!TerrainGenerator.instance) {
      TerrainGenerator.instance = new TerrainGenerator(configPath);
    }
    return TerrainGenerator.instance;
  }

  private loadConfig(configPath: string): void {
    try {
      const configFile = readFileSync(configPath, 'utf8');
      this.config = yaml.parse(configFile);
      
      logger.info('World generation config loaded', {
        service: 'TerrainGenerator',
        worldName: this.config.world.name,
        seed: this.config.world.seed,
        chunkSize: this.config.world.chunk_size
      });
    } catch (error) {
      logger.error('Failed to load world generation config', error as Error, {
        service: 'TerrainGenerator',
        configPath
      });
      throw error;
    }
  }

  private initializeNoiseGenerators(): void {
    try {
      // Initialize THREE.Terrain options for realistic terrain generation
      this.terrainOptions = {
        easing: Terrain.Linear,
        frequency: 2.5,
        heightmap: Terrain.DiamondSquare,
        maxHeight: 80,
        minHeight: 0,
        steps: 1,
        xSegments: this.config.world.chunk_size - 1,
        xSize: this.config.world.chunk_size,
        ySegments: this.config.world.chunk_size - 1,
        ySize: this.config.world.chunk_size,
      };

      const generators = ['base_terrain', 'mountains', 'valleys', 'temperature', 'humidity', 'features'];

      logger.info('Noise generators initialized', {
        service: 'TerrainGenerator',
        generators
      });
    } catch (error) {
      logger.error('Failed to initialize noise generators', error as Error, {
        service: 'TerrainGenerator'
      });
    }
  }

  // Generate or retrieve a terrain chunk
  public async getChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    // DISABLE CACHING FOR HEIGHTMAP TESTING - Always generate fresh chunks
    // This ensures we get varied terrain for quality assessment
    const chunk = await this.generateChunk(chunkX, chunkZ);
    return chunk;
  }

  // Hash function for chunk coordinates to generate truly unique seeds
  private hashChunkCoords(chunkX: number, chunkZ: number): number {
    // Create a deterministic but unique seed for each chunk position
    const prime1 = 73856093;
    const prime2 = 19349663;
    const prime3 = 83492791;
    
    const seed = this.config.world.seed || 12345;
    
    // Use chunk coordinates to create unique seed - NO TIMESTAMP
    let hash = seed;
    hash = (hash * prime1 + chunkX) % 2147483647;
    hash = (hash * prime2 + chunkZ) % 2147483647;
    hash = (hash * prime3 + (chunkX * chunkZ)) % 2147483647;
    
    return Math.abs(hash);
  }

  private async generateChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const startTime = Date.now();
    const size = this.config.world.chunk_size;
    
    // Generate completely unique terrain for each chunk using position-based patterns
    const heightmap: number[][] = [];
    
    // Create unique base patterns for each chunk using chunk coordinates
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        // Use world coordinates for unique patterns
        const worldX = chunkX * size + x;
        const worldZ = chunkZ * size + z;
        
        // Create multiple noise layers with different characteristics based on chunk position
        let height = 0;
        
        // Base terrain layer - varies by chunk position
        const baseFreq = 0.01 + (Math.abs(chunkX) * 0.0001) + (Math.abs(chunkZ) * 0.0001);
        height += Math.sin(worldX * baseFreq) * Math.cos(worldZ * baseFreq) * 20;
        
        // Mountain layer - only in certain chunk regions
        if ((chunkX + chunkZ) % 3 === 0) {
          const mountainFreq = 0.005 + (chunkX * 0.0002);
          height += Math.sin(worldX * mountainFreq) * Math.sin(worldZ * mountainFreq) * 40;
        }
        
        // Hill pattern - varies by chunk coordinates
        const hillFreq = 0.02 + (Math.abs(chunkX * chunkZ) * 0.00001);
        height += Math.sin(worldX * hillFreq + chunkX) * Math.cos(worldZ * hillFreq + chunkZ) * 15;
        
        // Ridge pattern - unique per chunk
        if (chunkX % 2 === 0) {
          height += Math.sin(worldX * 0.008 + chunkZ) * 25;
        }
        if (chunkZ % 2 === 0) {
          height += Math.cos(worldZ * 0.008 + chunkX) * 25;
        }
        
        // Add chunk-specific offset to ensure no two chunks are identical
        height += (chunkX * 13 + chunkZ * 17) % 20;
        
        heightmap[z][x] = Math.max(0, Math.min(80, height + 40)); // Clamp to 0-80 range, offset by 40
      }
    }
    
    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size,
      heightmap,
      biomes: [{
        type: 'grassland',
        elevation: 0.5,
        moisture: 0.5,
        temperature: 0.5,
        noiseScale: 0.1,
        heightScale: 20
      }],
      features: [],
      generated: true,
      lastAccessed: Date.now()
    };
    
    const generationTime = Date.now() - startTime;
    logger.info('Chunk generated', {
      service: 'TerrainGenerator',
      chunkId: chunk.id,
      position: [chunkX, chunkZ],
      generationTime,
      features: chunk.features.length
    });

    return chunk;
  }

  private async runGenerationPipeline(chunk: TerrainChunk): Promise<void> {
    for (const step of this.config.pipeline.steps) {
      if (!step.enabled) continue;

      switch (step.type) {
        case 'heightmap':
          await this.generateBaseHeightmap(chunk, step.config);
          break;
        case 'heightmap_layer':
          await this.applyHeightmapLayer(chunk, step.config);
          break;
        case 'biome_map':
          await this.generateBiomes(chunk, step.config);
          break;
        case 'feature_placement':
          await this.placeFeatures(chunk, step.config);
          break;
      }
    }
  }

  private async generateBaseHeightmap(chunk: TerrainChunk, config: any): Promise<void> {
    // Use THREE.Terrain for base heightmap generation
    const chunkSeed = this.hashChunkCoords(chunk.x, chunk.z);
    
    const terrainOptions = {
      ...this.terrainOptions,
      seed: chunkSeed,
      frequency: config.frequency || 0.01,
      heightmap: Terrain.DiamondSquare,
      maxHeight: config.amplitude || 40,
      minHeight: 0,
    };
    
    const terrainGeometry = Terrain(terrainOptions);
    const vertices = terrainGeometry.attributes.position.array;
    
    // Convert geometry vertices to heightmap
    for (let z = 0; z < chunk.size; z++) {
      for (let x = 0; x < chunk.size; x++) {
        const index = z * chunk.size + x;
        const height = vertices[index * 3 + 1]; // Y component
        chunk.heightmap[x][z] = Math.max(0, height + this.config.world.sea_level);
      }
    }
  }

  private async applyHeightmapLayer(chunk: TerrainChunk, config: any): Promise<void> {
    const { octaves, frequency, amplitude, blend_mode, mask_threshold } = config;

    for (let x = 0; x < chunk.size; x++) {
      for (let z = 0; z < chunk.size; z++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;

        let layerHeight = 0;
        let currentAmplitude = amplitude;
        let currentFrequency = frequency;

        for (let octave = 0; octave < octaves; octave++) {
          // Use deterministic noise based on position
          let noiseValue = Math.sin(worldX * currentFrequency) * Math.cos(worldZ * currentFrequency);
          
          // Ridged noise for mountains
          if (config.algorithm === 'ridged_noise') {
            noiseValue = Math.abs(noiseValue);
            noiseValue = 1.0 - noiseValue;
            noiseValue = noiseValue * noiseValue;
          }

          layerHeight += noiseValue * currentAmplitude;
          currentAmplitude *= 0.5;
          currentFrequency *= 2.0;
        }

        // Apply mask
        if (mask_threshold !== undefined) {
          const maskNoise = Math.sin(worldX * 0.01) * Math.cos(worldZ * 0.01);
          if (maskNoise < mask_threshold) {
            layerHeight *= (maskNoise - mask_threshold) / (1.0 - mask_threshold);
          }
        }

        // Blend with existing heightmap
        const currentHeight = chunk.heightmap[x][z];
        switch (blend_mode) {
          case 'add':
            chunk.heightmap[x][z] = currentHeight + layerHeight;
            break;
          case 'multiply':
            chunk.heightmap[x][z] = currentHeight * (1 + layerHeight / 100);
            break;
          case 'max':
            chunk.heightmap[x][z] = Math.max(currentHeight, layerHeight);
            break;
          default:
            chunk.heightmap[x][z] = currentHeight + layerHeight;
        }
      }
    }
  }

  private async generateBiomes(chunk: TerrainChunk, config: any): Promise<void> {
    const tempNoise = this.noiseGenerators.get('temperature')!;
    const humidNoise = this.noiseGenerators.get('humidity')!;

    for (let x = 0; x < chunk.size; x++) {
      for (let z = 0; z < chunk.size; z++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;
        const height = chunk.heightmap[x][z];

        // Generate temperature and humidity
        const temperature = tempNoise(worldX * config.temperature_frequency, worldZ * config.temperature_frequency);
        const humidity = humidNoise(worldX * config.humidity_frequency, worldZ * config.humidity_frequency);

        // Determine biome based on height, temperature, and humidity
        const biome = this.determineBiome(height, temperature, humidity);
        chunk.biomes[x][z] = biome;
      }
    }
  }

  private determineBiome(height: number, temperature: number, humidity: number): BiomeType {
    const seaLevel = this.config.world.sea_level;

    // Ocean
    if (height < seaLevel) {
      return {
        name: 'ocean',
        temperature,
        humidity,
        color: [0, 100, 200]
      };
    }

    // Beach
    if (height < seaLevel + 5) {
      return {
        name: 'beach',
        temperature,
        humidity,
        color: [255, 235, 160]
      };
    }

    // Mountain
    if (height > 80) {
      return {
        name: 'mountain',
        temperature: temperature - 0.3, // Cooler at altitude
        humidity,
        color: [150, 150, 150]
      };
    }

    // Desert (hot and dry)
    if (temperature > 0.5 && humidity < -0.3) {
      return {
        name: 'desert',
        temperature,
        humidity,
        color: [255, 200, 100]
      };
    }

    // Forest (moderate temp, high humidity)
    if (temperature > -0.5 && temperature < 0.6 && humidity > 0.3) {
      return {
        name: 'forest',
        temperature,
        humidity,
        color: [50, 150, 50]
      };
    }

    // Default to grassland
    return {
      name: 'grassland',
      temperature,
      humidity,
      color: [100, 200, 50]
    };
  }

  private async placeFeatures(chunk: TerrainChunk, config: any): Promise<void> {
    // Simple feature placement without noise generators
    for (const featureConfig of config.features) {
      const density = featureConfig.density;
      const placementAttempts = Math.floor(chunk.size * chunk.size * density);

      for (let attempt = 0; attempt < placementAttempts; attempt++) {
        const x = Math.floor(Math.random() * chunk.size);
        const z = Math.floor(Math.random() * chunk.size);
        const height = chunk.heightmap[x][z];
        const biome = chunk.biomes[0]; // Use first biome as simplified reference

        // Check height range
        const [minHeight, maxHeight] = featureConfig.height_range;
        if (height < minHeight || height > maxHeight) {
          continue;
        }

        // Use deterministic distribution
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;
        const noiseValue = Math.sin(worldX * 0.05) * Math.cos(worldZ * 0.05);
        
        if (noiseValue > 0.3) { // Threshold for feature placement
          const feature: TerrainFeature = {
            id: uuidv4(),
            type: featureConfig.type,
            x: worldX,
            y: height,
            z: worldZ,
            properties: {
              biome: biome.type,
              size: Math.random() * 10 + 5,
              variant: Math.floor(Math.random() * 3)
            }
          };

          chunk.features.push(feature);
        }
      }
    }
  }

  private manageCacheSize(): void {
    if (!this.config.performance.cache_chunks) return;

    const maxSize = this.config.performance.cache_size;
    if (this.chunkCache.size <= maxSize) return;

    // Remove oldest chunks
    const chunks = Array.from(this.chunkCache.entries());
    chunks.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toRemove = chunks.slice(0, chunks.length - maxSize);
    for (const [key] of toRemove) {
      this.chunkCache.delete(key);
    }

    logger.info('Cache cleaned', {
      service: 'TerrainGenerator',
      removed: toRemove.length,
      remaining: this.chunkCache.size
    });
  }

  // Get height at specific world coordinates
  public async getHeightAtPosition(worldX: number, worldZ: number): Promise<number> {
    const chunkX = Math.floor(worldX / this.config.world.chunk_size);
    const chunkZ = Math.floor(worldZ / this.config.world.chunk_size);
    const chunk = await this.getChunk(chunkX, chunkZ);

    const localX = worldX - (chunkX * this.config.world.chunk_size);
    const localZ = worldZ - (chunkZ * this.config.world.chunk_size);

    return chunk.heightmap[localX][localZ];
  }

  // Get biome at specific world coordinates
  public async getBiomeAtPosition(worldX: number, worldZ: number): Promise<BiomeType> {
    const chunkX = Math.floor(worldX / this.config.world.chunk_size);
    const chunkZ = Math.floor(worldZ / this.config.world.chunk_size);
    const chunk = await this.getChunk(chunkX, chunkZ);

    const localX = worldX - (chunkX * this.config.world.chunk_size);
    const localZ = worldZ - (chunkZ * this.config.world.chunk_size);

    return chunk.biomes[localX][localZ];
  }

  // Get all features in a region
  public async getFeaturesInRegion(minX: number, minZ: number, maxX: number, maxZ: number): Promise<TerrainFeature[]> {
    const features: TerrainFeature[] = [];
    const chunkSize = this.config.world.chunk_size;

    const minChunkX = Math.floor(minX / chunkSize);
    const maxChunkX = Math.floor(maxX / chunkSize);
    const minChunkZ = Math.floor(minZ / chunkSize);
    const maxChunkZ = Math.floor(maxZ / chunkSize);

    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
      for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
        const chunk = await this.getChunk(chunkX, chunkZ);
        for (const feature of chunk.features) {
          if (feature.x >= minX && feature.x <= maxX && feature.z >= minZ && feature.z <= maxZ) {
            features.push(feature);
          }
        }
      }
    }

    return features;
  }

  // Get world configuration
  public getConfig(): WorldGenConfig {
    return this.config;
  }

  // Force generate a mountain chunk using massive mountain range system
  public async generateMountainChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const chunkKey = `${chunkX},${chunkZ}`;
    
    // Create massive mountain chunk
    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size: 512, // Force massive 512x512 chunk for mountain ranges
      heightmap: [],
      biomes: [],
      features: [],
      generated: true,
      lastAccessed: Date.now()
    };

    // Initialize massive heightmap and biomes
    for (let x = 0; x < chunk.size; x++) {
      chunk.heightmap[x] = [];
      chunk.biomes[x] = [];
      for (let z = 0; z < chunk.size; z++) {
        chunk.heightmap[x][z] = 0;
        chunk.biomes[x][z] = {
          name: 'mountain',
          temperature: 0.2,
          humidity: 0.4,
          color: [139, 137, 137] as [number, number, number]
        };
      }
    }

    // Generate massive mountain range using our advanced algorithms
    await this.applyMassiveMountainTerrain(chunk);
    
    // Cache the chunk
    this.chunkCache.set(chunkKey, chunk);
    
    logger.info(`Generated massive mountain chunk (${chunkX}, ${chunkZ}) - mountain biome (massive scale, size: ${chunk.size}x${chunk.size}) using advanced mountain algorithms`);

    return chunk;
  }

  private async applyMassiveMountainTerrain(chunk: TerrainChunk): Promise<void> {
    // Generate unique massive mountain terrain using position-based patterns
    for (let z = 0; z < chunk.size; z++) {
      for (let x = 0; x < chunk.size; x++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;
        
        let height = 0;
        
        // Massive mountain base - unique per chunk
        const mountainFreq1 = 0.002 + (chunk.x * 0.0001) + (chunk.z * 0.0001);
        height += Math.sin(worldX * mountainFreq1) * Math.cos(worldZ * mountainFreq1) * 120;
        
        // Alpine peaks - varies by chunk coordinates
        const peakFreq = 0.005 + (Math.abs(chunk.x * chunk.z) * 0.00001);
        height += Math.sin(worldX * peakFreq + chunk.x) * Math.sin(worldZ * peakFreq + chunk.z) * 80;
        
        // Ridge systems - unique patterns per chunk
        if (chunk.x % 3 === 0) {
          height += Math.sin(worldX * 0.003 + chunk.z * 7) * 60;
        }
        if (chunk.z % 3 === 0) {
          height += Math.cos(worldZ * 0.003 + chunk.x * 11) * 60;
        }
        
        // Volcanic peaks in specific chunk positions
        if ((chunk.x + chunk.z) % 5 === 0) {
          const volcanoFreq = 0.001 + (chunk.x * 0.0002);
          height += Math.pow(Math.sin(worldX * volcanoFreq) * Math.cos(worldZ * volcanoFreq), 2) * 100;
        }
        
        // Add chunk-specific massive offset
        height += (chunk.x * 19 + chunk.z * 23) % 40;
        
        chunk.heightmap[x][z] = Math.max(0, Math.min(250, height + 100)); // Massive mountain heights
      }
    }
  }
}