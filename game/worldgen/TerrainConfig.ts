import * as fs from 'fs';
import * as yaml from 'yaml';
import { logger } from '../../logging/logger';

export interface NoiseAlgorithm {
  type: string;
  frequency: number;
  amplitude_factor: number;
  octaves?: number;
  power?: number;
  ridged?: boolean;
  absolute?: boolean;
  threshold?: number;
}

export interface BiomeConditions {
  elevation_min?: number;
  elevation_max?: number;
  elevation_range?: [number, number];
  temperature_min?: number;
  temperature_max?: number;
  temperature_range?: [number, number];
  moisture_min?: number;
  moisture_max?: number;
  moisture_range?: [number, number];
  default?: boolean;
}

export interface TerrainTypeConfig {
  name: string;
  description: string;
  height_range: [number, number];
  noise_algorithms: NoiseAlgorithm[];
  biome_conditions: BiomeConditions;
  features: string[];
}

export interface GenerationParameters {
  chunk_variation_strength: number;
  transition_smoothing: number;
  edge_blending_distance: number;
  feature_spawn_chance: number;
  unique_seed_multipliers: number[];
}

export interface TerrainConfiguration {
  terrain_types: Record<string, TerrainTypeConfig>;
  generation_parameters: GenerationParameters;
}

export class TerrainConfigManager {
  private static instance: TerrainConfigManager;
  private config: TerrainConfiguration | null = null;
  private configPath = 'config/terrain-types.yaml';
  private lastModified = 0;

  public static getInstance(): TerrainConfigManager {
    if (!TerrainConfigManager.instance) {
      TerrainConfigManager.instance = new TerrainConfigManager();
    }
    return TerrainConfigManager.instance;
  }

  public getConfig(): TerrainConfiguration {
    this.reloadIfNeeded();
    if (!this.config) {
      throw new Error('Failed to load terrain configuration');
    }
    return this.config;
  }

  public getTerrainType(biomeType: string): TerrainTypeConfig | null {
    const config = this.getConfig();
    return config.terrain_types[biomeType] || null;
  }

  public getAllTerrainTypes(): Record<string, TerrainTypeConfig> {
    const config = this.getConfig();
    return config.terrain_types;
  }

  public getGenerationParameters(): GenerationParameters {
    const config = this.getConfig();
    return config.generation_parameters;
  }

  // Get appropriate chunk size for terrain type and location
  public determineChunkSize(terrainType: string, chunkX: number, chunkZ: number, neighborTypes: string[] = []): number {
    const genParams = this.getGenerationParameters();
    const chunkSizingRules = (genParams as any).chunk_sizing_rules || {};
    const chunkVariants = (genParams as any).chunk_size_variants || [];
    
    // Get rules for this terrain type
    const rules = chunkSizingRules[terrainType] || { preferred_sizes: [64], min_cluster_size: 1 };
    
    // Check if we're part of a cluster (neighboring chunks of same type)
    const sameTypeNeighbors = neighborTypes.filter(type => type === terrainType).length;
    const isInCluster = sameTypeNeighbors >= (rules.min_cluster_size - 1);
    
    // Add some randomness based on chunk coordinates
    const chunkSeed = (chunkX * 73856093 + chunkZ * 19349663) >>> 0;
    const randomFactor = (chunkSeed % 1000) / 1000.0;
    
    // Select appropriate size based on rules and cluster status
    let selectedSize = 64; // Default
    
    if (isInCluster && rules.preferred_sizes.length > 0) {
      // Use larger sizes for clustered terrain
      const largerSizes = rules.preferred_sizes.filter((size: number) => size >= 64);
      if (largerSizes.length > 0) {
        const index = Math.floor(randomFactor * largerSizes.length);
        selectedSize = largerSizes[index];
      }
    } else {
      // Use smaller or medium sizes for isolated chunks
      const smallerSizes = rules.preferred_sizes.filter((size: number) => size <= 128);
      if (smallerSizes.length > 0) {
        const index = Math.floor(randomFactor * smallerSizes.length);
        selectedSize = smallerSizes[index];
      }
    }
    
    return selectedSize;
  }

  // Get scale factor for chunk size
  public getScaleFactor(chunkSize: number): number {
    const genParams = this.getGenerationParameters();
    const chunkVariants = (genParams as any).chunk_size_variants || [];
    
    const variant = chunkVariants.find((v: any) => v.size === chunkSize);
    return variant ? variant.scale_factor : 1.0;
  }

  // Get detail level for chunk size
  public getDetailLevel(chunkSize: number): string {
    const genParams = this.getGenerationParameters();
    const chunkVariants = (genParams as any).chunk_size_variants || [];
    
    const variant = chunkVariants.find((v: any) => v.size === chunkSize);
    return variant ? variant.detail_level : "medium";
  }

  private reloadIfNeeded(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.error('Terrain configuration file not found: ' + this.configPath);
        return;
      }

      const stats = fs.statSync(this.configPath);
      if (stats.mtime.getTime() > this.lastModified) {
        this.loadConfig();
        this.lastModified = stats.mtime.getTime();
        logger.info('Terrain configuration reloaded: ' + this.configPath);
      }
    } catch (error: any) {
      logger.error('Error checking terrain config file: ' + error.message);
    }
  }

  private loadConfig(): void {
    try {
      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      const parsedConfig = yaml.parse(fileContents) as TerrainConfiguration;
      
      this.validateConfig(parsedConfig);
      this.config = parsedConfig;
      
      logger.info(`Terrain configuration loaded successfully: ${Object.keys(parsedConfig.terrain_types).length} terrain types from ${this.configPath}`);
    } catch (error: any) {
      logger.error(`Failed to load terrain configuration from ${this.configPath}: ${error.message}`);
      throw error;
    }
  }

  private validateConfig(config: any): void {
    if (!config.terrain_types || typeof config.terrain_types !== 'object') {
      throw new Error('Invalid terrain configuration: missing terrain_types');
    }

    if (!config.generation_parameters || typeof config.generation_parameters !== 'object') {
      throw new Error('Invalid terrain configuration: missing generation_parameters');
    }

    // Validate each terrain type
    for (const [key, terrainType] of Object.entries(config.terrain_types)) {
      if (!terrainType || typeof terrainType !== 'object') {
        throw new Error(`Invalid terrain type configuration: ${key}`);
      }

      const tt = terrainType as any;
      if (!tt.height_range || !Array.isArray(tt.height_range) || tt.height_range.length !== 2) {
        throw new Error(`Invalid height_range for terrain type: ${key}`);
      }

      if (!tt.noise_algorithms || !Array.isArray(tt.noise_algorithms)) {
        throw new Error(`Invalid noise_algorithms for terrain type: ${key}`);
      }
    }
  }

  public determineTerrainType(elevation: number, temperature: number, moisture: number, chunkVariation: number): string {
    const terrainTypes = this.getAllTerrainTypes();
    
    // Collect all matching terrain types with priority scores
    const candidates: { type: string; priority: number }[] = [];
    
    for (const [key, config] of Object.entries(terrainTypes)) {
      if (this.matchesBiomeConditions(config.biome_conditions, elevation, temperature, moisture, chunkVariation)) {
        // Calculate priority based on how well conditions match
        let priority = 1.0;
        
        // Add randomness based on chunk variation
        priority += (chunkVariation - 0.5) * 0.5;
        
        candidates.push({ type: key, priority });
      }
    }
    
    if (candidates.length === 0) {
      return 'grassland'; // Fallback
    }
    
    // Sort by priority and select the best match with some randomness
    candidates.sort((a, b) => b.priority - a.priority);
    
    // Use chunk variation to sometimes pick second or third choice for diversity
    const index = chunkVariation > 0.8 ? Math.min(1, candidates.length - 1) :
                  chunkVariation > 0.6 ? Math.min(2, candidates.length - 1) : 0;
    
    return candidates[index].type;
  }

  private matchesBiomeConditions(
    conditions: BiomeConditions,
    elevation: number,
    temperature: number,
    moisture: number,
    chunkVariation: number
  ): boolean {
    if (conditions.default) {
      return true; // This is the fallback type
    }

    // Check elevation conditions
    if (conditions.elevation_min !== undefined && elevation < conditions.elevation_min) {
      return false;
    }
    if (conditions.elevation_max !== undefined && elevation > conditions.elevation_max) {
      return false;
    }
    if (conditions.elevation_range) {
      const [min, max] = conditions.elevation_range;
      if (elevation < min || elevation > max) {
        return false;
      }
    }

    // Check temperature conditions
    if (conditions.temperature_min !== undefined && temperature < conditions.temperature_min) {
      return false;
    }
    if (conditions.temperature_max !== undefined && temperature > conditions.temperature_max) {
      return false;
    }
    if (conditions.temperature_range) {
      const [min, max] = conditions.temperature_range;
      if (temperature < min || temperature > max) {
        return false;
      }
    }

    // Check moisture conditions
    if (conditions.moisture_min !== undefined && moisture < conditions.moisture_min) {
      return false;
    }
    if (conditions.moisture_max !== undefined && moisture > conditions.moisture_max) {
      return false;
    }
    if (conditions.moisture_range) {
      const [min, max] = conditions.moisture_range;
      if (moisture < min || moisture > max) {
        return false;
      }
    }

    return true;
  }
}