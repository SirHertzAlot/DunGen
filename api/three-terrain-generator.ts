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

  Robust single-file terrain generation handler with fixes:
  - Safe checks for array-like objects (Array.isArray or ArrayBuffer.isView with length)
  - inspectArrayStats TS-safe iteration fix (manual iterator to avoid downlevelIteration)
  - Robust coercion for heightmapArray 1D results containing non-numeric entries
  - genLogger created with serviceName; ALL genLogger.error calls use signature:
      genLogger.error(message: string, errorObject: Error, metadata: Record<string, any>)
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

const TERRAIN_CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "terrain-profiles.yaml",
);
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
    genLogger.info(
      `Loaded terrain config profiles: ${Object.keys(parsed.profiles).join(", ")}`,
    );
    return terrainConfigCache;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    genLogger.warn(
      `Could not load ${TERRAIN_CONFIG_PATH}, using default profile. (${e.message})`,
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

function transpose<T>(matrix: T[][]): T[][] {
  if (!Array.isArray(matrix) || matrix.length === 0) return matrix;
  return matrix[0].map((_, x) => matrix.map((row) => row[x]));
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
  return (
    Array.isArray(a) ||
    (ArrayBuffer.isView(a) && typeof (a as any).length === "number")
  );
}

function reshape1DTo2D(
  arr: number[] | Float32Array,
  w: number,
  h: number,
): number[][] {
  if (!arr || (isArrayLike(arr) ? (arr as any).length !== w * h : true)) {
    throw new Error(
      `reshape1DTo2D: array length ${arr ? (isArrayLike(arr) ? (arr as any).length : "unknown") : "null"} != w*h (${w}*${h})`,
    );
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
  let min = Infinity,
    max = -Infinity,
    total = 0,
    n = 0;
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
    // Manual iterator loop to avoid requiring --downlevelIteration or ES2015 target
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
      // ultimate fallback: attempt numeric indexed access until undefined (best-effort)
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
 * POST body requires `size` number. Optional ?debug=true to include diagnostics.
 */
export async function generateThreeTerrain(req: Request, res: Response) {
  const THREE = Object.create(THREEImport);
  THREE.Terrain =
    (TerrainModule as any).Terrain ||
    (TerrainModule as any).terrain ||
    (TerrainModule as any).TerrainGenerator ||
    TerrainModule.Terrain;
  (globalThis as any).THREE = THREE;

  try {
    const config = req.body || {};
    const debug = req.query && String(req.query.debug) === "true";

    genLogger.info("Received terrain generation request", { config, debug });

    if (!config.size || typeof config.size !== "number") {
      genLogger.warn("Missing required parameter: size (number).", { config });
      return res
        .status(400)
        .json({
          success: false,
          error: "Missing required parameter: size (number).",
        });
    }

    const terrainMethods: any = TerrainModule;
    const terrainConfig = loadTerrainConfig();
    const profileName = config.configProfile || "default";
    const profile: TerrainProfile =
      terrainConfig.profiles[profileName] || terrainConfig.profiles["default"];

    const size = config.size;
    const xSegments = size - 1;
    const ySegments = size - 1;
    const sx = xSegments + 1;
    const sy = ySegments + 1;

    const algorithm = (
      config.algorithm ||
      profile.algorithm ||
      "perlin"
    ).toLowerCase();
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
    const methodName =
      methodMap[algorithm] ||
      algorithm.charAt(0).toUpperCase() + algorithm.slice(1);
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
    const seed = Number.isFinite(config.seed)
      ? config.seed
      : Math.floor(Math.random() * 1_000_000);
    const prng = createSeededPRNG(seed);
    const generateBiomeMap =
      config.biomeMap !== undefined ? Boolean(config.biomeMap) : true;

    genLogger.info("Resolved generation params", {
      size,
      sx,
      sy,
      algorithm: methodName,
      frequency,
      octaves,
      seed,
    });

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

    genLogger.info("Prepared meshOptions", {
      meshOptionsKeys: Object.keys(meshOptions),
    });

    // Attempt direct heightmap generation using terrainMethods.heightmapArray(...)
    let heightmap: number[][] | null = null;
    const diagnostics: any = {
      triedHeightmapArray: false,
      heightmapArrayResults: [],
    };

    if (typeof terrainMethods.heightmapArray === "function") {
      diagnostics.triedHeightmapArray = true;
      const candidateOptionVariants: any[] = [
        { ...meshOptions, w: sx, h: sy },
        { ...meshOptions, width: sx, height: sy },
        { ...meshOptions, xSegments, ySegments },
        { ...meshOptions, widthSegments: xSegments, heightSegments: ySegments },
        { ...meshOptions, w: sx, h: sy, sizeX: sx, sizeY: sy },
      ];

      for (const opts of candidateOptionVariants) {
        try {
          genLogger.info("Trying direct heightmapArray with option keys", {
            keys: Object.keys(opts),
          });
          const arr: any = terrainMethods.heightmapArray(heightmapMethod, opts);

          if (!arr) {
            genLogger.warn("heightmapArray returned falsy for opts", {
              optsKeys: Object.keys(opts),
            });
            diagnostics.heightmapArrayResults.push({
              opts: Object.keys(opts),
              result: "falsy",
            });
            continue;
          }

          /* Robust 1D array handling with coercion for non-numeric elements.
             This handles arrays of nulls, strings, objects with {z} or {height}, and triplets [x,y,z].
          */
          if (isArrayLike(arr) && (arr as any).length === sx * sy) {
            let stats = inspectArrayStats(arr);
            genLogger.info("heightmapArray produced 1D array", {
              length: (arr as any).length,
              constructor: (arr as any).constructor?.name,
              stats,
            });

            const len = (arr as any).length;
            let raw: number[] = [];

            if (stats.count > 0) {
              // fast numeric conversion when we already have numeric entries
              for (let i = 0; i < len; i++)
                raw.push(Number((arr as any)[i] ?? 0));
            } else {
              // robust coercion for each entry
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
                    const p = Number(
                      (v as any).valueOf?.() ?? (v as any).toString?.(),
                    );
                    n = Number.isFinite(p) ? p : 0;
                  }
                } else {
                  n = 0;
                }
                raw.push(n);
              }
              stats = inspectArrayStats(raw);
              genLogger.info("Coerced heightmapArray elements to numeric", {
                afterStats: stats,
              });
            }

            // Auto-scale normalized arrays (0..1) to minHeight..maxHeight using updated stats
            if (
              Number.isFinite(stats.min) &&
              Number.isFinite(stats.max) &&
              stats.max <= 1.0001 &&
              stats.min >= -0.0001
            ) {
              const range = maxHeight - minHeight || 1;
              for (let i = 0; i < raw.length; i++)
                raw[i] = minHeight + raw[i] * range;
              genLogger.info(
                "Auto-scaled normalized heightmapArray values to configured minHeight/maxHeight",
                { minHeight, maxHeight },
              );
            }

            try {
              heightmap = reshape1DTo2D(raw, sx, sy);
              diagnostics.heightmapArrayResults.push({
                opts: Object.keys(opts),
                shape: "1D",
                length: len,
              });
            } catch (err) {
              const errObj =
                err instanceof Error ? err : new Error(String(err));
              genLogger.warn("Failed to reshape heightmapArray 1D to 2D", {
                error: errObj.message,
              });
              diagnostics.heightmapArrayResults.push({
                opts: Object.keys(opts),
                error: errObj.message,
              });
            }

            if (heightmap) break;
            // otherwise continue trying other variants
          }

          // 2D arrays: many libs return [x][y]
          if (
            Array.isArray(arr) &&
            arr.length === sx &&
            Array.isArray(arr[0]) &&
            (arr[0].length === sy || arr[0].length === sx)
          ) {
            genLogger.info(
              "heightmapArray produced [x][y] array; transposing -> [y][x]",
            );
            heightmap = transpose(arr as number[][]);
            diagnostics.heightmapArrayResults.push({
              opts: Object.keys(opts),
              shape: "[x][y]",
            });
            break;
          }

          // typed arrays with xyz triplets (length == sx*sy*3)
          if (isArrayLike(arr) && (arr as any).length === sx * sy * 3) {
            genLogger.info(
              "heightmapArray returned xyz triplets; extracting z channel",
            );
            const zArr: number[] = [];
            const alen = (arr as any).length;
            for (let i = 0; i < alen; i += 3)
              zArr.push(Number((arr as any)[i + 2] ?? 0));
            const stats2 = inspectArrayStats(zArr);
            if (
              Number.isFinite(stats2.min) &&
              Number.isFinite(stats2.max) &&
              stats2.max <= 1.0001 &&
              stats2.min >= -0.0001
            ) {
              const range = maxHeight - minHeight || 1;
              for (let i = 0; i < zArr.length; i++)
                zArr[i] = minHeight + zArr[i] * range;
              genLogger.info(
                "Auto-scaled normalized z-channel to minHeight/maxHeight",
                { minHeight, maxHeight },
              );
            }
            try {
              heightmap = reshape1DTo2D(zArr, sx, sy);
              diagnostics.heightmapArrayResults.push({
                opts: Object.keys(opts),
                shape: "xyz_triplets",
                length: (arr as any).length,
              });
            } catch (err) {
              const errObj =
                err instanceof Error ? err : new Error(String(err));
              genLogger.warn("Failed to reshape xyz triplet z-channel to 2D", {
                error: errObj.message,
              });
              diagnostics.heightmapArrayResults.push({
                opts: Object.keys(opts),
                error: errObj.message,
              });
            }
            if (heightmap) break;
          }

          diagnostics.heightmapArrayResults.push({
            opts: Object.keys(opts),
            shape: isArrayLike(arr)
              ? `array_len_${(arr as any).length}`
              : typeof arr,
            sample: Array.isArray(arr)
              ? (arr as any).slice(0, Math.min(10, (arr as any).length))
              : undefined,
          });
          genLogger.warn("heightmapArray returned unexpected shape", {
            info: diagnostics.heightmapArrayResults[
              diagnostics.heightmapArrayResults.length - 1
            ],
          });
        } catch (err) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          diagnostics.heightmapArrayResults.push({
            opts: Object.keys(opts),
            error: errObj.message,
          });
          genLogger.warn("Failed to run heightmapArray variant", {
            error: errObj.message,
            optsKeys: Object.keys(opts),
          });
          // continue trying other variants
        }
      } // end for variants
    } else {
      diagnostics.heightmapArrayAvailable = false;
      genLogger.info(
        "terrainMethods.heightmapArray is not available on this terrain module.",
      );
    }

    // If direct heightmap was not created, fall back to generating the mesh and extracting positions
    if (!heightmap) {
      genLogger.info(
        "Direct heightmap generation failed or not available; falling back to mesh generation and BufferGeometry extraction.",
        { debug },
      );

      if (typeof THREE.Terrain !== "function") {
        const errObj = new Error(
          "THREE.Terrain factory is not available in runtime.",
        );
        genLogger.error(
          "THREE.Terrain factory is not available in runtime.",
          errObj,
          { error: errObj.message, stack: errObj.stack },
        );
        return res
          .status(500)
          .json({
            success: false,
            error: "THREE.Terrain factory is not available in this runtime.",
            diagnostics,
          });
      }

      const terrainFactory = THREE.Terrain as any;
      let terrainScene: any;
      try {
        terrainScene = new terrainFactory(meshOptions);
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        genLogger.error(
          "terrainFactory threw an error during construction",
          errObj,
          { error: errObj.message, stack: errObj.stack },
        );
        return res
          .status(500)
          .json({
            success: false,
            error: "terrainFactory threw an error during construction",
            details: errObj.stack,
            diagnostics,
          });
      }

      // Attempt to find Mesh within returned structure
      let mesh: any = undefined;
      if (terrainScene && terrainScene.type === "Mesh") {
        mesh = terrainScene;
      } else if (
        terrainScene &&
        Array.isArray(terrainScene.children) &&
        terrainScene.children.length > 0
      ) {
        mesh =
          terrainScene.children.find((c: any) => c.type === "Mesh") ||
          terrainScene.children[0];
      } else if (Array.isArray(terrainScene)) {
        mesh =
          terrainScene.find((c: any) => c.type === "Mesh") || terrainScene[0];
      } else {
        mesh = terrainScene;
      }

      genLogger.info("TerrainScene structure", {
        type: terrainScene?.type,
        keys: terrainScene ? Object.keys(terrainScene) : null,
        children: Array.isArray(terrainScene?.children)
          ? terrainScene.children.map((c: any) => c.type)
          : undefined,
        meshType: mesh?.type,
        meshKeys: mesh ? Object.keys(mesh) : null,
      });

      if (!mesh || !mesh.geometry) {
        const errObj = new Error(
          "Terrain mesh geometry not found after mesh generation.",
        );
        genLogger.error(
          "Terrain mesh geometry not found after mesh generation.",
          errObj,
          {
            error: errObj.message,
            meshType: mesh?.type,
            meshKeys: mesh ? Object.keys(mesh) : null,
          },
        );
        return res
          .status(500)
          .json({
            success: false,
            error: "Terrain mesh geometry not found after mesh generation.",
            diagnostics,
          });
      }

      const geom = mesh.geometry;
      genLogger.info("Mesh geometry structure", {
        meshGeometryType: geom.type,
        meshGeometryKeys: Object.keys(geom),
      });

      // BufferGeometry path
      if (
        geom &&
        geom.attributes &&
        geom.attributes.position &&
        geom.attributes.position.array
      ) {
        try {
          const positions = geom.attributes.position.array as any;
          const expectedLen = sx * sy * 3;
          const posLen = isArrayLike(positions)
            ? (positions as any).length
            : undefined;
          if (posLen !== undefined && posLen < expectedLen) {
            genLogger.warn("Heightmap size mismatch", {
              expected: expectedLen,
              actual: posLen,
              chunkSize: size,
            });
          }
          const zArr: number[] = [];
          if (posLen !== undefined) {
            for (let y = 0; y < sy; y++) {
              for (let x = 0; x < sx; x++) {
                const idx = (y * sx + x) * 3 + 2;
                zArr.push(Number(positions[idx] ?? 0));
              }
            }
          } else {
            // fallback: iterate by numeric indices until we collected sx*sy values (best-effort)
            let collected = 0;
            const bytes = (positions as any).byteLength ?? 0;
            for (let i = 2; collected < sx * sy && i < bytes; i += 3) {
              zArr.push(Number((positions as any)[i] ?? 0));
              collected++;
            }
          }
          if (zArr.length === sx * sy) {
            const stats = inspectArrayStats(zArr);
            if (
              Number.isFinite(stats.min) &&
              Number.isFinite(stats.max) &&
              stats.max <= 1.0001 &&
              stats.min >= -0.0001
            ) {
              const range = maxHeight - minHeight || 1;
              for (let i = 0; i < zArr.length; i++)
                zArr[i] = minHeight + zArr[i] * range;
              genLogger.info(
                "Auto-scaled BufferGeometry-normalized heights to minHeight/maxHeight",
                { minHeight, maxHeight },
              );
            }
            heightmap = reshape1DTo2D(zArr, sx, sy);
            genLogger.info(
              "Extracted heightmap from BufferGeometry positions.",
            );
          } else {
            genLogger.warn(
              "Extracted z array length doesn't match expected dims",
              { got: zArr.length, expected: sx * sy },
            );
          }
        } catch (err) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          genLogger.error(
            "Failed extracting z values from BufferGeometry",
            errObj,
            { error: errObj.message, stack: errObj.stack },
          );
        }
      } else if (geom && Array.isArray((geom as any).vertices)) {
        const verts = (geom as any).vertices;
        genLogger.info("First 5 geometry vertices", {
          verts: verts.slice(0, 5),
        });
        const badVerts = verts.filter(
          (v: any) => typeof v.z !== "number" || !isFinite(v.z),
        ).length;
        if (badVerts === verts.length) {
          const errObj = new Error(
            "Terrain generator returned classic geometry with no z heights (all z are null/undefined).",
          );
          genLogger.error(
            "Terrain generator returned classic geometry with no z heights (all z are null/undefined). Classic Geometry is unsupported for reliable extraction.",
            errObj,
            { error: errObj.message, sampleVerts: verts.slice(0, 5) },
          );
          return res.status(500).json({
            success: false,
            error:
              "THREE.Terrain returned classic Geometry with no height data. Please configure your generator to produce BufferGeometry or ensure the heightmap is applied.",
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
            genLogger.info(
              "Built heightmap from classic Geometry vertices (best-effort).",
            );
          } else {
            genLogger.warn(
              "Could not infer grid layout from classic Geometry vertices",
              { builtLen: zArr.length, expected: sx * sy },
            );
          }
        } catch (err) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          genLogger.error(
            "Error building heightmap from classic Geometry",
            errObj,
            { error: errObj.message, stack: errObj.stack },
          );
        }
      } else {
        const errObj = new Error(
          "Mesh geometry neither BufferGeometry nor classic Geometry vertices are available for extraction.",
        );
        genLogger.error(
          "Mesh geometry neither BufferGeometry nor classic Geometry vertices are available for extraction.",
          errObj,
          { error: errObj.message },
        );
      }
    } // end mesh fallback

    if (!heightmap) {
      const errObj = new Error(
        "Unable to produce heightmap via any method. Returning diagnostics.",
      );
      genLogger.error(
        "Unable to produce heightmap via any method. Returning diagnostics.",
        errObj,
        { error: errObj.message, diagnostics },
      );
      const payload: any = {
        success: false,
        error:
          "Unable to generate heightmap. Try forcing BufferGeometry in generator or ensure heightmapArray can be used (w/h options).",
        diagnostics,
      };
      if (debug) payload.terrainModuleKeys = Object.keys(terrainMethods);
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

    genLogger.info("Terrain generated successfully", {
      resultId: result.id,
      algorithm: result.algorithm,
      profile: result.profile,
    });

    const responsePayload: any = {
      success: true,
      data: result,
      message: "Generated terrain (direct heightmap or BufferGeometry).",
    };
    if (debug) responsePayload.diagnostics = diagnostics;
    return res.json(responsePayload);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    genLogger.error("THREE.Terrain generation failed", e, {
      error: e.message,
      stack: e.stack,
    });
    return res
      .status(500)
      .json({ success: false, error: e.message, details: e.stack });
  }
}
