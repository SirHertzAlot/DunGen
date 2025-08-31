/**
 * Native terrain generation implementation without THREE.js dependencies
 * Generates actual mountains with dramatic elevation changes using proven algorithms
 */

import { createNoise2D } from 'simplex-noise';

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
  erosionIterations?: number;
  smoothingPasses?: number;
}

export interface TerrainChunk {
  id: string;
  chunkX: number;
  chunkZ: number;
  size: number;
  heightmap: number[][];
  minHeight: number;
  maxHeight: number;
  algorithm: string;
  generatedAt: number;
}

export class NativeTerrainGenerator {
  private static instance: NativeTerrainGenerator;
  private noiseCache: Map<number, (x: number, y: number) => number> = new Map();

  private constructor() {}

  static getInstance(): NativeTerrainGenerator {
    if (!NativeTerrainGenerator.instance) {
      NativeTerrainGenerator.instance = new NativeTerrainGenerator();
    }
    return NativeTerrainGenerator.instance;
  }

  private getNoise(seed: number): (x: number, y: number) => number {
    if (!this.noiseCache.has(seed)) {
      this.noiseCache.set(seed, createNoise2D(() => seed));
    }
    return this.noiseCache.get(seed)!;
  }

  /**
   * Generate terrain using Diamond-Square algorithm for mountain ranges
   */
  private generateDiamondSquare(params: TerrainParams): number[][] {
    const { size, amplitude, seed, minHeight, maxHeight } = params;
    const heightmap: number[][] = Array(size).fill(null).map(() => Array(size).fill(0));
    
    // Initialize corners with random heights for mountain bases
    const noise = this.getNoise(seed);
    const cornerHeight = amplitude * 0.5;
    heightmap[0][0] = cornerHeight + (noise(0, 0) * amplitude * 0.3);
    heightmap[0][size - 1] = cornerHeight + (noise(0, size) * amplitude * 0.3);
    heightmap[size - 1][0] = cornerHeight + (noise(size, 0) * amplitude * 0.3);
    heightmap[size - 1][size - 1] = cornerHeight + (noise(size, size) * amplitude * 0.3);

    let chunkSize = size - 1;
    let scale = amplitude;

    while (chunkSize > 1) {
      const half = chunkSize / 2;

      // Diamond step - create center points
      for (let y = half; y < size - 1; y += chunkSize) {
        for (let x = half; x < size - 1; x += chunkSize) {
          const avg = (
            heightmap[y - half][x - half] +
            heightmap[y - half][x + half] +
            heightmap[y + half][x - half] +
            heightmap[y + half][x + half]
          ) / 4;
          
          const variation = (noise.noise2D(x * 0.01, y * 0.01) - 0.5) * scale * 2;
          heightmap[y][x] = avg + variation;
        }
      }

      // Square step - create edge midpoints
      for (let y = 0; y < size; y += half) {
        for (let x = (y + half) % chunkSize; x < size; x += chunkSize) {
          const neighbors = [];
          
          if (y >= half) neighbors.push(heightmap[y - half][x]);
          if (y + half < size) neighbors.push(heightmap[y + half][x]);
          if (x >= half) neighbors.push(heightmap[y][x - half]);
          if (x + half < size) neighbors.push(heightmap[y][x + half]);
          
          const avg = neighbors.reduce((sum, h) => sum + h, 0) / neighbors.length;
          const variation = (noise.noise2D(x * 0.01, y * 0.01) - 0.5) * scale * 2;
          heightmap[y][x] = avg + variation;
        }
      }

      chunkSize = half;
      scale *= 0.6; // Reduce variation at each level
    }

    // Normalize to desired range and create dramatic peaks
    const flatHeights = heightmap.flat();
    const currentMin = Math.min(...flatHeights);
    const currentMax = Math.max(...flatHeights);
    const currentRange = currentMax - currentMin || 1;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Normalize to 0-1
        let normalized = (heightmap[y][x] - currentMin) / currentRange;
        
        // Apply power curve for dramatic peaks
        normalized = Math.pow(normalized, 1.5);
        
        // Scale to final range
        heightmap[y][x] = minHeight + (normalized * (maxHeight - minHeight));
      }
    }

    return heightmap;
  }

  /**
   * Generate terrain using layered Perlin noise for varied landscapes
   */
  private generateLayeredPerlin(params: TerrainParams): number[][] {
    const { size, frequency, amplitude, octaves, seed, minHeight, maxHeight } = params;
    const heightmap: number[][] = Array(size).fill(null).map(() => Array(size).fill(0));
    const noise = this.getNoise(seed);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let height = 0;
        let amp = amplitude;
        let freq = frequency;

        // Layer multiple octaves for complex terrain
        for (let octave = 0; octave < octaves; octave++) {
          height += noise(x * freq, y * freq) * amp;
          amp *= 0.5;
          freq *= 2.1;
        }

        // Add ridged noise for mountain ridges
        const ridge = Math.abs(noise(x * frequency * 0.5, y * frequency * 0.5));
        height += (1 - ridge) * amplitude * 0.8;

        // Normalize and apply to range
        height = (height + amplitude) / (amplitude * 2); // Normalize to 0-1
        height = Math.pow(height, 1.3); // Power curve for peaks
        heightmap[y][x] = minHeight + (height * (maxHeight - minHeight));
      }
    }

    return heightmap;
  }

  /**
   * Generate volcanic terrain with crater formations
   */
  private generateVolcanic(params: TerrainParams): number[][] {
    const { size, frequency, amplitude, seed, minHeight, maxHeight } = params;
    const heightmap: number[][] = Array(size).fill(null).map(() => Array(size).fill(0));
    const noise = this.getNoise(seed);

    const centerX = size / 2;
    const centerY = size / 2;
    const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Distance from center
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const normalizedDistance = distance / maxDistance;

        // Create cone shape
        let height = 1 - normalizedDistance;
        height = Math.max(0, height);

        // Add noise for rough volcanic surface
        const roughness = noise.noise2D(x * frequency * 4, y * frequency * 4) * 0.2;
        height += roughness;

        // Create crater at peak
        if (distance < size * 0.15) {
          const craterDepth = 1 - (distance / (size * 0.15));
          height -= craterDepth * 0.8;
        }

        // Apply power curve for steep slopes
        height = Math.pow(Math.max(0, height), 2);
        heightmap[y][x] = minHeight + (height * (maxHeight - minHeight));
      }
    }

    return heightmap;
  }

  /**
   * Generate fault-line terrain with dramatic cliffs
   */
  private generateFaultLine(params: TerrainParams): number[][] {
    const { size, amplitude, seed, minHeight, maxHeight } = params;
    const heightmap: number[][] = Array(size).fill(null).map(() => Array(size).fill(0));
    const noise = this.getNoise(seed);

    // Create multiple fault lines
    const faultCount = 5;
    
    for (let fault = 0; fault < faultCount; fault++) {
      const angle = (fault / faultCount) * Math.PI * 2;
      const faultX = Math.cos(angle);
      const faultY = Math.sin(angle);
      const offset = noise.noise2D(fault * 100, fault * 100) * size * 0.3;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Distance from fault line
          const distance = (x - size/2) * faultY - (y - size/2) * faultX + offset;
          const faultEffect = Math.tanh(distance / (size * 0.1)) * amplitude * 0.3;
          
          heightmap[y][x] += faultEffect;
        }
      }
    }

    // Add base terrain
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const baseHeight = noise.noise2D(x * 0.01, y * 0.01) * amplitude * 0.5;
        heightmap[y][x] += baseHeight + amplitude * 0.5;
        
        // Normalize to range
        heightmap[y][x] = Math.max(minHeight, Math.min(maxHeight, heightmap[y][x]));
      }
    }

    return heightmap;
  }

  /**
   * Apply erosion simulation for realistic weathering
   */
  private applyErosion(heightmap: number[][], iterations: number): number[][] {
    const size = heightmap.length;
    let current = heightmap.map(row => [...row]);

    for (let iter = 0; iter < iterations; iter++) {
      const next = current.map(row => [...row]);

      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const neighbors = [
            current[y-1][x], current[y+1][x],
            current[y][x-1], current[y][x+1]
          ];
          
          const avgNeighbor = neighbors.reduce((sum, h) => sum + h, 0) / 4;
          const erosionRate = 0.1;
          
          if (current[y][x] > avgNeighbor) {
            next[y][x] -= (current[y][x] - avgNeighbor) * erosionRate;
          }
        }
      }

      current = next;
    }

    return current;
  }

  /**
   * Apply smoothing passes to reduce harsh edges
   */
  private applySmoothing(heightmap: number[][], passes: number): number[][] {
    const size = heightmap.length;
    let current = heightmap.map(row => [...row]);

    for (let pass = 0; pass < passes; pass++) {
      const next = current.map(row => [...row]);

      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const sum = 
            current[y-1][x-1] + current[y-1][x] + current[y-1][x+1] +
            current[y][x-1]   + current[y][x]   + current[y][x+1] +
            current[y+1][x-1] + current[y+1][x] + current[y+1][x+1];
          
          next[y][x] = sum / 9;
        }
      }

      current = next;
    }

    return current;
  }

  /**
   * Generate terrain chunk with specified parameters
   */
  generateTerrain(params: TerrainParams): TerrainChunk {
    let heightmap: number[][];

    // Select algorithm
    switch (params.algorithm.toLowerCase()) {
      case 'diamondsquare':
      case 'mountain':
        heightmap = this.generateDiamondSquare(params);
        break;
      case 'perlin':
      case 'layered':
        heightmap = this.generateLayeredPerlin(params);
        break;
      case 'volcanic':
      case 'volcano':
        heightmap = this.generateVolcanic(params);
        break;
      case 'fault':
      case 'faultline':
        heightmap = this.generateFaultLine(params);
        break;
      default:
        heightmap = this.generateDiamondSquare(params);
    }

    // Apply post-processing
    if (params.erosionIterations && params.erosionIterations > 0) {
      heightmap = this.applyErosion(heightmap, params.erosionIterations);
    }

    if (params.smoothingPasses && params.smoothingPasses > 0) {
      heightmap = this.applySmoothing(heightmap, params.smoothingPasses);
    }

    // Calculate final stats
    const flatHeights = heightmap.flat();
    const actualMin = Math.min(...flatHeights);
    const actualMax = Math.max(...flatHeights);

    return {
      id: `native_${params.chunkX}_${params.chunkZ}_${Date.now()}`,
      chunkX: params.chunkX,
      chunkZ: params.chunkZ,
      size: params.size,
      heightmap,
      minHeight: actualMin,
      maxHeight: actualMax,
      algorithm: params.algorithm,
      generatedAt: Date.now()
    };
  }
}