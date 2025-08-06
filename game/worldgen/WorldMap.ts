import FastNoiseLite from 'fastnoiselite';

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
  private elevationNoise: FastNoiseLite;
  private moistureNoise: FastNoiseLite;
  private temperatureNoise: FastNoiseLite;
  private mountainRangeNoise: FastNoiseLite;
  private detailNoise: FastNoiseLite;
  
  private chunkCache = new Map<string, WorldChunk>();
  private biomeMap = new Map<string, BiomeType>();
  
  constructor() {
    // Initialize FastNoiseLite with different seeds for varied patterns
    this.elevationNoise = new FastNoiseLite(1234);
    this.elevationNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
    this.elevationNoise.SetFrequency(0.01);

    this.moistureNoise = new FastNoiseLite(5678);
    this.moistureNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
    this.moistureNoise.SetFrequency(0.015);

    this.temperatureNoise = new FastNoiseLite(9012);
    this.temperatureNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
    this.temperatureNoise.SetFrequency(0.008);

    this.mountainRangeNoise = new FastNoiseLite(3456);
    this.mountainRangeNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
    this.mountainRangeNoise.SetFrequency(0.005);

    this.detailNoise = new FastNoiseLite(7890);
    this.detailNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
    this.detailNoise.SetFrequency(0.05);
  }

  private getBiomeKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private generateBiome(chunkX: number, chunkZ: number): BiomeType {
    const scale = 0.01; // Large-scale features
    const x = chunkX * scale;
    const z = chunkZ * scale;

    // Generate base terrain features
    const elevation = (this.elevationNoise.GetNoise(x, z) + 1) / 2;
    const moisture = (this.moistureNoise.GetNoise(x * 1.5, z * 1.5) + 1) / 2;
    const temperature = (this.temperatureNoise.GetNoise(x * 0.8, z * 0.8) + 1) / 2;
    const mountainRange = (this.mountainRangeNoise.GetNoise(x * 0.3, z * 0.3) + 1) / 2;

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
        
        // Professional terrain generation using FastNoiseLite with proper fractal noise
        let height = 0;
        
        // Configure fractal noise for realistic terrain
        const terrainNoise = new FastNoiseLite(this.hashChunkCoords(chunkX, chunkZ));
        terrainNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
        terrainNoise.SetFractalType(FastNoiseLite.FractalType.FBm);
        terrainNoise.SetFractalOctaves(6);
        terrainNoise.SetFractalLacunarity(2.0);
        terrainNoise.SetFractalGain(0.5);
        terrainNoise.SetFrequency(biome.noiseScale * 0.01);
        
        // Generate base height using fractal Brownian motion
        const noiseValue = terrainNoise.GetNoise(worldX, worldZ);
        height = ((noiseValue + 1) / 2) * biome.heightScale;
        
        // Add domain warping for more natural terrain features
        const warpNoise = new FastNoiseLite(this.hashChunkCoords(chunkX, chunkZ) + 1000);
        warpNoise.SetNoiseType(FastNoiseLite.NoiseType.Perlin);
        warpNoise.SetFrequency(0.005);
        
        const warpX = warpNoise.GetNoise(worldX * 0.01, worldZ * 0.01) * 50;
        const warpZ = warpNoise.GetNoise(worldX * 0.01 + 100, worldZ * 0.01 + 100) * 50;
        
        const warpedNoise = terrainNoise.GetNoise(worldX + warpX, worldZ + warpZ);
        height += ((warpedNoise + 1) / 2) * biome.heightScale * 0.3;
        
        // Apply biome-specific terrain modifications
        const continentalShape = this.elevationNoise.GetNoise(worldX * 0.001, worldZ * 0.001);
        const mountainRidge = this.mountainRangeNoise.GetNoise(worldX * 0.002, worldZ * 0.002);
        
        // Mountain regions - create realistic mountain terrain
        if (biome.type === 'mountain') {
          const mountainInfluence = Math.pow((continentalShape + 1) / 2, 2) * Math.pow((mountainRidge + 1) / 2, 1.5);
          height += mountainInfluence * 40;
        }
        
        // Valley regions - create gentle valleys
        const valleyInfluence = Math.pow(Math.max(0, (-continentalShape + 1) / 2), 1.5);
        if (valleyInfluence > 0.2) {
          height -= valleyInfluence * 15;
        }
        
        // Add slope steepness modifier based on elevation change
        const slopeModifier = this.calculateSlopeModifier(worldX, worldZ, height, biome);
        height = height * slopeModifier;
        
        // Progressive smoothing for realistic terrain
        height = this.applySmoothingFilter(height, worldX, worldZ, biome);
        
        // Apply high-quality detail enhancement for realistic heightmaps
        height = this.enhanceHeightmapQuality(worldX, worldZ, height, biome);
        
        // Apply gentle biome-specific scaling - NO harsh elevation jumps
        height = height + biome.elevation * 8 + (biome.heightScale * 0.8);
        
        // Critical: Ensure height values stay in gradual, traversable range (0-80 units max)
        height = Math.max(0, Math.min(80, height));

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