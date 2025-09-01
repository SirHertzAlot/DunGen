import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Globe,
  Activity,
  Gamepad2,
  Zap,
  Database,
  Cpu,
  Network,
  Box,
  Mountain,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { useState } from "react";
import { SystemHealthBadge } from "@/components/SystemHealthBadge";
import Navigation from "@/components/Navigation"; // <-- Navigation component import

interface Region {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  serverNode: string;
}

interface Player {
  id: string;
  username: string;
  level: number;
  experience: number;
  health: number;
  mana: number;
  regionId: string;
  isOnline: boolean;
  lastActive: string;
}

interface SystemStats {
  totalPlayers: number;
  onlinePlayers: number;
  totalRegions: number;
  activeRegions: number;
  uptime: number;
  eventProcessed: number;
}

interface HealthData {
  status: string;
  service: string;
  message: string;
  timestamp: string;
}

export default function Dashboard() {
  const [testChunkCoords, setTestChunkCoords] = useState({ x: 0, z: 0 });

  // Query for regions data
  const { data: regionsResponse, isLoading: regionsLoading } = useQuery<{
    success: boolean;
    data: Region[];
  }>({
    queryKey: ["/api/regions"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Query for system health
  const {
    data: healthResponse,
    isLoading: healthLoading,
    isError,
  } = useQuery<{
    status: string;
    service: string;
    message: string;
    timestamp: string;
    results: HealthData[];
  }>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // Query for terrain chunk (only when coordinates change)
  const { data: terrainResponse, isLoading: terrainLoading } = useQuery<{
    success: boolean;
    data: any;
  }>({
    queryKey: [`/api/worldgen/chunk/${testChunkCoords.x}/${testChunkCoords.z}`],
    enabled: true, // Always enabled to test the procedural generation
  });

  const regions = regionsResponse?.data || [];

  /**
   * Calculates system statistics based on region data.
   *
   * @returns {SystemStats} An object containing total players, online players, total regions, active regions, uptime, and events processed.
   */
  const systemStats: SystemStats = {
    totalPlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    onlinePlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    totalRegions: regions.length,
    activeRegions: regions.filter((r) => r.status === "active").length,
    uptime: Date.now() - new Date().setHours(0, 0, 0, 0), // Mock uptime
    eventProcessed: Math.floor(Math.random() * 10000) + 50000, // Mock events processed
  };

  /**
   * Formats uptime in milliseconds into a human-readable string.
   *
   * @param {number} ms - The uptime in milliseconds.
   * @returns {string} A formatted string in the format "Xh Ym".
   */
  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <Gamepad2 className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">MMORPG Backend Dashboard</h1>
              {/* Pass healthData prop to SystemHealthBadge */}
              <div className="flex gap-2">
                {healthLoading ? (
                  <div>Loading health data...</div>
                ) : !healthResponse ? (
                  <div>No health data available.</div>
                ) : !healthResponse.results?.length ? (
                  <div>No health checks found.</div>
                ) : (
                  healthResponse.results.map((check) => (
                    <SystemHealthBadge key={check.service} health={check} />
                  ))
                )}
              </div>
            </div>
            <p className="text-muted-foreground">
              Real-time monitoring and management of your MMORPG backend system
            </p>
          </div>

          {/* System Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Players
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {systemStats.totalPlayers}
                </div>
                <p className="text-xs text-muted-foreground">
                  {systemStats.onlinePlayers} currently online
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Regions
                </CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {systemStats.activeRegions}
                </div>
                <p className="text-xs text-muted-foreground">
                  of {systemStats.totalRegions} total regions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  System Uptime
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatUptime(systemStats.uptime)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since last restart
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Events Processed
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {systemStats.eventProcessed.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total game events
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="regions" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="regions" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Regions
              </TabsTrigger>
              <TabsTrigger value="players" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Players
              </TabsTrigger>
              <TabsTrigger value="worldgen" className="flex items-center gap-2">
                <Mountain className="h-4 w-4" />
                World Gen
              </TabsTrigger>
              <TabsTrigger value="system" className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                System
              </TabsTrigger>
              <TabsTrigger value="network" className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Network
              </TabsTrigger>
            </TabsList>

            <TabsContent value="regions">
              <Card>
                <CardHeader>
                  <CardTitle>World Regions</CardTitle>
                  <CardDescription>
                    Monitor region status, player distribution, and server load
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {regionsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="text-sm text-muted-foreground">
                        Loading regions...
                      </div>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Region</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Players</TableHead>
                          <TableHead>Server Node</TableHead>
                          <TableHead>Load</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {regions.map((region) => (
                          <TableRow key={region.id}>
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-semibold">
                                  {region.name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {region.id}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  region.status === "active"
                                    ? "default"
                                    : region.status === "maintenance"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {region.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span>
                                  {region.playerCount} / {region.maxPlayers}
                                </span>
                                <div className="w-full bg-secondary rounded-full h-2 mt-1">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all"
                                    style={{
                                      width: `${(region.playerCount / region.maxPlayers) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {region.serverNode}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`font-medium ${
                                  region.playerCount / region.maxPlayers > 0.8
                                    ? "text-red-500"
                                    : region.playerCount / region.maxPlayers >
                                        0.6
                                      ? "text-yellow-500"
                                      : "text-green-500"
                                }`}
                              >
                                {Math.round(
                                  (region.playerCount / region.maxPlayers) *
                                    100,
                                )}
                                %
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm">
                                View Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="players">
              <Card>
                <CardHeader>
                  <CardTitle>Player Management</CardTitle>
                  <CardDescription>
                    Monitor player activity, sessions, and game statistics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      Player Management
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Player data will be displayed here when players are online
                    </p>
                    <Button>Refresh Player Data</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="system">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Storage & Persistence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Memory Storage</span>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Player Repository</span>
                      <Badge variant="default">Connected</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Session Management</span>
                      <Badge variant="default">Running</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Total Records</span>
                        <span className="font-mono">
                          {systemStats.totalPlayers + regions.length}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Active Sessions</span>
                        <span className="font-mono">
                          {systemStats.onlinePlayers}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      System Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">World System</span>
                      <Badge variant="default">Running</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Event Queue</span>
                      <Badge variant="default">Processing</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Redis Pub/Sub</span>
                      <Badge variant="default">Connected</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Events/sec</span>
                        <span className="font-mono">
                          {Math.floor(Math.random() * 100) + 50}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Queue Length</span>
                        <span className="font-mono">
                          {Math.floor(Math.random() * 10)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* World Generation Tab */}
            <TabsContent value="worldgen">
              <Card>
                <CardHeader>
                  <CardTitle>Procedural World Generation</CardTitle>
                  <CardDescription>
                    Test and monitor the YAML-configured procedural generation
                    pipeline
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Test Chunk Generation */}
                    <div className="space-y-4">
                      <h4 className="font-semibold">Test Chunk Generation</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-sm font-medium">Chunk X</label>
                          <input
                            type="number"
                            value={testChunkCoords.x}
                            onChange={(e) =>
                              setTestChunkCoords((prev) => ({
                                ...prev,
                                x: parseInt(e.target.value) || 0,
                              }))
                            }
                            className="w-full mt-1 px-3 py-1 border rounded-md text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Chunk Z</label>
                          <input
                            type="number"
                            value={testChunkCoords.z}
                            onChange={(e) =>
                              setTestChunkCoords((prev) => ({
                                ...prev,
                                z: parseInt(e.target.value) || 0,
                              }))
                            }
                            className="w-full mt-1 px-3 py-1 border rounded-md text-sm"
                          />
                        </div>
                      </div>

                      {terrainLoading ? (
                        <div className="p-4 border rounded-lg">
                          <div className="animate-pulse space-y-2">
                            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                          </div>
                        </div>
                      ) : terrainResponse?.success ? (
                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">
                              Chunk Generated
                            </span>
                            <Badge variant="default">Success</Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <div>
                              Position: [{terrainResponse.data.position[0]},{" "}
                              {terrainResponse.data.position[1]}]
                            </div>
                            <div>
                              Size: {terrainResponse.data.size}x
                              {terrainResponse.data.size}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 border rounded-lg">
                          <div className="text-sm text-muted-foreground">
                            Failed to generate chunk. Check server logs for
                            details.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* YAML Config Viewer */}
                    <div className="space-y-4">
                      <h4 className="font-semibold">YAML Configuration</h4>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">
                          Display YAML configuration here (future
                          implementation)
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Network Tab */}
            <TabsContent value="network">
              <Card>
                <CardHeader>
                  <CardTitle>Network Status</CardTitle>
                  <CardDescription>
                    Monitor network connections, traffic, and latency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      Network Monitoring
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Network data will be displayed here when available
                    </p>
                    <Button>Refresh Network Data</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
