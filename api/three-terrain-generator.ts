import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';

// Import the THREE.Terrain library properly
const fs = require('fs');
const path = require('path');

// Load THREE.Terrain manually since it's a UMD module
const terrainPath = path.join(process.cwd(), 'node_modules/three.terrain.js/build/THREE.Terrain.js');
const terrainCode = fs.readFileSync(terrainPath, 'utf8');

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
}

export async function generateThreeTerrain(req: Request, res: Response) {
  try {
    const config: TerrainRequest = req.body;
    
    // Validate required parameters
    if (config.chunkX === undefined || config.chunkZ === undefined || !config.algorithm || !config.size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: chunkX, chunkZ, algorithm, size'
      });
    }

    console.log(`THREE.Terrain generation: ${config.algorithm} at (${config.chunkX}, ${config.chunkZ}) - Size: ${config.size}x${config.size}`);

    // Create geometry for terrain generation
    const geometry = new THREE.PlaneGeometry(
      100, 100, // xSize, ySize
      config.size - 1, config.size - 1 // xSegments, ySegments
    );

    // Set up options for THREE.Terrain
    const terrainOptions = {
      xSize: 100,
      ySize: 100,
      xSegments: config.size - 1,
      ySegments: config.size - 1,
      minHeight: config.minHeight || 0,
      maxHeight: config.maxHeight || 400,
      frequency: config.frequency || 0.01,
    };

    // Get the heightmap generation method
    let heightmapMethod;
    const algorithm = config.algorithm.toLowerCase();
    
    switch (algorithm) {
      case 'mountain':
      case 'hill':
        heightmapMethod = (THREE as any).Terrain.Hill;
        break;
      case 'diamondsquare':
      case 'diamond-square':
        heightmapMethod = (THREE as any).Terrain.DiamondSquare;
        break;
      case 'perlin':
        heightmapMethod = (THREE as any).Terrain.Perlin;
        break;
      case 'fault':
        heightmapMethod = (THREE as any).Terrain.Fault;
        break;
      case 'cosine':
        heightmapMethod = (THREE as any).Terrain.Cosine;
        break;
      default:
        heightmapMethod = (THREE as any).Terrain.DiamondSquare;
    }

    // Generate terrain using THREE.Terrain
    const vertices = geometry.attributes.position.array;
    
    // Call the actual THREE.Terrain method
    heightmapMethod(vertices, terrainOptions);

    // Convert the geometry vertices back to a 2D heightmap
    const heightmap: number[][] = [];
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    
    for (let y = 0; y < config.size; y++) {
      heightmap[y] = [];
      for (let x = 0; x < config.size; x++) {
        const index = (y * config.size + x) * 3 + 2; // Z coordinate
        const height = vertices[index] || 0;
        heightmap[y][x] = height;
        
        if (height < minHeight) minHeight = height;
        if (height > maxHeight) maxHeight = height;
      }
    }

    // Calculate statistics
    let totalHeight = 0;
    let totalCells = 0;
    
    for (let y = 0; y < config.size; y++) {
      for (let x = 0; x < config.size; x++) {
        totalHeight += heightmap[y][x];
        totalCells++;
      }
    }
    
    const avgHeight = totalHeight / totalCells;

    const result = {
      id: uuidv4(),
      x: config.chunkX,
      z: config.chunkZ,
      size: config.size,
      heightmap: heightmap,
      algorithm: config.algorithm,
      generated: true,
      lastAccessed: Date.now(),
      stats: {
        minHeight: minHeight,
        maxHeight: maxHeight,
        avgHeight: avgHeight.toFixed(2),
        range: maxHeight - minHeight
      }
    };
    
    console.log(`Generated ${config.algorithm} terrain using THREE.Terrain: Min=${minHeight.toFixed(1)}, Max=${maxHeight.toFixed(1)}, Range=${(maxHeight - minHeight).toFixed(1)}`);

    res.json({
      success: true,
      data: result,
      message: `Generated ${config.algorithm} terrain using THREE.Terrain library with height range ${minHeight.toFixed(1)} to ${maxHeight.toFixed(1)}`
    });
    
  } catch (error) {
    console.error('THREE.Terrain generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'THREE.Terrain generation failed',
      details: error instanceof Error ? error.stack : String(error)
    });
  }
}