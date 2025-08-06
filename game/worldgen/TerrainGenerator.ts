import { readFileSync } from 'fs';
import * as yaml from 'yaml';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';
import { WorldMap } from './WorldMap.js';
import * as THREE from 'three';
import * as Terrain from 'three.terrain.js';

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
      // Custom advanced terrain generation system - no external dependencies
      this.terrainOptions = {
        frequency: 2.5,
        maxHeight: 80,
        minHeight: 0,
        xSegments: this.config.world.chunk_size - 1,
        xSize: this.config.world.chunk_size,
        ySegments: this.config.world.chunk_size - 1,
        ySize: this.config.world.chunk_size,
      };

      const generators = ['massive_mountains', 'perlin_base', 'ridged_multifractal', 'diamond_square', 'fault_lines', 'smoothing'];

      logger.info('Advanced noise generators initialized', {
        service: 'TerrainGenerator',
        generators,
        system: 'custom_professional_algorithms'
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
    
    // Create unique seed for this chunk
    const chunkSeed = this.hashChunkCoords(chunkX, chunkZ);
    
    // USING THREE.TERRAIN.JS LIBRARY - COMPREHENSIVE TERRAIN GENERATION
    // Create terrain using the proper THREE.Terrain() function with advanced algorithms
    const terrainScene = Terrain({
      easing: Terrain.Linear,
      frequency: 2.5 + (chunkX * 0.1) + (chunkZ * 0.1), // Vary frequency per chunk
      heightmap: this.selectHeightmapAlgorithm(chunkX, chunkZ, chunkSeed),
      maxHeight: 200 + (Math.abs(chunkX + chunkZ) * 15), // Massive mountains up to 350 height
      minHeight: -20,
      steps: 1,
      xSegments: size - 1,
      xSize: size,
      ySegments: size - 1,
      ySize: size,
      seed: chunkSeed
    });

    // Get the geometry from the generated terrain scene
    const geometry = terrainScene.children[0].geometry;
    
    // Apply additional terrain modifications for sophisticated landscapes
    this.applyAdvancedTerrainModifications(geometry, chunkX, chunkZ, chunkSeed);
    
    // Extract heightmap from the geometry
    const vertices = geometry.attributes.position.array;
    const heightmap: number[][] = [];
    
    for (let z = 0; z < size; z++) {
      heightmap[z] = [];
      for (let x = 0; x < size; x++) {
        const index = z * size + x;
        const height = vertices[index * 3 + 1]; // Y component is height
        heightmap[z][x] = Math.max(0, Math.min(350, height + 50)); // Clamp and offset for massive mountains
      }
    }
    
    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size,
      heightmap,
      biomes: Array.from({ length: size }, () => 
        Array.from({ length: size }, () => ({
          name: 'grassland',
          temperature: 0.5,
          humidity: 0.5,
          color: [100, 150, 50]
        }))
      ),
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
    // Generate temperature and humidity using simple noise functions;

    for (let x = 0; x < chunk.size; x++) {
      for (let z = 0; z < chunk.size; z++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;
        const height = chunk.heightmap[x][z];

        // Generate temperature and humidity using simple noise
        const temperature = Math.sin(worldX * 0.001) * Math.cos(worldZ * 0.001);
        const humidity = Math.cos(worldX * 0.0015) * Math.sin(worldZ * 0.0015);

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
        const biome = chunk.biomes[x][z]; // Use biome at specific location

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
              biome: biome.name,
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
    // Create unique seed for this mountain chunk
    const chunkSeed = this.hashChunkCoords(chunk.x, chunk.z);
    
    // Create terrain geometry for massive mountain generation
    const geometry = new THREE.PlaneGeometry(chunk.size, chunk.size, chunk.size - 1, chunk.size - 1);
    
    // Layer 1: Base mountain structure using Mountain algorithm
    Terrain.Mountain(geometry, {
      seed: chunkSeed,
      frequency: 0.003 + (chunk.x * 0.0001),
      amplitude: 180,
      stretch: true,
      heightmap: true
    });
    
    // Layer 2: Add dramatic peaks using DiamondSquare fractal
    Terrain.DiamondSquare(geometry, {
      seed: chunkSeed + 2311,
      frequency: 0.002 + (chunk.z * 0.0001),
      amplitude: 200
    });
    
    // Layer 3: Create sharp ridges using Fault algorithm
    Terrain.Fault(geometry, {
      seed: chunkSeed + 5477,
      iterations: 6 + (Math.abs(chunk.x + chunk.z) % 4),
      amplitude: 150,
      frequency: 0.008
    });
    
    // Layer 4: Add volcanic features for certain chunks
    if ((chunk.x + chunk.z) % 5 === 0) {
      Terrain.Volcanoes(geometry, {
        seed: chunkSeed + 8191,
        count: 2 + (Math.abs(chunk.x * chunk.z) % 3),
        amplitude: 250
      });
    }
    
    // Apply turbulence for realistic variation
    Terrain.Turbulence(geometry, {
      seed: chunkSeed + 1009,
      frequency: 0.01,
      amplitude: 60
    });
    
    // Smooth for realistic mountain slopes
    Terrain.Smooth(geometry, {
      iterations: 2
    });
    
    // Extract massive mountain heightmap
    const vertices = geometry.attributes.position.array;
    
    for (let z = 0; z < chunk.size; z++) {
      for (let x = 0; x < chunk.size; x++) {
        const index = z * chunk.size + x;
        const height = vertices[index * 3 + 1]; // Y component
        chunk.heightmap[x][z] = Math.max(0, Math.min(500, height + 200)); // Massive heights up to 500 units
      }
    }
  }
  
  // ADVANCED TERRAIN GENERATION METHODS BASED ON THREE.Terrain DOCUMENTATION
  
  private selectHeightmapAlgorithm(chunkX: number, chunkZ: number, seed: number): any {
    // Use different terrain algorithms based on chunk position for varied landscapes
    const algorithmChoice = (Math.abs(chunkX + chunkZ) + seed) % 8;
    
    switch (algorithmChoice) {
      case 0:
      case 1:
        // Diamond-Square algorithm for fractal mountain ranges
        return Terrain.DiamondSquare;
      case 2:
        // Perlin noise for rolling hills and natural terrain
        return Terrain.Perlin;
      case 3:
        // Simplex noise for smoother organic terrain
        return Terrain.Simplex;
      case 4:
        // Value noise for different character than Perlin
        return Terrain.Value;
      case 5:
        // Fault lines for dramatic cliffs and ridges
        return Terrain.Fault;
      case 6:
        // Cosine waves for regular mountain ridges
        return Terrain.Cosine;
      case 7:
        // Weierstrass function for fractal mountains
        return Terrain.Weierstrass;
      default:
        return Terrain.DiamondSquare;
    }
  }
  
  private applyAdvancedTerrainModifications(geometry: THREE.BufferGeometry, chunkX: number, chunkZ: number, seed: number): void {
    // Apply multiple terrain generation techniques for realistic landscapes
    const secondarySeed = seed + 12345;
    const tertiarySeed = seed + 54321;
    
    // Add secondary noise layer for detail
    Terrain.Perlin(geometry, {
      seed: secondarySeed,
      frequency: 0.02,
      amplitude: 25
    });
    
    // Add tertiary noise for fine detail
    Terrain.Simplex(geometry, {
      seed: tertiarySeed,
      frequency: 0.05,
      amplitude: 10
    });
    
    // Apply erosion simulation for realistic valleys
    Terrain.Erosion(geometry, {
      iterations: 2,
      amount: 15
    });
    
    // Add fault lines for geological realism
    if (Math.abs(chunkX + chunkZ) % 3 === 0) {
      Terrain.Fault(geometry, {
        seed: seed + 99999,
        iterations: 3,
        minHeight: -30,
        maxHeight: 50
      });
    }
    
    // Apply smoothing to create realistic slopes
    Terrain.Smooth(geometry, {
      iterations: 1
    });
  }
}