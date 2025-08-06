import { NoiseFunction2D, createNoise2D } from 'simplex-noise';

export interface BiomeType {
  type: 'grassland' | 'forest' | 'desert' | 'mountain' | 'swamp' | 'tundra' | 'ocean' | 'marsh' | 'bog' | 'cave';
  elevation: number;
  moisture: number;
  temperature: number;
  noiseScale: number;
  heightScale: number;
}

export interface WorldChunk {
  x: number;
  z: number;
  biome: BiomeType;
  heightmap: number[];
  edgeHeights: {
    north: number[];
    south: number[];
    east: number[];
    west: number[];
  };
}

export class WorldMap {
  private elevationNoise: NoiseFunction2D;
  private moistureNoise: NoiseFunction2D;
  private temperatureNoise: NoiseFunction2D;
  private mountainRangeNoise: NoiseFunction2D;
  private detailNoise: NoiseFunction2D;
  
  private chunkCache = new Map<string, WorldChunk>();
  private biomeMap = new Map<string, BiomeType>();
  
  constructor() {
    this.elevationNoise = createNoise2D();
    this.moistureNoise = createNoise2D();
    this.temperatureNoise = createNoise2D();
    this.mountainRangeNoise = createNoise2D();
    this.detailNoise = createNoise2D();
  }

  private getBiomeKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private generateBiome(chunkX: number, chunkZ: number): BiomeType {
    const scale = 0.01; // Large-scale features
    const x = chunkX * scale;
    const z = chunkZ * scale;

    // Generate base terrain features
    const elevation = (this.elevationNoise(x, z) + 1) / 2;
    const moisture = (this.moistureNoise(x * 1.5, z * 1.5) + 1) / 2;
    const temperature = (this.temperatureNoise(x * 0.8, z * 0.8) + 1) / 2;
    const mountainRange = (this.mountainRangeNoise(x * 0.3, z * 0.3) + 1) / 2;

    // Determine biome based on elevation, moisture, and temperature
    let biomeType: BiomeType['type'] = 'grassland';
    let heightScale = 5;
    let noiseScale = 0.1;

    if (mountainRange > 0.7 || elevation > 0.75) {
      biomeType = 'mountain';
      heightScale = 30;
      noiseScale = 0.05;
    } else if (elevation < 0.2) {
      if (moisture > 0.6) {
        biomeType = temperature > 0.4 ? 'swamp' : 'bog';
        heightScale = 2;
        noiseScale = 0.2;
      } else {
        biomeType = 'marsh';
        heightScale = 1;
        noiseScale = 0.3;
      }
    } else if (elevation > 0.6) {
      if (moisture < 0.3) {
        biomeType = 'desert';
        heightScale = 8;
        noiseScale = 0.08;
      } else if (moisture > 0.7) {
        biomeType = 'forest';
        heightScale = 12;
        noiseScale = 0.12;
      }
    } else if (temperature < 0.3) {
      biomeType = 'tundra';
      heightScale = 6;
      noiseScale = 0.15;
    } else if (moisture > 0.6) {
      biomeType = 'forest';
      heightScale = 10;
      noiseScale = 0.1;
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

  private generateHeightmapWithSeamlessEdges(chunkX: number, chunkZ: number, biome: BiomeType, chunkSize: number = 64): WorldChunk {
    const heightmap: number[] = new Array(chunkSize * chunkSize);
    
    // Get neighboring chunk biomes for edge blending
    const neighbors = {
      north: this.getBiomeForChunk(chunkX, chunkZ + 1),
      south: this.getBiomeForChunk(chunkX, chunkZ - 1),
      east: this.getBiomeForChunk(chunkX + 1, chunkZ),
      west: this.getBiomeForChunk(chunkX - 1, chunkZ)
    };

    // Generate base heightmap
    for (let z = 0; z < chunkSize; z++) {
      for (let x = 0; x < chunkSize; x++) {
        const worldX = chunkX * chunkSize + x;
        const worldZ = chunkZ * chunkSize + z;
        
        // Multi-octave noise for varied terrain
        let height = 0;
        let amplitude = 1;
        let frequency = biome.noiseScale;
        
        // Base terrain
        height += this.elevationNoise(worldX * frequency, worldZ * frequency) * amplitude;
        
        // Add detail layers
        amplitude *= 0.5;
        frequency *= 2;
        height += this.detailNoise(worldX * frequency, worldZ * frequency) * amplitude;
        
        amplitude *= 0.5;
        frequency *= 2;
        height += this.detailNoise(worldX * frequency * 1.3, worldZ * frequency * 0.7) * amplitude;

        // Apply biome-specific height scaling
        height = height * biome.heightScale + biome.elevation * 10;

        // Edge blending for seamless transitions
        const edgeBlendFactor = 0.1; // 10% of chunk size for blending
        const blendZone = Math.floor(chunkSize * edgeBlendFactor);
        
        if (x < blendZone || x >= chunkSize - blendZone || z < blendZone || z >= chunkSize - blendZone) {
          let blendWeight = 1.0;
          let neighborHeight = height;
          
          // Blend with appropriate neighbor
          if (x < blendZone && neighbors.west) {
            const blend = (blendZone - x) / blendZone;
            neighborHeight = this.sampleNeighborHeight(chunkX - 1, chunkZ, chunkSize - 1 - (blendZone - x), z, neighbors.west);
            blendWeight = 1 - blend;
          } else if (x >= chunkSize - blendZone && neighbors.east) {
            const blend = (x - (chunkSize - blendZone)) / blendZone;
            neighborHeight = this.sampleNeighborHeight(chunkX + 1, chunkZ, x - (chunkSize - blendZone), z, neighbors.east);
            blendWeight = 1 - blend;
          }
          
          if (z < blendZone && neighbors.south) {
            const blend = (blendZone - z) / blendZone;
            neighborHeight = this.sampleNeighborHeight(chunkX, chunkZ - 1, x, chunkSize - 1 - (blendZone - z), neighbors.south);
            blendWeight = Math.min(blendWeight, 1 - blend);
          } else if (z >= chunkSize - blendZone && neighbors.north) {
            const blend = (z - (chunkSize - blendZone)) / blendZone;
            neighborHeight = this.sampleNeighborHeight(chunkX, chunkZ + 1, x, z - (chunkSize - blendZone), neighbors.north);
            blendWeight = Math.min(blendWeight, 1 - blend);
          }
          
          height = height * blendWeight + neighborHeight * (1 - blendWeight);
        }

        heightmap[z * chunkSize + x] = Math.max(0, height);
      }
    }

    // Extract edge heights for future seamless blending
    const edgeHeights = {
      north: heightmap.slice((chunkSize - 1) * chunkSize, chunkSize * chunkSize),
      south: heightmap.slice(0, chunkSize),
      east: [],
      west: []
    };

    for (let z = 0; z < chunkSize; z++) {
      edgeHeights.east.push(heightmap[z * chunkSize + (chunkSize - 1)]);
      edgeHeights.west.push(heightmap[z * chunkSize + 0]);
    }

    return {
      x: chunkX,
      z: chunkZ,
      biome,
      heightmap,
      edgeHeights
    };
  }

  private sampleNeighborHeight(chunkX: number, chunkZ: number, localX: number, localZ: number, biome: BiomeType): number {
    const worldX = chunkX * 64 + localX;
    const worldZ = chunkZ * 64 + localZ;
    
    // Generate height using the same algorithm
    let height = 0;
    let amplitude = 1;
    let frequency = biome.noiseScale;
    
    height += this.elevationNoise(worldX * frequency, worldZ * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
    height += this.detailNoise(worldX * frequency, worldZ * frequency) * amplitude;
    
    return height * biome.heightScale + biome.elevation * 10;
  }

  public getBiomeForChunk(chunkX: number, chunkZ: number): BiomeType {
    const key = this.getBiomeKey(chunkX, chunkZ);
    
    if (!this.biomeMap.has(key)) {
      const biome = this.generateBiome(chunkX, chunkZ);
      this.biomeMap.set(key, biome);
    }
    
    return this.biomeMap.get(key)!;
  }

  public generateChunk(chunkX: number, chunkZ: number): WorldChunk {
    const key = this.getBiomeKey(chunkX, chunkZ);
    
    if (this.chunkCache.has(key)) {
      return this.chunkCache.get(key)!;
    }

    const biome = this.getBiomeForChunk(chunkX, chunkZ);
    const chunk = this.generateHeightmapWithSeamlessEdges(chunkX, chunkZ, biome);
    
    this.chunkCache.set(key, chunk);
    return chunk;
  }

  public getWorldOverview(centerX: number, centerZ: number, radius: number): Array<{x: number, z: number, biome: string}> {
    const overview: Array<{x: number, z: number, biome: string}> = [];
    
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        const biome = this.getBiomeForChunk(x, z);
        overview.push({ x, z, biome: biome.type });
      }
    }
    
    return overview;
  }
}