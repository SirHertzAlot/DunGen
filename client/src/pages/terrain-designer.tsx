import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface TerrainConfig {
  chunkX: number;
  chunkZ: number;
  algorithm: string;
  size: number;
  frequency: number;
  amplitude: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  seed: number;
  minHeight: number;
  maxHeight: number;
  erosionIterations: number;
  smoothingPasses: number;
  customParams: string;
}

export default function TerrainDesigner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<TerrainConfig>({
    chunkX: 0,
    chunkZ: 0,
    algorithm: 'mountain',
    size: 256,
    frequency: 0.005,
    amplitude: 400,
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    seed: 12345,
    minHeight: 0,
    maxHeight: 500,
    erosionIterations: 3,
    smoothingPasses: 2,
    customParams: '{}'
  });

  const [lastGenerated, setLastGenerated] = useState<{ x: number; z: number } | null>(null);

  const generateTerrain = useMutation({
    mutationFn: async (terrainConfig: TerrainConfig) => {
      const response = await fetch('/api/worldgen/manual-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(terrainConfig)
      });
      if (!response.ok) throw new Error('Failed to generate terrain');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Terrain Generated!",
        description: `Successfully generated ${config.algorithm} terrain at chunk (${config.chunkX}, ${config.chunkZ})`,
      });
      setLastGenerated({ x: config.chunkX, z: config.chunkZ });
      // Invalidate terrain queries to refresh views
      queryClient.invalidateQueries({ queryKey: ['/api/worldgen'] });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const presets = {
    'Massive Mountains': {
      algorithm: 'mountain',
      size: 256,
      frequency: 0.005,
      amplitude: 400,
      octaves: 6,
      minHeight: 0,
      maxHeight: 800,
      erosionIterations: 5,
      smoothingPasses: 3
    },
    'Sharp Peaks': {
      algorithm: 'mountain',
      size: 128,
      frequency: 0.008,
      amplitude: 300,
      octaves: 8,
      minHeight: 50,
      maxHeight: 600,
      erosionIterations: 2,
      smoothingPasses: 1
    },
    'Rolling Hills': {
      algorithm: 'perlin',
      size: 256,
      frequency: 0.02,
      amplitude: 80,
      octaves: 4,
      minHeight: 0,
      maxHeight: 200,
      erosionIterations: 1,
      smoothingPasses: 3
    },
    'Gentle Terrain': {
      algorithm: 'perlin',
      size: 128,
      frequency: 0.03,
      amplitude: 50,
      octaves: 3,
      minHeight: 0,
      maxHeight: 100,
      erosionIterations: 0,
      smoothingPasses: 2
    }
  };

  const applyPreset = (presetName: keyof typeof presets) => {
    const preset = presets[presetName];
    setConfig(prev => ({ ...prev, ...preset }));
  };

  const updateConfig = (key: keyof TerrainConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manual Terrain Designer</h1>
        <p className="text-muted-foreground">Generate specific terrain types with full control over all parameters</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Presets */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Presets</CardTitle>
              <CardDescription>Apply proven terrain configurations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.keys(presets).map(presetName => (
                  <Button
                    key={presetName}
                    variant="outline"
                    onClick={() => applyPreset(presetName as keyof typeof presets)}
                    className="h-auto p-3 text-left"
                  >
                    {presetName}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList>
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
              <TabsTrigger value="custom">Custom Code</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Chunk Position & Algorithm</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="chunkX">Chunk X</Label>
                    <Input
                      id="chunkX"
                      type="number"
                      value={config.chunkX}
                      onChange={(e) => updateConfig('chunkX', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="chunkZ">Chunk Z</Label>
                    <Input
                      id="chunkZ"
                      type="number"
                      value={config.chunkZ}
                      onChange={(e) => updateConfig('chunkZ', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="algorithm">Terrain Algorithm</Label>
                    <Select value={config.algorithm} onValueChange={(value) => updateConfig('algorithm', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mountain">Mountain Ranges</SelectItem>
                        <SelectItem value="perlin">Perlin Noise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Size & Heights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Chunk Size: {config.size}x{config.size}</Label>
                    <Slider
                      value={[config.size]}
                      onValueChange={([value]) => updateConfig('size', value)}
                      min={64}
                      max={256}
                      step={64}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Max Height: {config.maxHeight} units</Label>
                    <Slider
                      value={[config.maxHeight]}
                      onValueChange={([value]) => updateConfig('maxHeight', value)}
                      min={50}
                      max={1000}
                      step={10}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Min Height: {config.minHeight} units</Label>
                    <Slider
                      value={[config.minHeight]}
                      onValueChange={([value]) => updateConfig('minHeight', value)}
                      min={-100}
                      max={100}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Noise Parameters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Frequency: {config.frequency.toFixed(4)}</Label>
                    <Slider
                      value={[config.frequency]}
                      onValueChange={([value]) => updateConfig('frequency', value)}
                      min={0.001}
                      max={0.1}
                      step={0.001}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Amplitude: {config.amplitude}</Label>
                    <Slider
                      value={[config.amplitude]}
                      onValueChange={([value]) => updateConfig('amplitude', value)}
                      min={10}
                      max={500}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Octaves: {config.octaves}</Label>
                    <Slider
                      value={[config.octaves]}
                      onValueChange={([value]) => updateConfig('octaves', value)}
                      min={1}
                      max={12}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Persistence: {config.persistence.toFixed(2)}</Label>
                    <Slider
                      value={[config.persistence]}
                      onValueChange={([value]) => updateConfig('persistence', value)}
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Seed: {config.seed}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={config.seed}
                        onChange={(e) => updateConfig('seed', parseInt(e.target.value) || 0)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={() => updateConfig('seed', Math.floor(Math.random() * 100000))}
                      >
                        Random
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Post-Processing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Erosion Iterations: {config.erosionIterations}</Label>
                    <Slider
                      value={[config.erosionIterations]}
                      onValueChange={([value]) => updateConfig('erosionIterations', value)}
                      min={0}
                      max={10}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Smoothing Passes: {config.smoothingPasses}</Label>
                    <Slider
                      value={[config.smoothingPasses]}
                      onValueChange={([value]) => updateConfig('smoothingPasses', value)}
                      min={0}
                      max={5}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Custom Parameters</CardTitle>
                  <CardDescription>Advanced JSON configuration for algorithm-specific parameters</CardDescription>
                </CardHeader>
                <CardContent>
                  <Label>Custom JSON Parameters</Label>
                  <Textarea
                    value={config.customParams}
                    onChange={(e) => updateConfig('customParams', e.target.value)}
                    placeholder='{"iterations": 5, "spread": 0.8, "count": 3}'
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Algorithm-specific parameters in JSON format. Consult THREE.Terrain documentation for details.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Action Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate Terrain</CardTitle>
              <CardDescription>Apply your configuration to generate terrain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={() => generateTerrain.mutate(config)}
                disabled={generateTerrain.isPending}
                className="w-full"
                size="lg"
              >
                {generateTerrain.isPending ? "Generating..." : "Generate Terrain"}
              </Button>
              
              {lastGenerated && (
                <div className="text-sm text-muted-foreground text-center">
                  Last generated: Chunk ({lastGenerated.x}, {lastGenerated.z})
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Current configuration summary</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><strong>Position:</strong> ({config.chunkX}, {config.chunkZ})</div>
              <div><strong>Algorithm:</strong> {config.algorithm}</div>
              <div><strong>Size:</strong> {config.size}×{config.size}</div>
              <div><strong>Height Range:</strong> {config.minHeight} to {config.maxHeight}</div>
              <div><strong>Frequency:</strong> {config.frequency.toFixed(4)}</div>
              <div><strong>Amplitude:</strong> {config.amplitude}</div>
              <div><strong>Seed:</strong> {config.seed}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}