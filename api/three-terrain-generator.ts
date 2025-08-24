import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as THREE from "three";
import { Terrain, generateBlendedMaterial, scatterMeshes } from "@repcomm/three.terrain";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

/*
 Minimal, doc-faithful THREE.Terrain generator with an explicit check to ensure
 three.js is available globally before attempting to use THREE.Terrain.

 Purpose of this patch:
 - Ensure the runtime has THREE available on globalThis (since three.terrain.js
   expects a global THREE when loaded via the documented <script> approach).
 - If globalThis.THREE is missing, we attach the imported THREE as a best-effort
   fallback and log a clear warning that, per the documentation, three.js must
   be loaded before three.terrain.js.
 - If THREE.Terrain is missing, return a clear 500 explaining the required order:
   include three.js first, then three.terrain.js (UMD build).
 - Keep the invocation exactly like the docs: terrainScene = THREE.Terrain(options)
 - Config values are loaded from YAML (config/terrain-profiles.yaml).
*/

/* ------------------ YAML-backed configuration loading ------------------ */

type BiomeProfile = {
  name: string;
  heightRange: [number, number]; // normalized 0..1
  probability?: number;
  color?: string;
  features?: string[];
};

type TerrainProfile = {
  algorithm?: string;
  frequency?: number;
  amplitude?: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  minHeight?: number;
  maxHeight?: number;
  erosionIterations?: number;
  smoothingPasses?: number;
  turbulent?: boolean;
  steps?: number;
  xSize?: number;
  ySize?: number;
  biomes?: BiomeProfile[];
  transformations?: string[];
};

type TerrainConfig = {
  profiles: { [key: string]: TerrainProfile };
};

let terrainConfigCache: TerrainConfig | null = null;
const TERRAIN_CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "terrain-profiles.yaml",
);

function loadTerrainConfig(): TerrainConfig {
  if (terrainConfigCache) return terrainConfigCache;

  try {
    if (!fs.existsSync(TERRAIN_CONFIG_PATH)) throw new Error("not found");
    const raw = fs.readFileSync(TERRAIN_CONFIG_PATH, "utf8");
    const parsed = yaml.load(raw) as TerrainConfig | undefined;
    if (!parsed || !parsed.profiles) throw new Error("invalid config");
    terrainConfigCache = parsed;
    console.log(
      `Loaded terrain config profiles: ${Object.keys(parsed.profiles).join(", ")}`,
    );
    return terrainConfigCache;
  } catch (err) {
    console.warn(
      `Could not load ${TERRAIN_CONFIG_PATH}, using default profile. (${(err as Error).message})`,
    );
    terrainConfigCache = {
      profiles: {
        default: {
          algorithm: "perlin",
          frequency: 2.5,
          amplitude: 1.0,
          octaves: 4,
          persistence: 0.5,
          lacunarity: 2.0,
          minHeight: -100,
          maxHeight: 100,
          erosionIterations: 0,
          smoothingPasses: 0,
          turbulent: false,
          steps: 1,
          xSize: 1024,
          ySize: 1024,
          biomes: [
            { name: "water", heightRange: [0.0, 0.25] },
            { name: "beach", heightRange: [0.25, 0.35] },
            { name: "plains", heightRange: [0.35, 0.6] },
            { name: "forest", heightRange: [0.6, 0.8] },
            { name: "mountain", heightRange: [0.8, 0.95] },
            { name: "snow", heightRange: [0.95, 1.0] },
          ],
        },
      },
    };
    return terrainConfigCache;
  }
}

/* ------------------ Helpers ------------------ */

function determineBiome(
  normalizedHeight: number,
  biomes: BiomeProfile[] = [],
): BiomeProfile {
  for (const b of biomes) {
    if (
      normalizedHeight >= b.heightRange[0] &&
      normalizedHeight <= b.heightRange[1]
    ) {
      return b;
    }
  }
  return (
    biomes[biomes.length - 1] || {
      name: "unknown",
      heightRange: [0, 1],
      probability: 1,
    }
  );
}

function createSeededPRNG(seedValue: number) {
  let state = seedValue % 2147483647;
  if (state <= 0) state += 2147483646;
  return function seeded() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/* ------------------ Main HTTP handler ------------------ */

/**
 * This function follows the documented usage of three.terrain.js exactly:
 * it expects THREE.Terrain to be available globally (attached to the same
 * THREE used by the runtime). It checks for three.js being loaded first and
 * returns a helpful error if the library order is incorrect.
 */
export async function generateThreeTerrain(req: Request, res: Response) {
  try {
    const config = req.body || {};

    if (!config.size || typeof config.size !== "number") {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: size (number).",
      });
    }

    // ENSURE THREE global exists and warn if load order might be wrong.
    // three.terrain.js (UMD) expects THREE to be present globally when it runs.
    const importedTHREE = THREE;
    const globalTHREE = (globalThis as any).THREE;

    if (!globalTHREE) {
      // Best-effort fallback: attach the imported THREE to globalThis so that
      // if three.terrain.js was loaded later in the same runtime it will find it.
      // Log a clear warning: per docs, three.js must be included before three.terrain.js
      console.warn(
        "globalThis.THREE was not present. Attaching imported THREE to globalThis as a fallback. " +
          "Per documentation, ensure three.js is loaded before three.terrain.js (include three.js first, then THREE.Terrain).",
      );
      (globalThis as any).THREE = importedTHREE;
    } else if (globalTHREE !== importedTHREE) {
      // If the global THREE differs from the imported one we used, warn the user.
      // This can happen if the client loaded a different THREE instance; three.terrain.js
      // must be initialized against the same THREE instance it will be used with.
      console.warn(
        "A different THREE instance exists on globalThis than the one imported by this module. " +
          "Make sure three.js is included only once and that three.terrain.js was loaded after the same THREE instance.",
      );
    }

    // Use the global THREE that three.terrain.js would have been attached to.
    const runtimeTHREE = (globalThis as any).THREE as typeof THREE;

    // Verify THREE.Terrain is available (i.e., three.terrain.js was loaded after three.js)
    if (!runtimeTHREE || !(runtimeTHREE as any).Terrain) {
      return res.status(500).json({
        success: false,
        error:
          "THREE.Terrain not available in runtime. Make sure three.js is loaded first and then include the three.terrain.js UMD build (e.g. <script src='three.js'></script> then <script src='build/THREE.Terrain.js'></script>).",
        hint: "If you are bundling on the server, ensure the UMD build is evaluated after the same THREE instance is available globally; if including clientside, include three.js before THREE.Terrain.",
      });
    }

    // Load YAML config and create terrain using documented invocation
    const terrainConfig = loadTerrainConfig();
    const profileName = config.configProfile || "default";
    const profile: TerrainProfile =
      terrainConfig.profiles[profileName] || terrainConfig.profiles["default"];

    const algorithm = (
      config.algorithm ||
      profile.algorithm ||
      "perlin"
    ).toLowerCase();
    const frequency = config.frequency ?? profile.frequency ?? 2.5;
    const amplitude = config.amplitude ?? profile.amplitude ?? 1.0;
    const octaves = config.octaves ?? profile.octaves ?? 4;
    const persistence = config.persistence ?? profile.persistence ?? 0.5;
    const lacunarity = config.lacunarity ?? profile.lacunarity ?? 2.0;
    const minHeight = config.minHeight ?? profile.minHeight ?? -100;
    const maxHeight = config.maxHeight ?? profile.maxHeight ?? 100;
    const steps = config.steps ?? profile.steps ?? 1;
    const xSize = config.xSize ?? profile.xSize ?? 1024;
    const ySize = config.ySize ?? profile.ySize ?? 1024;
    const xSegments = config.size - 1;
    const ySegments = config.size - 1;
    const seed = Number.isFinite(config.seed)
      ? config.seed
      : Math.floor(Math.random() * 1_000_000);
    const generateBiomeMap =
      config.biomeMap !== undefined ? Boolean(config.biomeMap) : true;

    const methodMap: Record<string, string> = {
      "diamond-square": "DiamondSquare",
      diamondsquare: "DiamondSquare",
      fault: "Fault",
      perlin: "Perlin",
      simplex: "Simplex",
      hill: "Hill",
      value: "Value",
      worley: "Worley",
      voronoi: "Worley",
    };
    const methodName =
      methodMap[algorithm] ||
      algorithm.charAt(0).toUpperCase() + algorithm.slice(1);
    const terrainMethods = (runtimeTHREE as any).Terrain;
    const heightmapMethod = terrainMethods[methodName] || terrainMethods.Perlin;

    const prng = createSeededPRNG(seed);

    // Build options following the documented structure exactly
    const terrainOptions: any = {
      easing: terrainMethods.Linear ?? terrainMethods.EaseInOut ?? undefined,
      frequency: frequency,
      heightmap: heightmapMethod,
      material: new runtimeTHREE.MeshBasicMaterial({ color: 0x5566aa }),
      maxHeight: maxHeight,
      minHeight: minHeight,
      steps: steps,
      xSegments: xSegments,
      xSize: xSize,
      ySegments: ySegments,
      ySize: ySize,
      octaves,
      persistence,
      lacunarity,
      seed,
      random: prng,
    };

    // Call the documented factory: terrainScene = THREE.Terrain(options)
    const terrainFactory = terrainMethods as any;
    if (typeof terrainFactory !== "function") {
      return res.status(500).json({
        success: false,
        error:
          "THREE.Terrain present but not callable. Ensure you are using the UMD build that exposes THREE.Terrain as a function.",
      });
    }

    const terrainScene = terrainFactory(terrainOptions);

    if (
      !terrainScene ||
      !Array.isArray(terrainScene.children) ||
      terrainScene.children.length === 0
    ) {
      return res.status(500).json({
        success: false,
        error: "Terrain generation returned no children/mesh.",
      });
    }

    const mesh: any = terrainScene.children[0];
    if (
      !mesh.geometry ||
      !mesh.geometry.attributes ||
      !mesh.geometry.attributes.position
    ) {
      return res.status(500).json({
        success: false,
        error: "Terrain mesh geometry not found.",
      });
    }

    const positions = mesh.geometry.attributes.position.array as Float32Array;
    const sx = xSegments + 1;
    const sy = ySegments + 1;

    const heightmap: number[][] = new Array(sy);
    let minFound = Infinity;
    let maxFound = -Infinity;
    for (let y = 0; y < sy; y++) {
      heightmap[y] = new Array(sx);
      for (let x = 0; x < sx; x++) {
        const idx = (y * sx + x) * 3 + 2; // z component
        const h = positions[idx] ?? 0;
        heightmap[y][x] = h;
        if (h < minFound) minFound = h;
        if (h > maxFound) maxFound = h;
      }
    }

    const denom = maxFound - minFound || 1;
    const biomeMap: string[][] | undefined = generateBiomeMap
      ? new Array(sy)
      : undefined;
    if (biomeMap) {
      for (let y = 0; y < sy; y++) {
        biomeMap[y] = new Array(sx);
        for (let x = 0; x < sx; x++) {
          const normalized = (heightmap[y][x] - minFound) / denom;
          const biome = determineBiome(normalized, profile.biomes ?? []);
          biomeMap[y][x] = biome.name;
        }
      }
    }

    // Optionally scatter decorations if provided by the library (matches docs)
    if (typeof terrainMethods.ScatterMeshes === "function") {
      try {
        const decoMesh = new runtimeTHREE.Mesh(
          new runtimeTHREE.CylinderGeometry(2, 2, 12, 6),
        );
        const decoScene = terrainMethods.ScatterMeshes(mesh.geometry, {
          mesh: decoMesh,
          w: xSegments,
          h: ySegments,
          spread: 0.02,
          randomness: Math.random,
        });
        if (decoScene) terrainScene.add(decoScene);
      } catch {
        // non-fatal
      }
    }

    // Stats
    let total = 0;
    let cells = 0;
    const biomeCounts: Record<string, number> = {};
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        total += heightmap[y][x];
        cells++;
        if (biomeMap) {
          const b = biomeMap[y][x] || "unknown";
          biomeCounts[b] = (biomeCounts[b] || 0) + 1;
        }
      }
    }
    const avg = total / Math.max(1, cells);

    const result = {
      id: uuidv4(),
      chunkX: Number.isFinite(config.chunkX) ? config.chunkX : 0,
      chunkZ: Number.isFinite(config.chunkZ) ? config.chunkZ : 0,
      size: sx,
      heightmap,
      minHeight: minFound,
      maxHeight: maxFound,
      avgHeight: Number(avg.toFixed(2)),
      biomeMap,
      biomeCounts,
      seed,
      algorithm,
      profile: profileName,
      generatedAt: new Date().toISOString(),
    };

    return res.json({
      success: true,
      data: result,
      message: "Generated terrain using THREE.Terrain (doc-style invocation).",
    });
  } catch (error) {
    console.error("THREE.Terrain generation failed:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined,
    });
  }
}
