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
    // Use multiple prime numbers and world position to ensure no repeating patterns
    const prime1 = 73856093;
    const prime2 = 19349663;
    const prime3 = 83492791;
    const prime4 = 11400714819;
    
    const seed = this.config.world.seed || 12345;
    
    // Create unique hash using chunk world coordinates and multiple primes
    let hash = seed;
    hash ^= (chunkX * prime1);
    hash ^= (chunkZ * prime2);  
    hash ^= ((chunkX + chunkZ) * prime3);
    hash ^= ((chunkX * chunkZ) * prime4);
    
    // Add current timestamp component for extra uniqueness during development
    hash ^= (Date.now() % 100000);
    
    return Math.abs(hash) % 2147483647;
  }

  private async generateChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const startTime = Date.now();
    const size = this.config.world.chunk_size;
    
    // Use THREE.Terrain for professional terrain generation
    const chunkSeed = this.hashChunkCoords(chunkX, chunkZ);
    
    // Create terrain options with unique seed for each chunk
    const options = {
      ...this.terrainOptions,
      seed: chunkSeed,
    };
    
    // Generate terrain using THREE.Terrain
    const terrainGeometry = Terrain(options);
    const vertices = terrainGeometry.attributes.position.array;
    
    // Convert THREE.js vertices to 2D heightmap
    const heightmap: number[][] = [];
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const index = z * size + x;
        const height = vertices[index * 3 + 1]; // Y component is height
        heightmap[z][x] = Math.max(0, Math.min(80, height)); // Clamp to 0-80 range
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
    // Use three-terrain library to generate unique massive mountain terrain
    const chunkSeed = this.hashChunkCoords(chunk.x, chunk.z);
    
    // Create geometry for mountain generation using three-terrain
    const geometry = new THREE.PlaneGeometry(chunk.size, chunk.size, chunk.size - 1, chunk.size - 1);
    
    // Apply multiple three-terrain algorithms with different seeds for unique results
    // First layer: Mountain ridges with unique seed
    Terrain.Mountain(geometry, {
      seed: chunkSeed,
      frequency: 0.003 + (chunk.x * 0.0001) + (chunk.z * 0.0001), // Vary frequency by position
      maxHeight: 180 + (Math.abs(chunk.x + chunk.z) % 50),         // Vary height by position
      minHeight: 0,
      stretch: true
    });
    
    // Second layer: Alpine peaks with different seed and parameters
    Terrain.DiamondSquare(geometry, {
      seed: chunkSeed + 7919, // Different prime offset
      frequency: 0.008 + (chunk.z * 0.0002),
      maxHeight: 120 + (Math.abs(chunk.x * chunk.z) % 40),
      minHeight: 0
    });
    
    // Third layer: Add volcanic peaks for variety based on chunk position
    if ((chunk.x + chunk.z) % 3 === 0) {
      Terrain.Fault(geometry, {
        seed: chunkSeed + 31337,
        iterations: 4 + (Math.abs(chunk.x) % 3),
        maxHeight: 100,
        minHeight: 0
      });
    }
    
    // Extract heightmap from the generated geometry
    const vertices = geometry.attributes.position.array;
    
    for (let z = 0; z < chunk.size; z++) {
      for (let x = 0; x < chunk.size; x++) {
        const index = z * chunk.size + x;
        const height = vertices[index * 3 + 1]; // Y component from three.js geometry
        chunk.heightmap[x][z] = Math.max(0, height);
      }
    }
  }
}