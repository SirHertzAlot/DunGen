import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Swords, Users, Zap, Navigation } from "lucide-react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 3D World Viewer for D&D MMORPG
export default function WorldViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const entitiesRef = useRef<Map<string, any>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [ecsStatus, setEcsStatus] = useState<any>(null);
  const [characterName, setCharacterName] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const queryClient = new QueryClient();

  // Load tiled terrain chunks with perfect edge matching
  // Utility: Seeded RNG (Mulberry32)
  function mulberry32(a: number) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const loadTerrainChunks = async (scene: any, THREE: any, seed: number) => {
    const baseChunkSize = 64; // local plane units
    const terrainScale = 4.0; // scales plane to world
    const heightScale = 50.0; // vertical exaggeration
    const segments = 63; // segments per side (=> 64 verts per side)
    const vertsPerSide = segments + 1;
    const chunkWorldSize = baseChunkSize * terrainScale; // 256 world units

    // Remove any previously generated terrain to avoid stacking on re-generation
    for (let i = scene.children.length - 1; i >= 0; i--) {
      const obj = scene.children[i];
      if (obj?.userData?.isTerrain) {
        scene.remove(obj);
      }
    }

    // Build centered grid using the actual chunk world size for spacing
    function generateTileGrid(size: number, tileSize: number) {
      const tilesPerSide = Math.max(1, Math.floor(size / tileSize));
      const usedSize = tilesPerSide * tileSize;
      const start = -usedSize / 2 + tileSize / 2;
      const coordinates: Array<{ x: number; z: number; i: number; j: number }> =
        [];
      for (let i = 0; i < tilesPerSide; i++) {
        for (let j = 0; j < tilesPerSide; j++) {
          const x = start + i * tileSize;
          const z = start + j * tileSize;
          coordinates.push({ x, z, i, j });
        }
      }
      return { coordinates, tilesPerSide, usedSize };
    }

    // Index helpers
    const idxPosZ = (row: number, col: number) =>
      (row * vertsPerSide + col) * 3 + 2; // height (Z before rotation)
    const idxNorm = (row: number, col: number) =>
      (row * vertsPerSide + col) * 3; // start index for normal vector

    // Normalize utility
    function normalize3(out: Float32Array, idx: number) {
      const x = out[idx],
        y = out[idx + 1],
        z = out[idx + 2];
      const len = Math.hypot(x, y, z) || 1;
      out[idx] = x / len;
      out[idx + 1] = y / len;
      out[idx + 2] = z / len;
    }

    // Weld shared edges so vertices match PERFECTLY, then weld normals to remove shading seams
    function weldEdgesAndNormalsPerfect(chunkMap: Map<string, any>) {
      const key = (i: number, j: number) => `${i},${j}`;

      // First pass: copy positions from canonical sides to neighbors
      // Rule: east edge of (i,j) overwrites west edge of (i+1,j)
      //       north edge of (i,j) overwrites south edge of (i,j+1)
      chunkMap.forEach((mesh: any, k: string) => {
        const [iStr, jStr] = k.split(",");
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);

        const curPos = mesh.geometry.attributes.position.array as Float32Array;

        // East neighbor
        const right = chunkMap.get(key(i + 1, j));
        if (right) {
          const rightPos = right.geometry.attributes.position
            .array as Float32Array;
          for (let r = 0; r < vertsPerSide; r++) {
            const li = idxPosZ(r, vertsPerSide - 1);
            const ri = idxPosZ(r, 0);
            rightPos[ri] = curPos[li];
          }
          right.geometry.attributes.position.needsUpdate = true;
        }

        // North neighbor
        const top = chunkMap.get(key(i, j + 1));
        if (top) {
          const topPos = top.geometry.attributes.position.array as Float32Array;
          for (let c = 0; c < vertsPerSide; c++) {
            const bi = idxPosZ(vertsPerSide - 1, c);
            const ti = idxPosZ(0, c);
            topPos[ti] = curPos[bi];
          }
          top.geometry.attributes.position.needsUpdate = true;
        }

        // Corner normalization (copy from current NE corner)
        const rightTop = chunkMap.get(key(i + 1, j + 1));
        if (right && top && rightTop) {
          const rightPos = right.geometry.attributes.position
            .array as Float32Array;
          const topPos = top.geometry.attributes.position.array as Float32Array;
          const rtPos = rightTop.geometry.attributes.position
            .array as Float32Array;

          const curNE = idxPosZ(vertsPerSide - 1, vertsPerSide - 1);
          const rNW = idxPosZ(vertsPerSide - 1, 0);
          const tSE = idxPosZ(0, vertsPerSide - 1);
          const rtSW = idxPosZ(0, 0);

          const h = curPos[curNE];
          rightPos[rNW] = h;
          topPos[tSE] = h;
          rtPos[rtSW] = h;

          right.geometry.attributes.position.needsUpdate = true;
          top.geometry.attributes.position.needsUpdate = true;
          rightTop.geometry.attributes.position.needsUpdate = true;
        }
      });

      // Recompute normals after final positions
      chunkMap.forEach((m) => {
        m.geometry.computeVertexNormals();
      });

      // Second pass: weld normals by averaging across shared edges (prevents lighting seams)
      chunkMap.forEach((mesh: any, k: string) => {
        const [iStr, jStr] = k.split(",");
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);

        const curNorm = mesh.geometry.attributes.normal.array as Float32Array;

        // East neighbor
        const right = chunkMap.get(`${i + 1},${j}`);
        if (right) {
          const rNorm = right.geometry.attributes.normal.array as Float32Array;
          for (let r = 0; r < vertsPerSide; r++) {
            const lni = idxNorm(r, vertsPerSide - 1);
            const rni = idxNorm(r, 0);
            // average
            const ax = (curNorm[lni] + rNorm[rni]) * 0.5;
            const ay = (curNorm[lni + 1] + rNorm[rni + 1]) * 0.5;
            const az = (curNorm[lni + 2] + rNorm[rni + 2]) * 0.5;
            curNorm[lni] = ax;
            curNorm[lni + 1] = ay;
            curNorm[lni + 2] = az;
            rNorm[rni] = ax;
            rNorm[rni + 1] = ay;
            rNorm[rni + 2] = az;
            normalize3(curNorm, lni);
            normalize3(rNorm, rni);
          }
          mesh.geometry.attributes.normal.needsUpdate = true;
          right.geometry.attributes.normal.needsUpdate = true;
        }

        // North neighbor
        const top = chunkMap.get(`${i},${j + 1}`);
        if (top) {
          const tNorm = top.geometry.attributes.normal.array as Float32Array;
          for (let c = 0; c < vertsPerSide; c++) {
            const bni = idxNorm(vertsPerSide - 1, c);
            const tni = idxNorm(0, c);
            const ax = (curNorm[bni] + tNorm[tni]) * 0.5;
            const ay = (curNorm[bni + 1] + tNorm[tni + 1]) * 0.5;
            const az = (curNorm[bni + 2] + tNorm[tni + 2]) * 0.5;
            curNorm[bni] = ax;
            curNorm[bni + 1] = ay;
            curNorm[bni + 2] = az;
            tNorm[tni] = ax;
            tNorm[tni + 1] = ay;
            tNorm[tni + 2] = az;
            normalize3(curNorm, bni);
            normalize3(tNorm, tni);
          }
          mesh.geometry.attributes.normal.needsUpdate = true;
          top.geometry.attributes.normal.needsUpdate = true;
        }

        // Corner: average normals of the 4 chunks meeting at NE corner of (i,j)
        const rightTop = chunkMap.get(`${i + 1},${j + 1}`);
        const rightNeighbor = chunkMap.get(`${i + 1},${j}`);
        const topNeighbor = chunkMap.get(`${i},${j + 1}`);
        if (rightNeighbor && topNeighbor && rightTop) {
          const rn = rightNeighbor.geometry.attributes.normal
            .array as Float32Array;
          const tn = topNeighbor.geometry.attributes.normal
            .array as Float32Array;
          const rtn = rightTop.geometry.attributes.normal.array as Float32Array;

          const curNE = idxNorm(vertsPerSide - 1, vertsPerSide - 1);
          const rNW = idxNorm(vertsPerSide - 1, 0);
          const tSE = idxNorm(0, vertsPerSide - 1);
          const rtSW = idxNorm(0, 0);

          const ax = (curNorm[curNE] + rn[rNW] + tn[tSE] + rtn[rtSW]) * 0.25;
          const ay =
            (curNorm[curNE + 1] + rn[rNW + 1] + tn[tSE + 1] + rtn[rtSW + 1]) *
            0.25;
          const az =
            (curNorm[curNE + 2] + rn[rNW + 2] + tn[tSE + 2] + rtn[rtSW + 2]) *
            0.25;

          curNorm[curNE] = ax;
          curNorm[curNE + 1] = ay;
          curNorm[curNE + 2] = az;
          rn[rNW] = ax;
          rn[rNW + 1] = ay;
          rn[rNW + 2] = az;
          tn[tSE] = ax;
          tn[tSE + 1] = ay;
          tn[tSE + 2] = az;
          rtn[rtSW] = ax;
          rtn[rtSW + 1] = ay;
          rtn[rtSW + 2] = az;

          normalize3(curNorm, curNE);
          normalize3(rn, rNW);
          normalize3(tn, tSE);
          normalize3(rtn, rtSW);

          mesh.geometry.attributes.normal.needsUpdate = true;
          rightNeighbor.geometry.attributes.normal.needsUpdate = true;
          topNeighbor.geometry.attributes.normal.needsUpdate = true;
          rightTop.geometry.attributes.normal.needsUpdate = true;
        }
      });
    }

    const gridSize = 2000; // target world area to fill
    const { coordinates: chunkCoords, usedSize } = generateTileGrid(
      gridSize,
      chunkWorldSize,
    );

    // Track chunks for welding after all are created
    const chunkMap = new Map<string, any>();
    const meshPromises: Promise<void>[] = [];

    for (const coord of chunkCoords) {
      const { x, z, i, j } = coord;
      const key = `${i},${j}`;

      const p = (async () => {
        try {
          // API expects chunk indices (i, j) and now a seed!
          const response = await fetch(`/api/worldgen/chunk/${i}/${j}?seed=${seed}`);
          const data = await response.json();

          if (data.success && data.data.heightmap) {
            const heightmap2D = data.data.heightmap as number[][];
            const biomes = data.data.biomes || [];

            const geometry = new THREE.PlaneGeometry(
              chunkWorldSize,
              chunkWorldSize,
              segments,
              segments,
            );

            const pos = geometry.attributes.position.array as Float32Array;

            if (
              heightmap2D &&
              heightmap2D.length > 0 &&
              heightmap2D[0] &&
              heightmap2D[0].length > 0
            ) {
              const heightmapRows = heightmap2D.length;
              const heightmapCols = heightmap2D[0].length;

            for (let vi = 2; vi < pos.length; vi += 3) {
              const vertexIndex = (vi - 2) / 3;
              const row = Math.floor(vertexIndex / vertsPerSide);
              const col = vertexIndex % vertsPerSide;

              const hr = Math.floor((row / (vertsPerSide - 1)) * (heightmapRows - 1));
              const hc = Math.floor((col / (vertsPerSide - 1)) * (heightmapCols - 1));

              const noiseValue = heightmap2D[hr]?.[hc] ?? 0;
              
              // Algorithm's height calculation for the 3D mesh:
              // We map the noiseValue directly to height using vertical exaggeration
              pos[vi] = noiseValue * heightScale;
            }
            } else {
              // Deterministic world-space fallback so edges align between chunks
              // Add seeded randomness for fallback!
              const rand = mulberry32(seed + i * 1000 + j); // Vary per chunk!
              for (let vi = 0; vi < pos.length; vi += 3) {
                const localX = pos[vi + 0]; // [-chunkWorldSize/2, +chunkWorldSize/2]
                const localY = pos[vi + 1]; // plane's second horizontal axis before rotation
                const worldX = localX + x;
                const worldZ = localY + z;

                let h = 0;
                h += Math.sin(worldX * 0.02) * Math.cos(worldZ * 0.02) * 8;
                h += Math.sin(worldX * 0.05) * Math.cos(worldZ * 0.05) * 4;
                h += Math.sin(worldX * 0.1) * Math.cos(worldZ * 0.1) * 2;
                h += Math.sin(worldX * 0.2) * Math.cos(worldZ * 0.15) * 1;

                // Add seeded noise for variety
                h += (rand() - 0.5) * 2; // Range [-1, 1]

                pos[vi + 2] = h; // set Z component as height (before rotation)
              }
            }

            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();

            const biome = (biomes[0] || { type: "grassland" }) as {
              type: string;
            };
            const colorByBiome: Record<string, number> = {
              desert: 0xf4e4bc,
              forest: 0x0f5132,
              mountain: 0x8b7355,
              tundra: 0xe6e6fa,
              swamp: 0x556b2f,
              grassland: 0x228b22,
            };

            const material = new THREE.MeshLambertMaterial({
              color: colorByBiome[biome.type] ?? 0x228b22,
              wireframe: false,
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, 0, z); // center of this chunk in world space
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            mesh.userData.isTerrain = true;
            mesh.userData.gridIndex = { i, j };

            scene.add(mesh);
            chunkMap.set(key, mesh);

            console.log(
              `Loaded terrain chunk index (${i}, ${j}) at world (${x.toFixed(
                1,
              )}, ${z.toFixed(1)}) with biome: ${biome.type || "grassland"}`,
            );
          } else {
            console.warn(
              `Failed to load terrain chunk (${i}, ${j}):`,
              data.error,
            );
          }
        } catch (error) {
          console.error(`Error loading terrain chunk (${i}, ${j}):`, error);
        }
      })();

      meshPromises.push(p);
    }

    // Wait for all chunks, then weld borders and normals for seamless fit
    await Promise.all(meshPromises);
    weldEdgesAndNormalsPerfect(chunkMap);

    // Add grid helper once, sized to the used grid
    const existingGrid = scene.children.find(
      (c: any) => c.type === "GridHelper",
    );
    if (!existingGrid) {
      const divisions = Math.max(10, Math.floor(usedSize / 50));
      const gridHelper = new THREE.GridHelper(
        usedSize,
        divisions,
        0x444444,
        0x444444,
      );
      gridHelper.position.y = 0.1;
      scene.add(gridHelper);
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    const initThreeJS = async () => {
      try {
        const THREE = await import("three");
        if (!canvasRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Sky blue
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
          75,
          window.innerWidth / window.innerHeight,
          0.1,
          2000,
        );
        camera.position.set(100, 60, 100);
        camera.lookAt(0, 10, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          antialias: true,
        });
        renderer.setSize(window.innerWidth * 0.7, window.innerHeight * 0.7);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;

        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);

        await loadTerrainChunks(scene, THREE);

        const controls = new (
          await import("three/examples/jsm/controls/OrbitControls.js")
        ).OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const animate = () => {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        setIsInitialized(true);

        toast({
          title: "3D World Initialized",
          description: "D&D battle grid ready for testing",
        });
      } catch (error) {
        console.error("Failed to initialize 3D world:", error);
        toast({
          title: "3D Initialization Failed",
          description: "Could not load Three.js components",
          variant: "destructive",
        });
      }
    };

    initThreeJS();

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Connect to ECS backend
  useEffect(() => {
    const connectToECS = async () => {
      try {
        const response = await fetch("/api/ecs/status");
        const data = await response.json();
        setEcsStatus(data.data);
        setIsConnected(true);
      } catch (error) {
        console.error("Failed to connect to ECS:", error);
        setIsConnected(false);
      }
    };

    connectToECS();
    const interval = setInterval(connectToECS, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Create 3D entity representation
  const createEntityMesh = async (entity: any) => {
    const THREE = await import("three");

    let geometry, material, mesh;

    if (entity.type === "PlayerCharacter") {
      geometry = new THREE.CylinderGeometry(1, 1, 3, 8);
      material = new THREE.MeshLambertMaterial({ color: 0x4169e1 });
      mesh = new THREE.Mesh(geometry, material);

      // Add nameplate
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      canvas.width = 256;
      canvas.height = 64;
      context.fillStyle = "white";
      context.fillRect(0, 0, 256, 64);
      context.fillStyle = "black";
      context.font = "20px Arial";
      context.textAlign = "center";
      context.fillText(entity.characterName || "Player", 128, 35);

      const nameTexture = new THREE.CanvasTexture(canvas);
      const nameMaterial = new THREE.MeshBasicMaterial({ map: nameTexture });
      const nameGeometry = new THREE.PlaneGeometry(4, 1);
      const nameplate = new THREE.Mesh(nameGeometry, nameMaterial);
      nameplate.position.y = 4;
      mesh.add(nameplate);
    } else if (entity.type === "NPC") {
      geometry = new THREE.CylinderGeometry(0.8, 0.8, 2.5, 8);
      const color = entity.faction === "hostile" ? 0xff4500 : 0x32cd32;
      material = new THREE.MeshLambertMaterial({ color });
      mesh = new THREE.Mesh(geometry, material);
    } else {
      geometry = new THREE.BoxGeometry(1, 1, 1);
      material = new THREE.MeshLambertMaterial({ color: 0x808080 });
      mesh = new THREE.Mesh(geometry, material);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { entityId: entity.id, entityData: entity };

    return mesh;
  };

  // Update entity positions from ECS data
  const updateEntities = async (entitiesData: any[]) => {
    if (!sceneRef.current || !isInitialized) return;

    await import("three"); // keep dynamic import pattern consistent
    const scene = sceneRef.current;

    // Remove entities that no longer exist
    entitiesRef.current.forEach((mesh, entityId) => {
      if (!entitiesData.find((e) => e.id === entityId)) {
        scene.remove(mesh);
        entitiesRef.current.delete(entityId);
      }
    });

    // Add or update entities
    for (const entityData of entitiesData) {
      let mesh = entitiesRef.current.get(entityData.id);

      if (!mesh) {
        // Create new entity mesh
        mesh = await createEntityMesh(entityData);
        scene.add(mesh);
        entitiesRef.current.set(entityData.id, mesh);
      }

      // Update position from transform component
      if (entityData.components?.Transform) {
        const pos = entityData.components.Transform.position;
        mesh.position.set(pos.x, pos.y + 1.5, pos.z);
      }

      // Update health indicator
      if (entityData.components?.Health) {
        const health = entityData.components.Health;
        const healthPercent = health.currentHealth / health.maxHealth;

        if (mesh.material) {
          const baseColor =
            entityData.type === "PlayerCharacter"
              ? 0x4169e1
              : entityData.faction === "hostile"
                ? 0xff4500
                : 0x32cd32;

          if (healthPercent < 0.3) {
            mesh.material.color.setHex(0xff0000);
          } else if (healthPercent < 0.6) {
            mesh.material.color.setHex(0xffff00);
          } else {
            mesh.material.color.setHex(baseColor);
          }
        }
      }

      mesh.userData.entityData = entityData;
    }
  };

  // Create new character
  const createCharacter = async () => {
    if (!characterName.trim()) {
      toast({
        title: "Missing Character Name",
        description: "Please enter a character name",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/ecs/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: `player-${Date.now()}`,
          characterName: characterName.trim(),
          position: {
            x: Math.random() * 20 - 10,
            y: 0,
            z: Math.random() * 20 - 10,
          },
          characterClass: "fighter",
          race: "human",
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Character Created",
          description: `${characterName} spawned in the world`,
        });
        setCharacterName("");

        const newEntity = {
          id: data.data.entityId,
          type: "PlayerCharacter",
          characterName: characterName.trim(),
          playerId: data.data.playerId,
          components: {
            Transform: {
              position: {
                x: Math.random() * 20 - 10,
                y: 0,
                z: Math.random() * 20 - 10,
              },
            },
            Health: { currentHealth: 100, maxHealth: 100 },
          },
        };

        setEntities((prev) => [...prev, newEntity]);
        await updateEntities([...entities, newEntity]);
      } else {
        toast({
          title: "Creation Failed",
          description: data.error || "Could not create character",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Network Error",
        description: "Could not connect to game server",
        variant: "destructive",
      });
    }
  };

  // Spawn test NPC
  const spawnNPC = async () => {
    try {
      const npcTypes = ["goblin", "orc", "skeleton", "wolf"];
      const npcType = npcTypes[Math.floor(Math.random() * npcTypes.length)];

      const response = await fetch("/api/ecs/create-npc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npcType,
          challengeRating: Math.floor(Math.random() * 3) + 1,
          position: {
            x: Math.random() * 30 - 15,
            y: 0,
            z: Math.random() * 30 - 15,
          },
          faction: Math.random() > 0.5 ? "hostile" : "neutral",
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "NPC Spawned",
          description: `${npcType} appeared in the world`,
        });
      }
    } catch (error) {
      toast({
        title: "Spawn Failed",
        description: "Could not spawn NPC",
        variant: "destructive",
      });
    }
  };

  // Handle mouse clicks on entities
  useEffect(() => {
    const handleClick = async (event: MouseEvent) => {
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current)
        return;

      const THREE = await import("three");
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(
        sceneRef.current.children,
        true,
      );

      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData.entityId) {
          setSelectedEntity(object.userData.entityId);
          toast({
            title: "Entity Selected",
            description: `Selected: ${object.userData.entityData?.characterName || object.userData.entityData?.npcType || "Entity"}`,
          });
        }
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("click", handleClick);
      return () => canvas.removeEventListener("click", handleClick);
    }
  }, [isInitialized]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">
              D&D MMORPG - Dynamic Terrain Viewer
            </h1>
            <Badge variant={isConnected ? "default" : "destructive"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {/* Character creation controls */}
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Character name..."
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="w-40"
              onKeyPress={(e) => e.key === "Enter" && createCharacter()}
            />
            <Button onClick={createCharacter} size="sm">
              <Users className="w-4 h-4 mr-2" />
              Create Character
            </Button>
            <Button onClick={spawnNPC} variant="outline" size="sm">
              <Swords className="w-4 h-4 mr-2" />
              Spawn NPC
            </Button>
          </div>
          <div className="flex space-x-2">
            <Link href="/terrain-designer">
              <Button size="sm">Terrain Designer</Button>
            </Link>
            <Link href="/heightmap-viewer">
              <Button size="sm">Heightmap Viewer</Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-1">
          {/* 3D Viewport */}
          <div className="flex-1 bg-black">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              style={{ maxHeight: "70vh" }}
            />

            {!isInitialized && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
                  <p>Loading 3D World...</p>
                </div>
              </div>
            )}
          </div>

          {/* Side Panel */}
          <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
            {/* ECS Status */}
            <Card className="m-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">ECS Status</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                {ecsStatus ? (
                  <>
                    <div>Entities: {ecsStatus.ecs.entityCount}</div>
                    <div>Active Combats: {ecsStatus.activeCombats}</div>
                    <div>Frame Time: {ecsStatus.ecs.frameTime}ms</div>
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-2 h-2 rounded-full ${ecsStatus.unity.connected ? "bg-green-500" : "bg-red-500"}`}
                      ></div>
                      <span>Unity Bridge</span>
                    </div>
                  </>
                ) : (
                  <div>Loading...</div>
                )}
              </CardContent>
            </Card>

            {/* Controls */}
            <Card className="m-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Controls</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <div>
                  • <strong>Mouse:</strong> Click to select entities
                </div>
                <div>
                  • <strong>Drag:</strong> Rotate camera
                </div>
                <div>
                  • <strong>Scroll:</strong> Zoom in/out
                </div>
                <div>
                  • <strong>Colors:</strong>
                </div>
                <div className="ml-4">
                  <div>Blue: Player Characters</div>
                  <div>Red: Hostile NPCs</div>
                  <div>Green: Neutral NPCs</div>
                </div>
              </CardContent>
            </Card>

            {/* Selected Entity */}
            {selectedEntity && (
              <Card className="m-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Selected Entity</CardTitle>
                </CardHeader>
                <CardContent className="text-xs">
                  <div>ID: {selectedEntity}</div>
                </CardContent>
              </Card>
            )}
            {/* Quick Actions */}
            <Card className="m-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  onClick={async () => {
                    const THREE = await import("three");
                    const scene = sceneRef.current;
                    if (sceneRef.current) {
                      await loadTerrainChunks(scene, THREE);
                    }
                  }}
                  size="sm"
                  className="w-full"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  Generate Terrain
                </Button>
                <Button size="sm" variant="outline" className="w-full">
                  <Zap className="w-4 h-4 mr-2" />
                  Test Combat
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
