import { v4 as uuidv4 } from 'uuid';

export interface TerrainParams {
  chunkX: number;
  chunkZ: number;
  algorithm: string;
  size: number;
  frequency: number;
  amplitude: number;
  octaves: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  erosionIterations: number;
  smoothingPasses: number;
}

export interface TerrainChunk {
  id: string;
  chunkX: number;
  chunkZ: number;
  size: number;
  heightmap: number[][];
  algorithm: string;
  minHeight: number;
  maxHeight: number;
  generatedAt: number;
}

export class SimpleTerrain {
  private static instance: SimpleTerrain;

  static getInstance(): SimpleTerrain {
    if (!SimpleTerrain.instance) {
      SimpleTerrain.instance = new SimpleTerrain();
    }
    return SimpleTerrain.instance;
  }

  private constructor() {}

  /**
   * Simple deterministic random number generator
   */
  private random(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Simple noise function
   */
  private noise(x: number, y: number, seed: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1; // Return value between -1 and 1
  }

  /**
   * Generate mountain terrain with dramatic elevation changes
   */
  generateMountainTerrain(params: TerrainParams): number[][] {
    const { size, amplitude, seed, minHeight, maxHeight } = params;
    
    // Initialize heightmap properly
    const heightmap: number[][] = [];
    for (let y = 0; y < size; y++) {
      heightmap[y] = [];
      for (let x = 0; x < size; x++) {
        heightmap[y][x] = 0;
      }
    }
    
    // Generate base terrain using multiple noise layers
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let height = 0;
        let frequency = 0.01;
        let currentAmplitude = amplitude;
        
        // Layer multiple octaves of noise
        for (let octave = 0; octave < 6; octave++) {
          const sampleX = x * frequency;
          const sampleY = y * frequency;
          const noiseValue = this.noise(sampleX, sampleY, seed + octave * 1000);
          height += noiseValue * currentAmplitude;
          
          frequency *= 2.0;
          currentAmplitude *= 0.5;
        }
        
        // Add ridged noise for mountain peaks
        const ridgeX = x * 0.005;
        const ridgeY = y * 0.005;
        const ridge = Math.abs(this.noise(ridgeX, ridgeY, seed + 5000));
        height += (1 - ridge) * amplitude * 0.6;
        
        // Base elevation
        height += amplitude * 0.2;
        
        heightmap[y][x] = height;
      }
    }

    // Find min/max without flattening (avoid stack overflow on large arrays)
    let currentMin = Infinity;
    let currentMax = -Infinity;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (heightmap[y][x] < currentMin) currentMin = heightmap[y][x];
        if (heightmap[y][x] > currentMax) currentMax = heightmap[y][x];
      }
    }
    
    const range = currentMax - currentMin;

    if (range > 0) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let normalized = (heightmap[y][x] - currentMin) / range;
          
          // Apply exponential curve for dramatic peaks
          normalized = Math.pow(normalized, 1.5);
          
          heightmap[y][x] = minHeight + (normalized * (maxHeight - minHeight));
        }
      }
    }

    return heightmap;
  }

  /**
   * Generate simple perlin-style terrain
   */
  generatePerlinTerrain(params: TerrainParams): number[][] {
    const { size, amplitude, seed, minHeight, maxHeight } = params;
    
    const heightmap: number[][] = [];
    for (let y = 0; y < size; y++) {
      heightmap[y] = [];
      for (let x = 0; x < size; x++) {
        let height = 0;
        let frequency = 0.02;
        let currentAmplitude = amplitude;
        
        for (let octave = 0; octave < 4; octave++) {
          height += this.noise(x * frequency, y * frequency, seed + octave * 1000) * currentAmplitude;
          frequency *= 2.0;
          currentAmplitude *= 0.5;
        }
        
        heightmap[y][x] = minHeight + ((height + amplitude) / (2 * amplitude)) * (maxHeight - minHeight);
      }
    }
    
    return heightmap;
  }

  /**
   * Generate a terrain chunk using the specified algorithm
   */
  generateChunk(chunkX: number, chunkZ: number, params: TerrainParams): TerrainChunk {
    let heightmap: number[][];
    
    switch (params.algorithm.toLowerCase()) {
      case 'mountain':
        heightmap = this.generateMountainTerrain(params);
        break;
      case 'perlin':
        heightmap = this.generatePerlinTerrain(params);
        break;
      default:
        heightmap = this.generateMountainTerrain(params);
    }

    // Calculate actual min/max heights without flattening
    let actualMin = Infinity;
    let actualMax = -Infinity;
    
    for (let y = 0; y < params.size; y++) {
      for (let x = 0; x < params.size; x++) {
        if (heightmap[y][x] < actualMin) actualMin = heightmap[y][x];
        if (heightmap[y][x] > actualMax) actualMax = heightmap[y][x];
      }
    }

    return {
      id: uuidv4(),
      chunkX,
      chunkZ,
      size: params.size,
      heightmap,
      algorithm: params.algorithm,
      minHeight: actualMin,
      maxHeight: actualMax,
      generatedAt: Date.now()
    };
  }
}