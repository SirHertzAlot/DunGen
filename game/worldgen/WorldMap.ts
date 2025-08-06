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

    if (mountainRange > 0.8 || elevation > 0.85) { // Higher threshold for sparser mountains
      biomeType = 'mountain';
      heightScale = 120; // Even more massive mountain ranges
      noiseScale = 0.02; // Lower frequency for larger, more spread out features
    } else if (elevation < 0.2) {
      if (moisture > 0.6) {
        biomeType = temperature > 0.4 ? 'swamp' : 'bog';
        heightScale = 3; // Subtle wetland variation
        noiseScale = 0.25;
      } else {
        biomeType = 'marsh';
        heightScale = 2; // Small marsh features
        noiseScale = 0.3;
      }
    } else if (elevation > 0.6) {
      if (moisture < 0.3) {
        biomeType = 'desert';
        heightScale = 15; // Larger desert dunes and rocky outcrops
        noiseScale = 0.06;
      } else if (moisture > 0.7) {
        biomeType = 'forest';
        heightScale = 20; // Rolling forested hills
        noiseScale = 0.1;
      }
    } else if (temperature < 0.3) {
      biomeType = 'tundra';
      heightScale = 12; // Larger tundra features
      noiseScale = 0.12;
    } else if (moisture > 0.6) {
      biomeType = 'forest';
      heightScale = 18; // Varied forest terrain
      noiseScale = 0.08;
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
        
        // Enhanced multi-octave noise with progressive smoothing for realistic large-scale terrain
        let height = 0;
        let amplitude = 1.0;
        let frequency = biome.noiseScale * 0.3; // Start with larger-scale features
        const persistence = 0.65; // How much each octave contributes (higher = more detail retention)
        const lacunarity = 2.1; // How much frequency increases each octave
        const chunkSeed = this.hashChunkCoords(chunkX, chunkZ);
        
        // Octave 1: Continental/regional structure (massive mountains, deep valleys)
        height += this.elevationNoise(worldX * frequency, worldZ * frequency) * amplitude * 100;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 2: Large terrain features (mountain ranges, large valleys)
        height += this.mountainRangeNoise(worldX * frequency, worldZ * frequency) * amplitude * 60;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 3: Local mountain systems and hills
        height += this.elevationNoise(worldX * frequency + chunkSeed, worldZ * frequency + chunkSeed) * amplitude * 35;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 4: Ridges and local terrain variation
        height += this.detailNoise(worldX * frequency, worldZ * frequency) * amplitude * 20;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 5: Surface variation and local features
        height += this.detailNoise(worldX * frequency * 1.3, worldZ * frequency * 0.8) * amplitude * 12;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 6: Fine surface detail
        height += this.temperatureNoise(worldX * frequency, worldZ * frequency) * amplitude * 6;
        amplitude *= persistence;
        frequency *= lacunarity;
        
        // Octave 7: Micro surface roughness
        height += this.moistureNoise(worldX * frequency, worldZ * frequency) * amplitude * 3;
        
        // Apply terrain-type specific scaling with better mountain distribution
        const continentalShape = this.elevationNoise(worldX * 0.0001, worldZ * 0.0001); // Larger scale for sparser mountains
        const mountainRidge = this.mountainRangeNoise(worldX * 0.0003, worldZ * 0.0003);
        
        // Create sparse mountain ranges with gradual, traversable slopes for AI pathfinding
        const mountainThreshold = 0.7; // Higher threshold = fewer mountains with better spacing
        if (biome.type === 'mountain' || (continentalShape > mountainThreshold && mountainRidge > 0.6)) {
          const mountainFactor = Math.pow(Math.max(0, continentalShape - mountainThreshold), 1.5); // Gentler power for gradual slopes
          const ridgeFactor = Math.pow(Math.max(0, mountainRidge - 0.6), 1.2);
          
          // Create moderate elevation changes with gradual, passable slopes
          const gentleSlope = 0.5 + (mountainFactor * 0.3); // Much gentler slope multiplier
          height += mountainFactor * ridgeFactor * 60 * gentleSlope; // Moderate mountains with gradual slopes
        }
        
        // Create gentle valleys between mountain ranges  
        if (continentalShape < -0.3 && mountainRidge < 0.2) {
          const valleyFactor = Math.pow(Math.abs(continentalShape + 0.3), 1.8);
          height -= valleyFactor * 30; // Gentle valleys that are still traversable
        }
        
        // Add slope steepness modifier based on elevation change
        const slopeModifier = this.calculateSlopeModifier(worldX, worldZ, height, biome);
        height = height * slopeModifier;
        
        // Progressive smoothing for realistic terrain
        height = this.applySmoothingFilter(height, worldX, worldZ, biome);
        
        // Apply high-quality detail enhancement for realistic heightmaps
        height = this.enhanceHeightmapQuality(worldX, worldZ, height, biome);
        
        // Apply biome-specific base height and scaling
        height = height + biome.elevation * 15 + (biome.heightScale * 2);

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
    
    // Generate height using same enhanced algorithm for consistency
    let height = 0;
    let amplitude = 1.0;
    let frequency = biome.noiseScale * 0.3;
    const persistence = 0.65;
    const lacunarity = 2.1;
    const chunkSeed = this.hashChunkCoords(chunkX, chunkZ);
    
    // Apply same octave pattern as main generation
    height += this.elevationNoise(worldX * frequency, worldZ * frequency) * amplitude * 100;
    amplitude *= persistence;
    frequency *= lacunarity;
    
    height += this.mountainRangeNoise(worldX * frequency, worldZ * frequency) * amplitude * 60;
    amplitude *= persistence;
    frequency *= lacunarity;
    
    height += this.elevationNoise(worldX * frequency + chunkSeed, worldZ * frequency + chunkSeed) * amplitude * 35;
    
    // Apply terrain scaling
    const continentalShape = this.elevationNoise(worldX * 0.0002, worldZ * 0.0002);
    if (biome.type === 'mountain' || continentalShape > 0.4) {
      height += Math.pow(Math.max(0, continentalShape), 2) * 200;
    }
    
    return height + biome.elevation * 15 + (biome.heightScale * 2);
  }

  private hashChunkCoords(x: number, z: number): number {
    // Simple hash function for chunk coordinates to ensure unique seeds per chunk
    let hash = 0;
    const str = `${x},${z}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  private applySmoothingFilter(height: number, worldX: number, worldZ: number, biome: BiomeType): number {
    // Apply terrain-specific smoothing - MORE smoothing for mountains to create gradual slopes
    const baseSmoothingStrength = biome.type === 'mountain' ? 0.25 : 0.15; // More smoothing for mountains for AI traversal
    
    // Sample nearby points for smoothing (simplified neighborhood sampling)
    const sampleRadius = biome.type === 'mountain' ? 1 : 2; // Smaller radius for mountains
    let smoothedHeight = height;
    let sampleCount = 1;
    
    for (let dx = -sampleRadius; dx <= sampleRadius; dx += sampleRadius) {
      for (let dz = -sampleRadius; dz <= sampleRadius; dz += sampleRadius) {
        if (dx === 0 && dz === 0) continue;
        
        const sampleX = worldX + dx;
        const sampleZ = worldZ + dz;
        
        // Sample basic elevation at nearby points
        const nearbyHeight = this.elevationNoise(sampleX * biome.noiseScale, sampleZ * biome.noiseScale) * biome.heightScale;
        smoothedHeight += nearbyHeight;
        sampleCount++;
      }
    }
    
    const avgNearby = smoothedHeight / sampleCount;
    
    // Blend original height with smoothed version (less blending for steep terrain)
    return height * (1 - baseSmoothingStrength) + avgNearby * baseSmoothingStrength;
  }
  
  private calculateSlopeModifier(worldX: number, worldZ: number, currentHeight: number, biome: BiomeType): number {
    // Calculate slope gradualness to ensure AI can traverse terrain
    const sampleDistance = 6; // Larger sample distance for smoother gradients
    const neighbors = [
      this.elevationNoise((worldX + sampleDistance) * biome.noiseScale, worldZ * biome.noiseScale),
      this.elevationNoise((worldX - sampleDistance) * biome.noiseScale, worldZ * biome.noiseScale),
      this.elevationNoise(worldX * biome.noiseScale, (worldZ + sampleDistance) * biome.noiseScale),
      this.elevationNoise(worldX * biome.noiseScale, (worldZ - sampleDistance) * biome.noiseScale)
    ];
    
    // Calculate elevation change
    const maxElevationChange = Math.max(...neighbors.map(n => Math.abs(n * biome.heightScale - currentHeight)));
    
    // For mountains, reduce steep areas to make them more gradual and traversable
    if (biome.type === 'mountain' && maxElevationChange > 10) {
      return 0.7 - (maxElevationChange / 100); // Reduce steepness for better pathfinding
    }
    
    return 1.0; // No modification for other terrain types
  }
  
  private enhanceHeightmapQuality(worldX: number, worldZ: number, height: number, biome: BiomeType): number {
    // Apply high-quality detail enhancement similar to the reference heightmap
    
    // Add micro-detail at multiple scales for realistic surface texture
    const microDetail1 = this.detailNoise(worldX * 0.5, worldZ * 0.5) * 0.8;
    const microDetail2 = this.detailNoise(worldX * 1.2, worldZ * 1.2) * 0.4; 
    const microDetail3 = this.detailNoise(worldX * 2.8, worldZ * 2.8) * 0.2;
    
    // Combine micro details with smoothing for natural appearance
    const combinedDetail = (microDetail1 + microDetail2 + microDetail3) / 3;
    
    // Apply detail enhancement based on terrain type
    let detailStrength = 0.3; // Default detail level
    
    if (biome.type === 'mountain') {
      detailStrength = 0.6; // More detail for mountains
    } else if (biome.type === 'desert') {
      detailStrength = 0.4; // Moderate detail for dunes
    } else if (biome.type === 'grassland' || biome.type === 'forest') {
      detailStrength = 0.25; // Subtle detail for smoother terrain
    }
    
    // Apply gradient smoothing for natural transitions like in the reference
    const gradientFactor = this.calculateGradientSmoothness(worldX, worldZ, biome);
    
    // Enhanced height with quality details
    return height + (combinedDetail * detailStrength * gradientFactor);
  }
  
  private calculateGradientSmoothness(worldX: number, worldZ: number, biome: BiomeType): number {
    // Calculate smooth gradients similar to the high-quality reference heightmap
    const gradient1 = this.elevationNoise(worldX * 0.02, worldZ * 0.02);
    const gradient2 = this.moistureNoise(worldX * 0.015, worldZ * 0.015);
    
    // Create smooth gradient transitions
    const combinedGradient = (gradient1 + gradient2) / 2;
    
    // Apply smooth falloff for natural appearance
    return Math.pow(Math.abs(combinedGradient), 0.7); // Smooth power curve for natural gradients
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