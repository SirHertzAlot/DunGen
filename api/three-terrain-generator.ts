import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as THREEImport from "three";
import * as TerrainModule from "@repcomm/three.terrain";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import logger from "../logging/logger";

/*
  three-terrain-generator.ts

  Notes on this revision:
  - Added extra compatibility attempts for heightmapArray calls (different call signatures)
  - Retains robust coercion logic and BufferGeometry fallbacks
  - Keeps debug forced on (debug = true)
  - All genLogger.error calls use signature: genLogger.error(message, ErrorObj, metadata)
*/

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
  steps?: number;
  xSize?: number;
  ySize?: number;
  biomes?: BiomeProfile[];
};

type TerrainConfig = { profiles: { [key: string]: TerrainProfile } };

const TERRAIN_CONFIG_PATH = path.join(process.cwd(), "config", "terrain-profiles.yaml");
let terrainConfigCache: TerrainConfig | null = null;

const genLogger = logger({ serviceName: "three-terrain-generator" });

function loadTerrainConfig(): TerrainConfig {
  if (terrainConfigCache) return terrainConfigCache;
  try {
    if (!fs.existsSync(TERRAIN_CONFIG_PATH)) throw new Error("not found");
    const raw = fs.readFileSync(TERRAIN_CONFIG_PATH, "utf8");
    const parsed = yaml.load(raw) as TerrainConfig | undefined;
    if (!parsed || !parsed.profiles) throw new Error("invalid config");
    terrainConfigCache = parsed;
    genLogger.info(`Loaded terrain config profiles: ${Object.keys(parsed.profiles).join(", ")}`);
    return terrainConfigCache;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    genLogger.warn(`Could not load ${TERRAIN_CONFIG_PATH}, using default profile. (${e.message})`);
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

function determineBiome(normalizedHeight: number, biomes: BiomeProfile[] = []): BiomeProfile {
  for (const b of biomes) {
    if (normalizedHeight >= b.heightRange[0] && normalizedHeight <= b.heightRange[1]) {
      return b;
    }
  }
  return biomes[biomes.length - 1] || { name: "unknown", heightRange: [0, 1], probability: 1 };
}

function transpose<T>(matrix: T[][]): T[][] {
  if (!Array.isArray(matrix) || matrix.length === 0) return matrix;
  return matrix[0].map((_, x) => matrix.map(row => row[x]));
}

function createSeededPRNG(seedValue: number) {
  let state = seedValue % 2147483647;
  if (state <= 0) state += 2147483646;
  return function seeded() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// Helper: type guard for array-like inputs (Array or typed array with numeric 'length')
function isArrayLike(a: any): a is { length: number } {
  return Array.isArray(a) || (ArrayBuffer.isView(a) && typeof (a as any).length === "number");
}

function reshape1DTo2D(arr: number[] | Float32Array, w: number, h: number): number[][] {
  if (!arr || (isArrayLike(arr) ? (arr as any).length !== w * h : true)) {
    throw new Error(`reshape1DTo2D: array length ${arr ? (isArrayLike(arr) ? (arr as any).length : "unknown") : "null"} != w*h (${w}*${h})`);
  }
  const out: number[][] = [];
  for (let y = 0; y < h; y++) {
    const base = y * w;
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(Number((arr as any)[base + x] ?? 0));
    }
    out.push(row);
  }
  return out;
}

// TS-safe inspectArrayStats: handles ArrayLike and generic Iterable without using `for..of` on Iterable
function inspectArrayStats(arr: Iterable<number> | ArrayLike<number>) {
  let min = Infinity, max = -Infinity, total = 0, n = 0;
  const sample: number[] = [];

  if (isArrayLike(arr)) {
    const len = (arr as any).length;
    for (let i = 0; i < len; i++) {
      const v = Number((arr as any)[i]);
      if (sample.length < 8) sample.push(v);
      if (!Number.isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
      total += v;
      n++;
    }
  } else {
    const iterFn = (arr as any)[Symbol.iterator];
    if (typeof iterFn === "function") {
      const it = iterFn.call(arr);
      while (true) {
        const next = it.next();
        if (next.done) break;
        const num = Number(next.value);
        if (sample.length < 8) sample.push(num);
        if (!Number.isFinite(num)) continue;
        min = Math.min(min, num);
        max = Math.max(max, num);
        total += num;
        n++;
      }
    } else {
      let idx = 0;
      while (true) {
        const val = (arr as any)[idx];
        if (typeof val === "undefined") break;
        const num = Number(val);
        if (sample.length < 8) sample.push(num);
        if (Number.isFinite(num)) {
          min = Math.min(min, num);
          max = Math.max(max, num);
          total += num;
          n++;
        }
        idx++;
      }
    }
  }

  const avg = n > 0 ? total / n : 0;
  return { min, max, avg, sample, count: n };
}

/**
 * Main HTTP handler for terrain generation.
 * POST body requires `size` number. Debug forced on.
 */
export async function generateThreeTerrain(req: Request, res: Response) {
  const THREE = Object.create(THREEImport);
  THREE.Terrain = (TerrainModule as any).Terrain || (TerrainModule as any).terrain || (TerrainModule as any).TerrainGenerator || TerrainModule.Terrain;
  (globalThis as any).THREE = THREE;

  try {
    const config = req.body || {};
    // DEBUG FORCED ON
    const debug = true;

    genLogger.info("Received terrain generation request", { config, debug });

    if (!config.size || typeof config.size !== "number") {
      genLogger.warn("Missing required parameter: size (number).", { config });
      return res.status(400).json({ success: false, error: "Missing required parameter: size (number)." });
    }

    const terrainMethods: any = TerrainModule;
    const terrainConfig = loadTerrainConfig();
    const profileName = config.configProfile || "default";
    const profile: TerrainProfile = terrainConfig.profiles[profileName] || terrainConfig.profiles["default"];

    const size = config.size;
    const xSegments = size - 1;
    const ySegments = size - 1;
    const sx = xSegments + 1;
    const sy = ySegments + 1;

    const algorithm = (config.algorithm || profile.algorithm || "perlin").toLowerCase();
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
      cosine: "Cosine",
    };
    const methodName = methodMap[algorithm] || algorithm.charAt(0).toUpperCase() + algorithm.slice(1);
    const heightmapMethod =
      terrainMethods[methodName] ||
      terrainMethods.Perlin ||
      terrainMethods.heightmap ||
      terrainMethods.generate;

    const frequency = config.frequency ?? profile.frequency ?? 2.5;
    const amplitude = config.amplitude ?? profile.amplitude ?? 1.0;
    const octaves = config.octaves ?? profile.octaves ?? 4;
    const persistence = config.persistence ?? profile.persistence ?? 0.5;
    const lacunarity = config.lacunarity ?? profile.lacunarity ?? 2.0;
    const minHeight = config.minHeight ?? profile.minHeight ?? -100;
    const maxHeight = config.maxHeight ?? profile.maxHeight ?? 100;
    const steps = config.steps ?? profile.steps ?? 1;
    const seed = Number.isFinite(config.seed) ? config.seed : Math.floor(Math.random() * 1_000_000);
    const prng = createSeededPRNG(seed);
    const generateBiomeMap = config.biomeMap !== undefined ? Boolean(config.biomeMap) : true;

    genLogger.info("Resolved generation params", { size, sx, sy, algorithm: methodName, frequency, octaves, seed });

    const meshOptions: any = {
      heightmap: heightmapMethod,
      frequency,
      amplitude,
      octaves,
      persistence,
      lacunarity,
      minHeight,
      maxHeight,
      steps,
      seed,
      random: prng,
      xSegments,
      ySegments,
      xSize: config.xSize ?? profile.xSize ?? 1024,
      ySize: config.ySize ?? profile.ySize ?? 1024,
      material: new THREE.MeshBasicMaterial({ color: 0x5566aa }),
      useBufferGeometry: true,
    };

    genLogger.info("Prepared meshOptions", { meshOptionsKeys: Object.keys(meshOptions) });

    // Attempt direct heightmap generation using terrainMethods.heightmapArray(...) with expanded call signatures
    let heightmap: number[][] | null = null;
    const diagnostics: any = { triedHeightmapArray: false, heightmapArrayResults: [] };

    if (typeof terrainMethods.heightmapArray === "function") {
      diagnostics.triedHeightmapArray = true;

      // candidate option shapes (existing)
      const candidateOptionVariants: any[] = [
        { ...meshOptions, w: sx, h: sy },
        { ...meshOptions, width: sx, height: sy },
        { ...meshOptions, xSegments, ySegments },
        { ...meshOptions, widthSegments: xSegments, heightSegments: ySegments },
        { ...meshOptions, w: sx, h: sy, sizeX: sx, sizeY: sy },
      ];

      // Attempt multiple call signatures for heightmapArray and common fallbacks:
      // 1) heightmapArray(methodFuncOrName, opts)
      // 2) heightmapArray(opts) -- some libs accept just opts
      // 3) heightmapArray(methodNameString, opts)
      // 4) call method directly: heightmapMethod(opts) or terrainMethods[methodName](opts)
      // This increases chance to match different library APIs.
      for (const opts of candidateOptionVariants) {
        const callAttempts: Array<{ name: string; fn: () => any }> = [];

        // Attempt: heightmapArray(methodFunc, opts)
        callAttempts.push({
          name: "heightmapArray(methodFunc, opts)",
          fn: () => terrainMethods.heightmapArray(heightmapMethod, opts),
        });
        // Attempt: heightmapArray(opts)
        callAttempts.push({
          name: "heightmapArray(opts)",
          fn: () => terrainMethods.heightmapArray(opts),
        });
        // Attempt: heightmapArray(methodNameString, opts)
        callAttempts.push({
          name: "heightmapArray(methodNameString, opts)",
          fn: () => terrainMethods.heightmapArray(methodName, opts),
        });
        // Attempt direct method call if heightmapMethod is a function: method(opts)
        if (typeof heightmapMethod === "function") {
          callAttempts.push({
            name: "direct method call heightmapMethod(opts)",
            fn: () => (heightmapMethod as Function)(opts),
          });
        }
        // Attempt terrainMethods[methodName](opts) if present
        if (typeof terrainMethods[methodName] === "function") {
          callAttempts.push({
            name: `terrainMethods[${methodName}](opts)`,
            fn: () => terrainMethods[methodName](opts),
          });
        }

        // Some libraries expect width/height order positional args: (w,h,opts)
        callAttempts.push({
          name: "methodPositional(width,height,opts) -> try terrainMethods[methodName]",
          fn: () => {
            const fn = terrainMethods[methodName] || heightmapMethod;
            if (typeof fn === "function") return (fn as Function)(sx, sy, opts);
            throw new Error("positional call not supported");
          },
        });

        // Run call attempts until one succeeds (doesn't throw and produces a non-falsy result)
        let lastError: any = null;
        for (const attempt of callAttempts) {
          try {
            genLogger.info("Trying direct heightmapArray/call variant", { variant: attempt.name, optsKeys: Object.keys(opts) });
            const arr: any = attempt.fn();

            if (!arr) {
              genLogger.warn("heightmap variant returned falsy", { variant: attempt.name, optsKeys: Object.keys(opts) });
              diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), result: "falsy" });
              lastError = new Error("falsy result");
              continue;
            }

            // Now handle produced arr same as before (1D, [x][y], xyz triplets, etc.)

            // 1D numeric array with length sx*sy
            if (isArrayLike(arr) && (arr as any).length === sx * sy) {
              let stats = inspectArrayStats(arr);
              genLogger.info("heightmap candidate produced 1D array", { variant: attempt.name, constructor: (arr as any).constructor?.name, length: (arr as any).length, stats });

              const len = (arr as any).length;
              let raw: number[] = [];

              if (stats.count > 0) {
                for (let i = 0; i < len; i++) raw.push(Number((arr as any)[i] ?? 0));
              } else {
                for (let i = 0; i < len; i++) {
                  const v = (arr as any)[i];
                  let n = 0;
                  if (v == null) {
                    n = 0;
                  } else if (typeof v === "number") {
                    n = v;
                  } else if (typeof v === "string") {
                    const p = parseFloat(v);
                    n = Number.isFinite(p) ? p : 0;
                  } else if (Array.isArray(v) && v.length >= 3) {
                    const p = Number(v[2]);
                    n = Number.isFinite(p) ? p : 0;
                  } else if (typeof v === "object") {
                    if ("z" in v) {
                      const p = Number((v as any).z);
                      n = Number.isFinite(p) ? p : 0;
                    } else if ("height" in v) {
                      const p = Number((v as any).height);
                      n = Number.isFinite(p) ? p : 0;
                    } else {
                      const p = Number((v as any).valueOf?.() ?? (v as any).toString?.());
                      n = Number.isFinite(p) ? p : 0;
                    }
                  } else {
                    n = 0;
                  }
                  raw.push(n);
                }
                stats = inspectArrayStats(raw);
                genLogger.info("Coerced heightmapArray elements to numeric", { variant: attempt.name, afterStats: stats });
              }

              // Auto-scale normalized arrays (0..1)
              if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max <= 1.0001 && stats.min >= -0.0001) {
                const range = (maxHeight - minHeight) || 1;
                for (let i = 0; i < raw.length; i++) raw[i] = minHeight + raw[i] * range;
                genLogger.info("Auto-scaled normalized heightmap values", { minHeight, maxHeight });
              }

              try {
                heightmap = reshape1DTo2D(raw, sx, sy);
                diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), shape: "1D", length: len });
              } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                genLogger.warn("Failed to reshape heightmap 1D to 2D", { variant: attempt.name, error: e.message });
                diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), error: e.message });
              }

              if (heightmap) break;
              // else continue trying other call variants
            }

            // 2D arrays: many libs return [x][y]
            if (Array.isArray(arr) && arr.length === sx && Array.isArray(arr[0]) && (arr[0].length === sy || arr[0].length === sx)) {
              genLogger.info("heightmap candidate produced [x][y] array; transposing", { variant: attempt.name });
              heightmap = transpose(arr as number[][]);
              diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), shape: "[x][y]" });
              if (heightmap) break;
            }

            // typed arrays with xyz triplets (length == sx*sy*3)
            if (isArrayLike(arr) && (arr as any).length === sx * sy * 3) {
              genLogger.info("heightmap candidate returned xyz triplets; extracting z", { variant: attempt.name });
              const zArr: number[] = [];
              const alen = (arr as any).length;
              for (let i = 0; i < alen; i += 3) zArr.push(Number((arr as any)[i + 2] ?? 0));
              const stats2 = inspectArrayStats(zArr);
              if (Number.isFinite(stats2.min) && Number.isFinite(stats2.max) && stats2.max <= 1.0001 && stats2.min >= -0.0001) {
                const range = (maxHeight - minHeight) || 1;
                for (let i = 0; i < zArr.length; i++) zArr[i] = minHeight + zArr[i] * range;
                genLogger.info("Auto-scaled normalized z-channel to minHeight/maxHeight", { minHeight, maxHeight });
              }
              try {
                heightmap = reshape1DTo2D(zArr, sx, sy);
                diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), shape: "xyz_triplets", length: (arr as any).length });
              } catch (err) {
                const e = err instanceof Error ? err : new Error(String(err));
                genLogger.warn("Failed to reshape xyz triplet z-channel to 2D", { variant: attempt.name, error: e.message });
                diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), error: e.message });
              }
              if (heightmap) break;
            }

            // Unexpected shape
            diagnostics.heightmapArrayResults.push({
              variant: attempt.name,
              opts: Object.keys(opts),
              shape: isArrayLike(arr) ? `array_len_${(arr as any).length}` : typeof arr,
              sample: Array.isArray(arr) ? (arr as any).slice(0, Math.min(10, (arr as any).length)) : undefined,
            });
            genLogger.warn("heightmapArray returned unexpected shape", { variant: attempt.name, info: diagnostics.heightmapArrayResults[diagnostics.heightmapArrayResults.length - 1] });

            // If any of above set heightmap, break outer attempts loops
            if (heightmap) break;
          } catch (err) {
            lastError = err;
            const errObj = err instanceof Error ? err : new Error(String(err));
            genLogger.warn("heightmapArray/call variant threw", { variant: attempt.name, error: errObj.message });
            diagnostics.heightmapArrayResults.push({ variant: attempt.name, opts: Object.keys(opts), error: errObj.message });
            // continue to next attempt
          }
        } // end callAttempts loop

        if (heightmap) break; // found a heightmap for this opts
      } // end candidateOptionVariants loop
    } else {
      diagnostics.heightmapArrayAvailable = false;
      genLogger.info("terrainMethods.heightmapArray is not available on this terrain module.");
    }

    // If direct heightmap was not created, fall back to generating the mesh and extracting positions
    if (!heightmap) {
      genLogger.info("Direct heightmap generation failed or not available; falling back to mesh generation and BufferGeometry extraction.", { debug });

      if (typeof THREE.Terrain !== "function") {
        const errObj = new Error("THREE.Terrain factory is not available in runtime.");
        genLogger.error("THREE.Terrain factory is not available in runtime.", errObj, { error: errObj.message, stack: errObj.stack });
        return res.status(500).json({ success: false, error: "THREE.Terrain factory is not available in this runtime.", diagnostics });
      }

      const terrainFactory = THREE.Terrain as any;
      let terrainScene: any;
      try {
        terrainScene = new terrainFactory(meshOptions);
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        genLogger.error("terrainFactory threw an error during construction", errObj, { error: errObj.message, stack: errObj.stack });
        return res.status(500).json({ success: false, error: "terrainFactory threw an error during construction", details: errObj.stack, diagnostics });
      }

      // Attempt to find Mesh within returned structure
      let mesh: any = undefined;
      if (terrainScene && terrainScene.type === "Mesh") {
        mesh = terrainScene;
      } else if (terrainScene && Array.isArray(terrainScene.children) && terrainScene.children.length > 0) {
        mesh = terrainScene.children.find((c: any) => c.type === "Mesh") || terrainScene.children[0];
      } else if (Array.isArray(terrainScene)) {
        mesh = terrainScene.find((c: any) => c.type === "Mesh") || terrainScene[0];
      } else {
        mesh = terrainScene;
      }

      genLogger.info("TerrainScene structure", {
        type: terrainScene?.type,
        keys: terrainScene ? Object.keys(terrainScene) : null,
        children: Array.isArray(terrainScene?.children) ? terrainScene.children.map((c: any) => c.type) : undefined,
        meshType: mesh?.type,
        meshKeys: mesh ? Object.keys(mesh) : null,
      });

      if (!mesh || !mesh.geometry) {
        const errObj = new Error("Terrain mesh geometry not found after mesh generation.");
        genLogger.error("Terrain mesh geometry not found after mesh generation.", errObj, { error: errObj.message, meshType: mesh?.type, meshKeys: mesh ? Object.keys(mesh) : null });
        return res.status(500).json({ success: false, error: "Terrain mesh geometry not found after mesh generation.", diagnostics });
      }

      const geom = mesh.geometry;
      genLogger.info("Mesh geometry structure", { meshGeometryType: geom.type, meshGeometryKeys: Object.keys(geom) });

      // BufferGeometry path (improved detection for itemSize 2 + separate height attribute)
      if (geom && geom.attributes && geom.attributes.position && geom.attributes.position.array) {
        try {
          const posAttr: any = geom.attributes.position;
          const positions = posAttr.array as any;
          const expectedVertexCount = sx * sy;
          let itemSize: number | undefined = typeof posAttr.itemSize === "number" ? posAttr.itemSize : undefined;

          const attrCount = typeof posAttr.count === "number" ? posAttr.count : (isArrayLike(positions) ? (positions as any).length / (itemSize || 3) : undefined);
          genLogger.info("Position attribute info", { itemSize, attrCount });

          // itemSize 3 -> extract z from position array
          if (itemSize === 3 || (itemSize === undefined && isArrayLike(positions) && (positions as any).length === expectedVertexCount * 3)) {
            const posLen = (positions as any).length;
            const expectedLen = expectedVertexCount * 3;
            if (posLen < expectedLen) genLogger.warn("Heightmap size mismatch", { expected: expectedLen, actual: posLen, chunkSize: size });
            const zArr: number[] = [];
            for (let y = 0; y < sy; y++) {
              for (let x = 0; x < sx; x++) {
                const idx = (y * sx + x) * 3 + 2;
                zArr.push(Number(positions[idx] ?? 0));
              }
            }
            const stats = inspectArrayStats(zArr);
            if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max <= 1.0001 && stats.min >= -0.0001) {
              const range = (maxHeight - minHeight) || 1;
              for (let i = 0; i < zArr.length; i++) zArr[i] = minHeight + zArr[i] * range;
              genLogger.info("Auto-scaled BufferGeometry-normalized heights to minHeight/maxHeight", { minHeight, maxHeight });
            }
            heightmap = reshape1DTo2D(zArr, sx, sy);
            genLogger.info("Extracted heightmap from BufferGeometry positions.");
          } else if (itemSize === 2 || (itemSize === undefined && isArrayLike(positions) && (positions as any).length === expectedVertexCount * 2)) {
            // Search for single-component attribute to use as z
            const attrKeys = Object.keys(geom.attributes);
            const candidateAttrs: { name: string; itemSize?: number; count?: number }[] = [];
            for (const k of attrKeys) {
              const a = (geom.attributes as any)[k];
              const aItemSize = typeof a.itemSize === "number" ? a.itemSize : undefined;
              const aCount = typeof a.count === "number" ? a.count : (isArrayLike(a.array) ? (a.array as any).length : undefined);
              candidateAttrs.push({ name: k, itemSize: aItemSize, count: aCount });
            }
            genLogger.info("Geometry attributes", { attributes: candidateAttrs });

            let zSource: { name: string; array: any } | null = null;
            for (const k of attrKeys) {
              if (k === "position") continue;
              const a = (geom.attributes as any)[k];
              const aItemSize = typeof a.itemSize === "number" ? a.itemSize : undefined;
              const aCount = typeof a.count === "number" ? a.count : (isArrayLike(a.array) ? (a.array as any).length : undefined);
              if ((aItemSize === 1 || aItemSize === undefined) && aCount === expectedVertexCount) {
                zSource = { name: k, array: a.array };
                break;
              }
            }

            if (!zSource) {
              const commonNames = ["height", "displacement", "z", "vertexZ", "positionZ"];
              for (const name of commonNames) {
                const a = (geom.attributes as any)[name];
                if (a && isArrayLike(a.array)) {
                  const aLen = typeof a.count === "number" ? a.count : (a.array as any).length;
                  if (aLen === expectedVertexCount) {
                    zSource = { name, array: a.array };
                    break;
                  }
                }
              }
            }

            if (zSource) {
              genLogger.info("Found separate z source attribute", { name: zSource.name });
              const zArr: number[] = [];
              for (let i = 0; i < expectedVertexCount; i++) zArr.push(Number(zSource.array[i] ?? 0));
              const stats = inspectArrayStats(zArr);
              if (Number.isFinite(stats.min) && Number.isFinite(stats.max) && stats.max <= 1.0001 && stats.min >= -0.0001) {
                const range = (maxHeight - minHeight) || 1;
                for (let i = 0; i < zArr.length; i++) zArr[i] = minHeight + zArr[i] * range;
                genLogger.info("Auto-scaled separate height attribute to minHeight/maxHeight", { minHeight, maxHeight });
              }
              heightmap = reshape1DTo2D(zArr, sx, sy);
              genLogger.info("Extracted heightmap from separate attribute.", { source: zSource.name });
            } else {
              const e = new Error("BufferGeometry position attribute contains only x,y and no separate height attribute was found.");
              const attrDiag = Object.keys(geom.attributes).map((k) => {
                const a = (geom.attributes as any)[k];
                return {
                  name: k,
                  itemSize: typeof a.itemSize === "number" ? a.itemSize : undefined,
                  count: typeof a.count === "number" ? a.count : (isArrayLike(a.array) ? (a.array as any).length : undefined),
                };
              });
              genLogger.error("Missing z data in geometry attributes", e, { error: e.message, attributes: attrDiag });
              diagnostics.geometryAttributes = attrDiag;
              return res.status(500).json({
                success: false,
                error: "Geometry contains only x,y positions and no height attribute could be located. Configure the generator to output z values in position or a separate single-component attribute (e.g., 'height' or 'displacement').",
                diagnostics,
              });
            }
          } else {
            const e = new Error("Unrecognized position attribute layout; cannot extract z.");
            const attrDiag = Object.keys(geom.attributes).map((k) => {
              const a = (geom.attributes as any)[k];
              return {
                name: k,
                itemSize: typeof a.itemSize === "number" ? a.itemSize : undefined,
                count: typeof a.count === "number" ? a.count : (isArrayLike(a.array) ? (a.array as any).length : undefined),
              };
            });
            genLogger.error("Unrecognized position attribute layout", e, { error: e.message, attributes: attrDiag });
            diagnostics.geometryAttributes = attrDiag;
            return res.status(500).json({
              success: false,
              error: "Unrecognized position attribute layout; cannot extract z values reliably.",
              diagnostics,
            });
          }
        } catch (err) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          genLogger.error("Failed extracting z values from BufferGeometry", errObj, { error: errObj.message, stack: errObj.stack });
          return res.status(500).json({ success: false, error: "Failed extracting z values from BufferGeometry", details: errObj.message, diagnostics });
        }
      } else if (geom && Array.isArray((geom as any).vertices)) {
        // Classic Geometry fallback
        const verts = (geom as any).vertices;
        genLogger.info("First 5 geometry vertices", { verts: verts.slice(0, 5) });
        const badVerts = verts.filter((v: any) => typeof v.z !== "number" || !isFinite(v.z)).length;
        if (badVerts === verts.length) {
          const errObj = new Error("Terrain generator returned classic geometry with no z heights (all z are null/undefined).");
          genLogger.error("Terrain generator returned classic geometry with no z heights (all z are null/undefined). Classic Geometry is unsupported for reliable extraction.", errObj, { error: errObj.message, sampleVerts: verts.slice(0, 5) });
          return res.status(500).json({
            success: false,
            error: "THREE.Terrain returned classic Geometry with no height data. Please configure your generator to produce BufferGeometry or ensure the heightmap is applied.",
            diagnostics: { first5: verts.slice(0, 5) },
          });
        }

        try {
          const zArr: number[] = [];
          for (let y = 0; y < sy; y++) {
            for (let x = 0; x < sx; x++) {
              const idx = y * sx + x;
              const v = verts[idx];
              const z = v && typeof v.z === "number" && isFinite(v.z) ? v.z : 0;
              zArr.push(z);
            }
          }
          if (zArr.length === sx * sy) {
            heightmap = reshape1DTo2D(zArr, sx, sy);
            genLogger.info("Built heightmap from classic Geometry vertices (best-effort).");
          } else {
            genLogger.warn("Could not infer grid layout from classic Geometry vertices", { builtLen: zArr.length, expected: sx * sy });
          }
        } catch (err) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          genLogger.error("Error building heightmap from classic Geometry", errObj, { error: errObj.message, stack: errObj.stack });
        }
      } else {
        const errObj = new Error("Mesh geometry neither BufferGeometry nor classic Geometry vertices are available for extraction.");
        genLogger.error("Mesh geometry neither BufferGeometry nor classic Geometry vertices are available for extraction.", errObj, { error: errObj.message });
      }
    } // end mesh fallback

    if (!heightmap) {
      const errObj = new Error("Unable to produce heightmap via any method. Returning diagnostics.");
      genLogger.error("Unable to produce heightmap via any method. Returning diagnostics.", errObj, { error: errObj.message, diagnostics });
      const payload: any = {
        success: false,
        error: "Unable to generate heightmap. Try forcing BufferGeometry in generator or ensure heightmapArray can be used (w/h options).",
        diagnostics,
      };
      return res.status(500).json(payload);
    }

    // Compute stats and guard against NaN/Infinity so min/max are always numbers
    let minFound = Infinity;
    let maxFound = -Infinity;
    let total = 0;
    let cells = 0;
    for (let y = 0; y < heightmap.length; y++) {
      for (let x = 0; x < heightmap[y].length; x++) {
        const h = Number(heightmap[y][x] ?? 0);
        if (h < minFound) minFound = h;
        if (h > maxFound) maxFound = h;
        total += h;
        cells++;
      }
    }

    if (!Number.isFinite(minFound)) minFound = 0;
    if (!Number.isFinite(maxFound)) maxFound = 0;

    const avg = total / Math.max(1, cells);
    const denom = maxFound - minFound || 1;

    // Biome map
    const biomes = profile.biomes ?? [];
    let biomeMap: string[][] | undefined;
    if (generateBiomeMap && biomes.length > 0) {
      biomeMap = new Array(sy);
      for (let y = 0; y < sy; y++) {
        biomeMap[y] = new Array(sx);
        for (let x = 0; x < sx; x++) {
          const normalized = (heightmap[y][x] - minFound) / denom;
          const biome = determineBiome(normalized, biomes);
          biomeMap[y][x] = biome.name;
        }
      }
    }

    const biomeCounts: Record<string, number> = {};
    if (biomeMap) {
      for (let y = 0; y < sy; y++) {
        for (let x = 0; x < sx; x++) {
          const b = biomeMap[y][x] || "unknown";
          biomeCounts[b] = (biomeCounts[b] || 0) + 1;
        }
      }
    }

    const result = {
      id: uuidv4(),
      chunkX: Number.isFinite(config.chunkX) ? config.chunkX : 0,
      chunkZ: Number.isFinite(config.chunkZ) ? config.chunkZ : 0,
      size: sx,
      heightmap,
      stats: {
        minHeight: minFound,
        maxHeight: maxFound,
        avgHeight: Number(avg.toFixed(2)),
        range: maxFound - minFound,
      },
      minHeight: minFound,
      maxHeight: maxFound,
      avgHeight: Number(avg.toFixed(2)),
      biomeMap,
      biomeCounts,
      seed,
      algorithm: methodName,
      profile: profileName,
      generatedAt: new Date().toISOString(),
    };

    genLogger.info("Terrain generated successfully", { resultId: result.id, algorithm: result.algorithm, profile: result.profile });

    const responsePayload: any = { success: true, data: result, message: "Generated terrain (direct heightmap or BufferGeometry)." };
    if (debug) responsePayload.diagnostics = diagnostics;
    return res.json(responsePayload);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    genLogger.error("THREE.Terrain generation failed", e, { error: e.message, stack: e.stack });
    return res.status(500).json({ success: false, error: e.message, details: e.stack });
  }
}