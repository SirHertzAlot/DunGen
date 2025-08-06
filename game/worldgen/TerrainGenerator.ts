import { readFileSync } from 'fs';
import * as yaml from 'yaml';
import { logger } from '../../logging/logger';
import { v4 as uuidv4 } from 'uuid';
import { WorldMap } from './WorldMap.js';

// Simple noise implementation for terrain generation
class SimpleNoise {
  private seed: number;
  private permutation: number[];

  constructor(seed: string | number) {
    this.seed = typeof seed === 'string' ? this.stringToSeed(seed) : seed;
    this.permutation = this.generatePermutation();
  }

  private stringToSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generatePermutation(): number[] {
    const p = [];
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Fisher-Yates shuffle with seed
    let rng = this.seed;
    for (let i = 255; i > 0; i--) {
      rng = (rng * 9301 + 49297) % 233280;
      const j = Math.floor((rng / 233280) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    
    // Duplicate for easier indexing
    for (let i = 0; i < 256; i++) {
      p[256 + i] = p[i];
    }
    
    return p;
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const A = this.permutation[X] + Y;
    const AA = this.permutation[A];
    const AB = this.permutation[A + 1];
    const B = this.permutation[X + 1] + Y;
    const BA = this.permutation[B];
    const BB = this.permutation[B + 1];
    
    return this.lerp(
      this.lerp(
        this.grad(this.permutation[AA], x, y),
        this.grad(this.permutation[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.permutation[AB], x, y - 1),
        this.grad(this.permutation[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }
}

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
  private config: WorldGenConfig;
  private noiseGenerators: Map<string, SimpleNoise> = new Map();
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
    const seed = this.config.world.seed;
    
    // Create different noise generators for different purposes
    this.noiseGenerators.set('base_terrain', new SimpleNoise(`base_${seed}`));
    this.noiseGenerators.set('mountains', new SimpleNoise(`mountain_${seed}`));
    this.noiseGenerators.set('valleys', new SimpleNoise(`valley_${seed}`));
    this.noiseGenerators.set('temperature', new SimpleNoise(`temp_${seed}`));
    this.noiseGenerators.set('humidity', new SimpleNoise(`humid_${seed}`));
    this.noiseGenerators.set('features', new SimpleNoise(`features_${seed}`));

    logger.info('Noise generators initialized', {
      service: 'TerrainGenerator',
      generators: Array.from(this.noiseGenerators.keys())
    });
  }

  // Generate or retrieve a terrain chunk
  public async getChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    // Check cache first
    if (this.chunkCache.has(chunkKey)) {
      const chunk = this.chunkCache.get(chunkKey)!;
      chunk.lastAccessed = Date.now();
      return chunk;
    }

    // Check if already generating
    if (this.generationQueue.has(chunkKey)) {
      // Wait for generation to complete
      while (this.generationQueue.has(chunkKey)) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return this.chunkCache.get(chunkKey)!;
    }

    // Generate new chunk
    this.generationQueue.add(chunkKey);
    const chunk = await this.generateChunk(chunkX, chunkZ);
    this.generationQueue.delete(chunkKey);

    // Add to cache
    this.chunkCache.set(chunkKey, chunk);
    this.manageCacheSize();

    return chunk;
  }

  private async generateChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const startTime = Date.now();
    const size = this.config.world.chunk_size;
    
    // Use new world map system for realistic terrain generation
    const worldChunk = this.worldMap.generateChunk(chunkX, chunkZ);
    
    const chunk: TerrainChunk = {
      id: uuidv4(),
      x: chunkX,
      z: chunkZ,
      size,
      heightmap: worldChunk.heightmap as any, // New system provides flat array
      biomes: [{ type: worldChunk.biome.type, coverage: 1.0 }],
      features: [],
      generated: false,
      lastAccessed: Date.now()
    };

    // Skip the old generation pipeline since we have the new world map data
    // await this.runGenerationPipeline(chunk);

    chunk.generated = true;
    
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
    const noise = this.noiseGenerators.get('base_terrain')!;
    const { octaves, frequency, amplitude, lacunarity, persistence } = config;

    for (let x = 0; x < chunk.size; x++) {
      for (let z = 0; z < chunk.size; z++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;

        let height = 0;
        let currentAmplitude = amplitude;
        let currentFrequency = frequency;

        // Multi-octave noise
        for (let octave = 0; octave < octaves; octave++) {
          height += noise.noise2D(worldX * currentFrequency, worldZ * currentFrequency) * currentAmplitude;
          currentAmplitude *= persistence;
          currentFrequency *= lacunarity;
        }

        // Normalize and apply sea level
        height = Math.max(0, height + this.config.world.sea_level);
        chunk.heightmap[x][z] = height;
      }
    }
  }

  private async applyHeightmapLayer(chunk: TerrainChunk, config: any): Promise<void> {
    const noiseType = config.algorithm === 'ridged_noise' ? 'mountains' : 'valleys';
    const noise = this.noiseGenerators.get(noiseType)!;
    const { octaves, frequency, amplitude, blend_mode, mask_threshold } = config;

    for (let x = 0; x < chunk.size; x++) {
      for (let z = 0; z < chunk.size; z++) {
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;

        let layerHeight = 0;
        let currentAmplitude = amplitude;
        let currentFrequency = frequency;

        for (let octave = 0; octave < octaves; octave++) {
          let noiseValue = noise.noise2D(worldX * currentFrequency, worldZ * currentFrequency);
          
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
          const maskNoise = noise.noise2D(worldX * 0.01, worldZ * 0.01);
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
        const temperature = tempNoise.noise2D(worldX * config.temperature_frequency, worldZ * config.temperature_frequency);
        const humidity = humidNoise.noise2D(worldX * config.humidity_frequency, worldZ * config.humidity_frequency);

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
    const featureNoise = this.noiseGenerators.get('features')!;

    for (const featureConfig of config.features) {
      const density = featureConfig.density;
      const placementAttempts = Math.floor(chunk.size * chunk.size * density);

      for (let attempt = 0; attempt < placementAttempts; attempt++) {
        const x = Math.floor(Math.random() * chunk.size);
        const z = Math.floor(Math.random() * chunk.size);
        const height = chunk.heightmap[x][z];
        const biome = chunk.biomes[x][z];

        // Check biome preference
        if (featureConfig.biome_preference && 
            !featureConfig.biome_preference.includes('any') &&
            !featureConfig.biome_preference.includes(biome.name)) {
          continue;
        }

        // Check height range
        const [minHeight, maxHeight] = featureConfig.height_range;
        if (height < minHeight || height > maxHeight) {
          continue;
        }

        // Use noise for more natural distribution
        const worldX = chunk.x * chunk.size + x;
        const worldZ = chunk.z * chunk.size + z;
        const noiseValue = featureNoise.noise2D(worldX * 0.05, worldZ * 0.05);
        
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
}