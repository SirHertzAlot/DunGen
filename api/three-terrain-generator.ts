import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as THREE from "three";
import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

// Load THREE.Terrain manually since it's a UMD module
const terrainPath = path.join(
  process.cwd(),
  "node_modules/three.terrain.js/build/THREE.Terrain.js",
);
const terrainCode = fs.readFileSync(terrainPath, "utf8");

// Create a mock global environment for THREE.Terrain
const global = globalThis as any;
global.THREE = THREE;

// Execute the THREE.Terrain code in our global context
eval(terrainCode);

interface TerrainRequest {
  chunkX: number;
  chunkZ: number;
  algorithm: string;
  size: number;
  frequency: number;
  amplitude: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  erosionIterations?: number;
  smoothingPasses?: number;
  turbulent?: boolean;
  steps?: number;
  biomeMap?: boolean;
  configProfile?: string;
}

interface BiomeProfile {
  name: string;
  heightRange: [number, number]; // [min, max] normalized height
  color?: string;
  features?: string[];
  probability?: number;
}

interface TerrainConfig {
  profiles: {
    [key: string]: {
      algorithm: string;
      frequency: number;
      amplitude: number;
      octaves: number;
      persistence: number;
      lacunarity: number;
      minHeight: number;
      maxHeight: number;
      erosionIterations: number;
      smoothingPasses: number;
      turbulent: boolean;
      steps: number;
      biomes: BiomeProfile[];
      features?: {
        [key: string]: any;
      };
      transformations?: string[];
    };
  };
}

// Cache for loaded config
let terrainConfigCache: TerrainConfig | null = null;

/**
 * Load terrain configuration from YAML files
 */
function loadTerrainConfig(): TerrainConfig {
  if (terrainConfigCache) return terrainConfigCache;

  try {
    const configPath = path.join(process.cwd(), "config/terrain-profiles.yaml");
    const configFile = fs.readFileSync(configPath, "utf8");
    terrainConfigCache = yaml.load(configFile) as TerrainConfig;
    console.log(
      `Loaded ${Object.keys(terrainConfigCache.profiles).length} terrain profiles from config`,
    );
    return terrainConfigCache;
  } catch (error) {
    console.warn("Could not load terrain config file, using defaults:", error);
    // Return a default configuration
    return {
      profiles: {
        default: {
          algorithm: "perlin",
          frequency: 0.015,
          amplitude: 1.0,
          octaves: 6,
          persistence: 0.5,
          lacunarity: 2.0,
          minHeight: 0,
          maxHeight: 400,
          erosionIterations: 3,
          smoothingPasses: 2,
          turbulent: true,
          steps: 4,
          biomes: [
            { name: "water", heightRange: [0.0, 0.3] },
            { name: "beach", heightRange: [0.3, 0.35] },
            { name: "plains", heightRange: [0.35, 0.6] },
            { name: "forest", heightRange: [0.6, 0.8] },
            { name: "mountain", heightRange: [0.8, 0.95] },
            { name: "snow", heightRange: [0.95, 1.0] },
          ],
        },
      },
    };
  }
}

/**
 * Determine terrain biome based on normalized height and biome profiles
 */
function determineBiome(
  normalizedHeight: number,
  biomeProfiles: BiomeProfile[],
): BiomeProfile {
  // Sort by probability first if available
  const sortedProfiles = [...biomeProfiles].sort(
    (a, b) => (b.probability || 0) - (a.probability || 0),
  );

  for (const biome of sortedProfiles) {
    if (
      normalizedHeight >= biome.heightRange[0] &&
      normalizedHeight <= biome.heightRange[1]
    ) {
      return biome;
    }
  }

  // Default to the highest biome if none match
  return biomeProfiles[biomeProfiles.length - 1];
}

/**
 * Apply multiple noise layers for more natural terrain
 */
function applyMultiLayeredNoise(
  vertices: Float32Array,
  baseOptions: any,
  noiseFunction: Function,
) {
  // Store original height values
  const originalHeights = new Float32Array(vertices.length / 3);
  for (let i = 0; i < vertices.length / 3; i++) {
    originalHeights[i] = vertices[i * 3 + 2];
  }

  // Apply successive noise layers with different frequencies
  for (let layer = 1; layer < baseOptions.octaves; layer++) {
    // Create options for this layer
    const layerOptions = { ...baseOptions };
    layerOptions.frequency *= Math.pow(baseOptions.lacunarity, layer);
    layerOptions.amplitude *= Math.pow(baseOptions.persistence, layer);

    // Generate this layer's heights
    const layerHeights = new Float32Array(vertices.length);
    noiseFunction(layerHeights, layerOptions);

    // Add this layer to the main heights
    for (let i = 0; i < vertices.length / 3; i++) {
      vertices[i * 3 + 2] += layerHeights[i * 3 + 2] * layerOptions.amplitude;
    }
  }
}

/**
 * Generate terrain feature placement data based on terrain and biomes
 */
function generateFeatureData(
  heightmap: number[][],
  biomeMap: string[][],
  size: number,
  config: any,
): any[] {
  const features = [];
  const featureDensity = 0.005; // 0.5% of cells get features
  const featureCount = Math.floor(size * size * featureDensity);

  // Generate some features
  for (let i = 0; i < featureCount; i++) {
    const x = Math.floor(Math.random() * (size - 10)) + 5;
    const y = Math.floor(Math.random() * (size - 10)) + 5;
    const height = heightmap[y][x];
    const biome = biomeMap ? biomeMap[y][x] : "unknown";

    // Determine feature type based on height and biome
    let featureType = "generic";
    let featureSize = 1;

    switch (biome) {
      case "water":
        featureType = Math.random() > 0.7 ? "coral" : "seaweed";
        featureSize = 0.5 + Math.random();
        break;
      case "beach":
        featureType = Math.random() > 0.5 ? "palm_tree" : "beach_rock";
        featureSize = 1 + Math.random() * 2;
        break;
      case "plains":
        featureType =
          Math.random() > 0.7
            ? "settlement"
            : Math.random() > 0.5
              ? "tree"
              : "rock";
        featureSize = 1 + Math.random() * 3;
        break;
      case "forest":
        featureType = Math.random() > 0.8 ? "forest_temple" : "tree_cluster";
        featureSize = 2 + Math.random() * 4;
        break;
      case "mountain":
        featureType = Math.random() > 0.7 ? "cave" : "large_rock";
        featureSize = 3 + Math.random() * 5;
        break;
      case "snow":
        featureType = Math.random() > 0.6 ? "ice_spire" : "snow_drift";
        featureSize = 2 + Math.random() * 3;
        break;
      default:
        featureType = "generic";
    }

    // Add feature
    features.push({
      x: x,
      y: y,
      height: height,
      biome: biome,
      type: featureType,
      size: featureSize,
      rotation: Math.random() * Math.PI * 2,
      variant: Math.floor(Math.random() * 3),
    });
  }

  return features;
}

export async function generateThreeTerrain(req: Request, res: Response) {
  try {
    const config: TerrainRequest = req.body;

    // Validate required parameters
    if (
      config.chunkX === undefined ||
      config.chunkZ === undefined ||
      !config.size
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: chunkX, chunkZ, size",
      });
    }

    // Load terrain configurations
    const terrainConfig = loadTerrainConfig();

    // Use config profile if specified, otherwise use default
    const profileName = config.configProfile || "default";
    const profile =
      terrainConfig.profiles[profileName] || terrainConfig.profiles["default"];

    // Apply profile settings (falling back to API values if provided)
    const algorithm = config.algorithm || profile.algorithm;
    const frequency = config.frequency || profile.frequency;
    const amplitude = config.amplitude || profile.amplitude;
    const octaves = config.octaves || profile.octaves;
    const persistence = config.persistence || profile.persistence;
    const lacunarity = config.lacunarity || profile.lacunarity;
    const minHeight = config.minHeight || profile.minHeight;
    const maxHeight = config.maxHeight || profile.maxHeight;
    const erosionIterations =
      config.erosionIterations || profile.erosionIterations;
    const smoothingPasses = config.smoothingPasses || profile.smoothingPasses;
    const turbulent =
      config.turbulent !== undefined ? config.turbulent : profile.turbulent;
    const steps = config.steps || profile.steps;
    const biomeMap = config.biomeMap !== undefined ? config.biomeMap : true;

    // Use seed for reproducible terrain
    const seed = config.seed || Math.floor(Math.random() * 1000000);

    console.log(
      `THREE.Terrain generation: ${algorithm} at (${config.chunkX}, ${config.chunkZ}) - Size: ${config.size}x${config.size} using profile: ${profileName}`,
    );

    // Initialize pseudo-random number generator with seed
    const random = (function () {
      let s = 1234 + seed;
      return function () {
        s = Math.sin(s) * 10000;
        return s - Math.floor(s);
      };
    })();

    // Set up options for THREE.Terrain with better defaults
    const terrainOptions: any = {
      xSize: 100,
      ySize: 100,
      xSegments: config.size - 1,
      ySegments: config.size - 1,
      minHeight: minHeight,
      maxHeight: maxHeight,
      frequency: frequency,
      amplitude: amplitude,
      octaves: octaves,
      persistence: persistence,
      lacunarity: lacunarity,
      seed: seed,
      random: random,
      turbulent: turbulent,
      steps: steps,
    };

    // Create geometry for terrain generation
    const geometry = new THREE.PlaneGeometry(
      terrainOptions.xSize,
      terrainOptions.ySize,
      terrainOptions.xSegments,
      terrainOptions.ySegments,
    );

    // Get the heightmap generation method
    let heightmapMethod;
    let afterFunctions = [];

    // Select appropriate algorithm with better configuration
    switch (algorithm.toLowerCase()) {
      case "perlin":
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.EaseInOut;
        break;
      case "simplex":
        // If THREE.Terrain has Simplex, use it, otherwise fall back to Perlin
        heightmapMethod =
          (THREE as any).Terrain.Simplex || (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.EaseInOut;
        break;
      case "ridged":
      case "ridgedmulti":
        // Use Perlin with turbulence for ridged effect
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.turbulent = true;
        afterFunctions.push((vertices: Float32Array, options: any) => {
          // Add ridge sharpening
          for (let i = 0; i < vertices.length / 3; i++) {
            const h = vertices[i * 3 + 2];
            const normalized =
              (h - options.minHeight) / (options.maxHeight - options.minHeight);

            // Apply ridge function: 2 * (0.5 - |0.5 - h|)
            const ridge = 2.0 * (0.5 - Math.abs(0.5 - normalized));
            vertices[i * 3 + 2] =
              options.minHeight +
              ridge * (options.maxHeight - options.minHeight);
          }
        });
        break;
      case "heightmap":
      case "diamondsquare":
      case "diamond-square":
        heightmapMethod = (THREE as any).Terrain.DiamondSquare;
        terrainOptions.frequency = 1.0; // For diamond square, frequency works differently
        terrainOptions.randomness = random;
        break;
      case "fault":
        heightmapMethod = (THREE as any).Terrain.Fault;
        terrainOptions.iterations = erosionIterations || 120;
        break;
      case "hill":
      case "mountain":
        heightmapMethod = (THREE as any).Terrain.Hill;
        // Define hills/mountains count based on terrain size
        terrainOptions.hillWidth = terrainOptions.xSize / (config.size / 15);
        terrainOptions.hillHeight = maxHeight * 0.8;
        terrainOptions.hills = config.size / 5;
        break;
      case "valley":
        // Create a combination of methods for a valley terrain type
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.Linear;
        afterFunctions.push((vertices: Float32Array, options: any) => {
          // Create a valley along the center
          for (let i = 0; i < vertices.length / 3; i++) {
            const x = (i % (options.xSegments + 1)) / options.xSegments - 0.5;
            const y =
              Math.floor(i / (options.xSegments + 1)) / options.ySegments - 0.5;
            const distFromCenter = Math.sqrt(x * x + y * y) * 2; // 0 at center, 1 at edges

            // Valley shape: deeper in center, rising toward edges
            const valleyFactor = Math.pow(distFromCenter, 0.5);
            vertices[i * 3 + 2] =
              vertices[i * 3 + 2] * valleyFactor +
              options.minHeight * (1 - valleyFactor);
          }
        });
        break;
      case "plateau":
        // Create a plateau terrain
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.EaseInOut;
        afterFunctions.push((vertices: Float32Array, options: any) => {
          // Add plateaus at different height levels
          const plateauHeight1 =
            options.minHeight + (options.maxHeight - options.minHeight) * 0.4;
          const plateauHeight2 =
            options.minHeight + (options.maxHeight - options.minHeight) * 0.7;
          const tolerance = (options.maxHeight - options.minHeight) * 0.05;

          for (let i = 0; i < vertices.length / 3; i++) {
            const h = vertices[i * 3 + 2];

            // Create first plateau level
            if (Math.abs(h - plateauHeight1) < tolerance) {
              vertices[i * 3 + 2] = plateauHeight1;
            }
            // Create second plateau level
            else if (Math.abs(h - plateauHeight2) < tolerance) {
              vertices[i * 3 + 2] = plateauHeight2;
            }
          }
        });
        break;
      case "islands":
        // Create island-like terrain with central landmass
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.EaseInOut;
        afterFunctions.push((vertices: Float32Array, options: any) => {
          // Apply island shape - higher in center, lower at edges
          for (let i = 0; i < vertices.length / 3; i++) {
            const x = (i % (options.xSegments + 1)) / options.xSegments - 0.5;
            const y =
              Math.floor(i / (options.xSegments + 1)) / options.ySegments - 0.5;
            const distFromCenter = Math.sqrt(x * x + y * y) * 2.2; // 0 at center, ~1 at edges

            // Apply radial gradient for island shape
            const islandFactor = Math.max(0, 1 - distFromCenter);
            const targetHeight =
              options.minHeight +
              islandFactor *
                islandFactor *
                (options.maxHeight - options.minHeight);

            // Blend original height with island shape
            vertices[i * 3 + 2] =
              vertices[i * 3 + 2] * 0.4 + targetHeight * 0.6;
          }
        });
        break;
      default:
        // Default to Perlin as it's most natural
        console.log(`Unknown algorithm '${algorithm}', defaulting to Perlin`);
        heightmapMethod = (THREE as any).Terrain.Perlin;
        terrainOptions.easing = (THREE as any).Terrain.EaseInOut;
    }

    // Generate terrain using THREE.Terrain
    const vertices = geometry.attributes.position.array as Float32Array;

    // Call the actual THREE.Terrain method
    heightmapMethod(vertices, terrainOptions);

    // Enhance terrain with multi-layered noise if applicable
    if (
      octaves > 1 &&
      (algorithm.toLowerCase() === "perlin" ||
        algorithm.toLowerCase() === "simplex")
    ) {
      applyMultiLayeredNoise(vertices, terrainOptions, heightmapMethod);
    }

    // Apply any post-processing from algorithm
    for (const afterFunc of afterFunctions) {
      afterFunc(vertices, terrainOptions);
    }

    // Apply smoothing passes for more natural terrain
    if (smoothingPasses > 0 && (THREE as any).Terrain.Smooth) {
      for (let i = 0; i < smoothingPasses; i++) {
        (THREE as any).Terrain.Smooth(vertices, terrainOptions);
      }
    }

    // Apply hydraulic erosion for realism if requested
    if (
      erosionIterations &&
      erosionIterations > 0 &&
      (THREE as any).Terrain.Erosion
    ) {
      (THREE as any).Terrain.Erosion(vertices, terrainOptions, {
        iterations: erosionIterations,
        strength: 0.25,
      });
    }

    // Convert the geometry vertices back to a 2D heightmap
    const heightmap: number[][] = [];
    const biomeMap: string[][] = biomeMap ? [] : undefined;
    let minHeightFound = Infinity;
    let maxHeightFound = -Infinity;

    for (let y = 0; y < config.size; y++) {
      heightmap[y] = [];
      if (biomeMap) biomeMap[y] = [];

      for (let x = 0; x < config.size; x++) {
        const index = (y * config.size + x) * 3 + 2; // Z coordinate
        const height = vertices[index] || 0;
        heightmap[y][x] = height;

        if (height < minHeightFound) minHeightFound = height;
        if (height > maxHeightFound) maxHeightFound = height;
      }
    }

    // Create biome mapping after knowing the actual height range
    if (biomeMap) {
      for (let y = 0; y < config.size; y++) {
        for (let x = 0; x < config.size; x++) {
          const height = heightmap[y][x];
          // Normalize height to 0-1 range based on actual found heights
          const normalizedHeight =
            (height - minHeightFound) / (maxHeightFound - minHeightFound || 1);

          // Get biome based on height and profile
          const biome = determineBiome(normalizedHeight, profile.biomes);
          biomeMap[y][x] = biome.name;
        }
      }
    }

    // Calculate statistics
    let totalHeight = 0;
    let totalCells = 0;
    const biomeCounts: Record<string, number> = {};

    for (let y = 0; y < config.size; y++) {
      for (let x = 0; x < config.size; x++) {
        totalHeight += heightmap[y][x];
        totalCells++;

        // Count biome distribution if biome map was generated
        if (biomeMap) {
          const biomeName = biomeMap[y][x];
          biomeCounts[biomeName] = (biomeCounts[biomeName] || 0) + 1;
        }
      }
    }

    const avgHeight = totalHeight / totalCells;

    // Generate feature placement data if needed
    const features = biomeMap
      ? generateFeatureData(heightmap, biomeMap, config.size, profile)
      : [];

    // Create result with transformation pipeline support
    const result = {
      id: uuidv4(),
      x: config.chunkX,
      z: config.chunkZ,
      size: config.size,
      heightmap: heightmap,
      algorithm: algorithm,
      profile: profileName,
      generated: true,
      lastAccessed: Date.now(),
      stats: {
        minHeight: minHeightFound,
        maxHeight: maxHeightFound,
        avgHeight: avgHeight.toFixed(2),
        range: maxHeightFound - minHeightFound,
        biomeCounts: biomeCounts,
      },
      biomeMap: biomeMap,
      features: features.length > 0 ? features : undefined,
      seed: seed,
      // Include transformation pipeline tags if available in profile
      transformationTags: profile.transformations || [],
    };

    console.log(
      `Generated ${algorithm} terrain using THREE.Terrain: Min=${minHeightFound.toFixed(1)}, Max=${maxHeightFound.toFixed(1)}, Range=${(maxHeightFound - minHeightFound).toFixed(1)}`,
    );

    res.json({
      success: true,
      data: result,
      message: `Generated ${algorithm} terrain using THREE.Terrain library with profile ${profileName}`,
    });
  } catch (error) {
    console.error("THREE.Terrain generation failed:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "THREE.Terrain generation failed",
      details: error instanceof Error ? error.stack : String(error),
    });
  }
}
