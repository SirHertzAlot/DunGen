import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Swords, Users, Zap, Navigation } from 'lucide-react';

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
  const [characterName, setCharacterName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  // Initialize Three.js scene
  useEffect(() => {
    const initThreeJS = async () => {
      try {
        // Dynamically import Three.js
        const THREE = await import('three');
        
        if (!canvasRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // Sky blue
        sceneRef.current = scene;

        // Camera setup
        const camera = new THREE.PerspectiveCamera(
          75,
          window.innerWidth / window.innerHeight,
          0.1,
          1000
        );
        camera.position.set(50, 30, 50);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ 
          canvas: canvasRef.current,
          antialias: true 
        });
        renderer.setSize(window.innerWidth * 0.7, window.innerHeight * 0.7);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);

        // Ground plane (D&D battle grid)
        const gridSize = 100;
        const gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x333333, 0x333333);
        scene.add(gridHelper);

        const groundGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
          color: 0x228B22,
          transparent: true,
          opacity: 0.8 
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // Controls for camera movement
        const controls = new (await import('three/examples/jsm/controls/OrbitControls.js')).OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Animation loop
        const animate = () => {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        setIsInitialized(true);
        
        toast({
          title: "3D World Initialized",
          description: "D&D battle grid ready for testing"
        });

      } catch (error) {
        console.error('Failed to initialize 3D world:', error);
        toast({
          title: "3D Initialization Failed",
          description: "Could not load Three.js components",
          variant: "destructive"
        });
      }
    };

    initThreeJS();

    // Cleanup
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
        const response = await fetch('/api/ecs/status');
        const data = await response.json();
        setEcsStatus(data.data);
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to connect to ECS:', error);
        setIsConnected(false);
      }
    };

    connectToECS();
    const interval = setInterval(connectToECS, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Create 3D entity representation
  const createEntityMesh = async (entity: any) => {
    const THREE = await import('three');
    
    let geometry, material, mesh;

    if (entity.type === 'PlayerCharacter') {
      // Player character - blue cylinder with nameplate
      geometry = new THREE.CylinderGeometry(1, 1, 3, 8);
      material = new THREE.MeshLambertMaterial({ color: 0x4169E1 });
      mesh = new THREE.Mesh(geometry, material);
      
      // Add nameplate
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 64;
      context.fillStyle = 'white';
      context.fillRect(0, 0, 256, 64);
      context.fillStyle = 'black';
      context.font = '20px Arial';
      context.textAlign = 'center';
      context.fillText(entity.characterName || 'Player', 128, 35);
      
      const nameTexture = new THREE.CanvasTexture(canvas);
      const nameMaterial = new THREE.MeshBasicMaterial({ map: nameTexture });
      const nameGeometry = new THREE.PlaneGeometry(4, 1);
      const nameplate = new THREE.Mesh(nameGeometry, nameMaterial);
      nameplate.position.y = 4;
      mesh.add(nameplate);
      
    } else if (entity.type === 'NPC') {
      // NPC - red/green cylinder based on faction
      geometry = new THREE.CylinderGeometry(0.8, 0.8, 2.5, 8);
      const color = entity.faction === 'hostile' ? 0xFF4500 : 0x32CD32;
      material = new THREE.MeshLambertMaterial({ color });
      mesh = new THREE.Mesh(geometry, material);
      
    } else {
      // Generic entity - gray cube
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

    const THREE = await import('three');
    const scene = sceneRef.current;

    // Remove entities that no longer exist
    entitiesRef.current.forEach((mesh, entityId) => {
      if (!entitiesData.find(e => e.id === entityId)) {
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
        
        // Color coding based on health
        if (mesh.material) {
          const baseColor = entityData.type === 'PlayerCharacter' ? 0x4169E1 : 
                           entityData.faction === 'hostile' ? 0xFF4500 : 0x32CD32;
          
          if (healthPercent < 0.3) {
            mesh.material.color.setHex(0xFF0000); // Red for low health
          } else if (healthPercent < 0.6) {
            mesh.material.color.setHex(0xFFFF00); // Yellow for medium health
          } else {
            mesh.material.color.setHex(baseColor); // Normal color
          }
        }
      }

      // Update mesh data
      mesh.userData.entityData = entityData;
    }
  };

  // Create new character
  const createCharacter = async () => {
    if (!characterName.trim()) {
      toast({
        title: "Missing Character Name",
        description: "Please enter a character name",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/ecs/create-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: `player-${Date.now()}`,
          characterName: characterName.trim(),
          position: { 
            x: Math.random() * 20 - 10, 
            y: 0, 
            z: Math.random() * 20 - 10 
          },
          characterClass: 'fighter',
          race: 'human'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Character Created",
          description: `${characterName} spawned in the world`
        });
        setCharacterName('');
        
        // Add to local entities list immediately
        const newEntity = {
          id: data.data.entityId,
          type: 'PlayerCharacter',
          characterName: characterName.trim(),
          playerId: data.data.playerId,
          components: {
            Transform: { 
              position: { 
                x: Math.random() * 20 - 10, 
                y: 0, 
                z: Math.random() * 20 - 10 
              } 
            },
            Health: { currentHealth: 100, maxHealth: 100 }
          }
        };
        
        setEntities(prev => [...prev, newEntity]);
        await updateEntities([...entities, newEntity]);
        
      } else {
        toast({
          title: "Creation Failed",
          description: data.error || "Could not create character",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Network Error",
        description: "Could not connect to game server",
        variant: "destructive"
      });
    }
  };

  // Spawn test NPC
  const spawnNPC = async () => {
    try {
      const npcTypes = ['goblin', 'orc', 'skeleton', 'wolf'];
      const npcType = npcTypes[Math.floor(Math.random() * npcTypes.length)];
      
      const response = await fetch('/api/ecs/create-npc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npcType,
          challengeRating: Math.floor(Math.random() * 3) + 1,
          position: { 
            x: Math.random() * 30 - 15, 
            y: 0, 
            z: Math.random() * 30 - 15 
          },
          faction: Math.random() > 0.5 ? 'hostile' : 'neutral'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "NPC Spawned",
          description: `${npcType} appeared in the world`
        });
      }
    } catch (error) {
      toast({
        title: "Spawn Failed",
        description: "Could not spawn NPC",
        variant: "destructive"
      });
    }
  };

  // Handle mouse clicks on entities
  useEffect(() => {
    const handleClick = async (event: MouseEvent) => {
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;

      const THREE = await import('three');
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData.entityId) {
          setSelectedEntity(object.userData.entityId);
          toast({
            title: "Entity Selected",
            description: `Selected: ${object.userData.entityData?.characterName || object.userData.entityData?.npcType || 'Entity'}`
          });
        }
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('click', handleClick);
      return () => canvas.removeEventListener('click', handleClick);
    }
  }, [isInitialized]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">D&D MMORPG - 3D World Viewer</h1>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Character name..."
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            className="w-40"
            onKeyPress={(e) => e.key === 'Enter' && createCharacter()}
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
      </div>

      <div className="flex flex-1">
        {/* 3D Viewport */}
        <div className="flex-1 bg-black">
          <canvas 
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            style={{ maxHeight: '70vh' }}
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
                    <div className={`w-2 h-2 rounded-full ${ecsStatus.unity.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
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
              <div>• <strong>Mouse:</strong> Click to select entities</div>
              <div>• <strong>Drag:</strong> Rotate camera</div>
              <div>• <strong>Scroll:</strong> Zoom in/out</div>
              <div>• <strong>Colors:</strong></div>
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
                {/* Add more entity details here */}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="m-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button size="sm" className="w-full">
                <Navigation className="w-4 h-4 mr-2" />
                Center Camera
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
  );
}