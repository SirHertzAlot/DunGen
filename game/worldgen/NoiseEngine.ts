import { NoiseAlgorithm } from './TerrainConfig';

export class NoiseEngine {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  // Simple noise function using sine/cosine
  private baseNoise(x: number, z: number, frequency: number, seed: number): number {
    const value = Math.sin(x * frequency + seed) * Math.cos(z * frequency + seed * 1.3);
    return (value + 1) / 2; // Normalize to 0-1
  }

  // Apply noise algorithm with specific parameters
  public applyNoiseAlgorithm(
    algorithm: NoiseAlgorithm,
    worldX: number,
    worldZ: number,
    seedOffset: number,
    heightScale: number
  ): number {
    const effectiveSeed = this.seed + seedOffset;
    let result = 0;

    switch (algorithm.type) {
      case 'ridged_noise':
        result = this.generateRidgedNoise(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'fractal_noise':
        result = this.generateFractalNoise(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'dune_noise':
        result = this.generateDuneNoise(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'rolling_hills':
        result = this.generateRollingHills(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'flat_base':
        result = this.generateFlatBase(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'mound_spots':
        result = this.generateMoundSpots(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'windswept':
        result = this.generateWindswept(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'permafrost_bumps':
        result = this.generatePermafrostBumps(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'bog_base':
        result = this.generateBogBase(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'water_channels':
        result = this.generateWaterChannels(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'gentle_hills':
        result = this.generateGentleHills(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'mountain_spine':
        result = this.generateMountainSpine(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'continental_ridges':
        result = this.generateContinentalRidges(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'massive_elevation':
        result = this.generateMassiveElevation(worldX, worldZ, algorithm, effectiveSeed);
        break;

      case 'detail_noise':
      case 'ripple_noise':
      case 'fine_sand':
      case 'tree_variation':
      case 'root_system':
      case 'bog_detail':
      case 'ice_detail':
      case 'grass_tufts':
      case 'meadow_variation':
      case 'grass_detail':
        result = this.generateDetailNoise(worldX, worldZ, algorithm, effectiveSeed);
        break;

      default:
        // Fallback to basic noise
        result = this.baseNoise(worldX, worldZ, algorithm.frequency, effectiveSeed);
        break;
    }

    // Apply power function if specified
    if (algorithm.power && algorithm.power !== 1.0) {
      result = Math.pow(result, algorithm.power);
    }

    // Apply absolute value if specified
    if (algorithm.absolute) {
      result = Math.abs(result);
    }

    // Apply threshold if specified
    if (algorithm.threshold !== undefined) {
      result = Math.max(0, result - algorithm.threshold);
    }

    return result * algorithm.amplitude_factor * heightScale;
  }

  private generateRidgedNoise(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    let result = 0;
    const octaves = algorithm.octaves || 1;
    
    for (let i = 0; i < octaves; i++) {
      const freq = algorithm.frequency * Math.pow(2, i);
      const amp = Math.pow(0.5, i);
      let noise = this.baseNoise(worldX, worldZ, freq, seed + i * 1000);
      
      if (algorithm.ridged) {
        noise = 1 - Math.abs(noise * 2 - 1); // Create ridged effect
      }
      
      result += noise * amp;
    }
    
    return result / octaves;
  }

  private generateFractalNoise(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    let result = 0;
    let amplitude = 1;
    let frequency = algorithm.frequency;
    const octaves = algorithm.octaves || 1;
    
    for (let i = 0; i < octaves; i++) {
      result += this.baseNoise(worldX, worldZ, frequency, seed + i * 1000) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return result;
  }

  private generateDuneNoise(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Create dune-like formations with smooth curves
    const base = this.baseNoise(worldX, worldZ, algorithm.frequency, seed);
    const variation = this.baseNoise(worldX * 1.3, worldZ * 0.8, algorithm.frequency * 1.5, seed + 500);
    return (base + variation * 0.3) / 1.3;
  }

  private generateRollingHills(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Smooth rolling terrain
    let result = 0;
    result += this.baseNoise(worldX, worldZ, algorithm.frequency, seed) * 0.6;
    result += this.baseNoise(worldX * 2, worldZ * 2, algorithm.frequency * 2, seed + 100) * 0.3;
    result += this.baseNoise(worldX * 4, worldZ * 4, algorithm.frequency * 4, seed + 200) * 0.1;
    return result;
  }

  private generateFlatBase(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Very low-amplitude base for swamps
    return this.baseNoise(worldX, worldZ, algorithm.frequency, seed) * 0.5;
  }

  private generateMoundSpots(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    const noise = this.baseNoise(worldX, worldZ, algorithm.frequency, seed);
    return noise > (algorithm.threshold || 0.5) ? noise : 0;
  }

  private generateWindswept(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Windswept terrain with directional bias
    const primary = this.baseNoise(worldX * 0.7, worldZ, algorithm.frequency, seed);
    const cross = this.baseNoise(worldX, worldZ * 1.3, algorithm.frequency * 1.2, seed + 300);
    return primary * 0.7 + cross * 0.3;
  }

  private generatePermafrostBumps(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Small, scattered bumps
    const bumps = this.baseNoise(worldX, worldZ, algorithm.frequency, seed);
    return bumps > 0.6 ? bumps : bumps * 0.2;
  }

  private generateBogBase(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Uneven boggy terrain
    let result = 0;
    result += this.baseNoise(worldX, worldZ, algorithm.frequency, seed) * 0.5;
    result += this.baseNoise(worldX * 3, worldZ * 3, algorithm.frequency * 3, seed + 150) * 0.3;
    result += this.baseNoise(worldX * 6, worldZ * 6, algorithm.frequency * 6, seed + 250) * 0.2;
    return result;
  }

  private generateWaterChannels(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    const channels = this.baseNoise(worldX, worldZ, algorithm.frequency, seed);
    return channels > (algorithm.threshold || 0.4) ? channels : 0;
  }

  private generateGentleHills(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Smooth, gentle elevation changes
    let result = 0;
    const octaves = algorithm.octaves || 3;
    
    for (let i = 0; i < octaves; i++) {
      const freq = algorithm.frequency * Math.pow(1.8, i);
      const amp = Math.pow(0.6, i);
      result += this.baseNoise(worldX, worldZ, freq, seed + i * 100) * amp;
    }
    
    return result;
  }

  private generateDetailNoise(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Generic detail noise for fine features
    return this.baseNoise(worldX, worldZ, algorithm.frequency, seed);
  }

  // ====== MASSIVE MOUNTAIN RANGE ALGORITHMS ======

  private generateMountainSpine(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Creates a massive mountain spine using extreme noise parameters
    let result = 0;
    const octaves = algorithm.octaves || 8;
    const lacunarity = algorithm.lacunarity || 2.5;
    const persistence = algorithm.persistence || 0.6;
    const ridgeSharpness = algorithm.ridge_sharpness || 4.0;
    
    let frequency = algorithm.frequency;
    let amplitude = 1.0;
    
    for (let i = 0; i < octaves; i++) {
      // Generate ridged noise for sharp mountain peaks
      const noise = this.baseNoise(worldX, worldZ, frequency, seed + i * 77);
      const ridged = 1 - Math.abs(noise * 2 - 1); // Create ridged pattern
      const sharpened = Math.pow(ridged, ridgeSharpness); // Sharpen peaks dramatically
      
      result += sharpened * amplitude;
      
      frequency *= lacunarity;
      amplitude *= persistence;
    }
    
    // Apply extreme power curve for massive elevation
    const power = algorithm.power || 3.5;
    return Math.pow(Math.max(0, result), power);
  }

  private generateContinentalRidges(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Continental-scale ridge systems
    let result = 0;
    const octaves = algorithm.octaves || 6;
    const ridgeOffset = algorithm.ridge_offset || 1.0;
    
    let frequency = algorithm.frequency;
    let amplitude = 1.0;
    
    for (let i = 0; i < octaves; i++) {
      const noise1 = this.baseNoise(worldX, worldZ, frequency, seed + i * 123);
      const noise2 = this.baseNoise(worldZ, worldX, frequency * 1.1, seed + i * 234);
      
      // Create continental ridge patterns
      const ridge = Math.abs(noise1 - noise2 + ridgeOffset);
      const continental = Math.pow(ridge, algorithm.power || 2.8);
      
      result += continental * amplitude;
      
      frequency *= 2.1;
      amplitude *= 0.65;
    }
    
    return result;
  }

  private generateMassiveElevation(worldX: number, worldZ: number, algorithm: NoiseAlgorithm, seed: number): number {
    // Massive elevation base with extreme height scaling
    let result = 0;
    const octaves = algorithm.octaves || 5;
    const elevationBias = algorithm.elevation_bias || 0.7;
    
    let frequency = algorithm.frequency;
    let amplitude = 1.0;
    
    for (let i = 0; i < octaves; i++) {
      // Multiple noise layers for massive terrain
      const primary = this.baseNoise(worldX, worldZ, frequency, seed + i * 345);
      const secondary = this.baseNoise(worldX * 1.3, worldZ * 0.8, frequency * 1.7, seed + i * 456);
      
      // Combine with elevation bias for massive height
      const combined = (primary * 0.7 + secondary * 0.3 + elevationBias);
      const massive = Math.pow(Math.max(0, combined), algorithm.power || 4.2);
      
      result += massive * amplitude;
      
      frequency *= 2.3;
      amplitude *= 0.55;
    }
    
    return result;
  }
}