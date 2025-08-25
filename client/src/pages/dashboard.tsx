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
  Map,
  Mountain,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { SystemHealthBadge } from "@/components/SystemHealthBadge";

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
  const { data: healthResponse, isLoading: healthLoading } = useQuery<{
    status: string;
    service: string;
    message: string;
    timestamp: string;
  }>({
    queryKey: ["/api/health"],
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
  //  const systemHealth = healthResponse?.status === "ok";  //no longer needed

  // Calculate system statistics
  const systemStats: SystemStats = {
    totalPlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    onlinePlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    totalRegions: regions.length,
    activeRegions: regions.filter((r) => r.status === "active").length,
    uptime: Date.now() - new Date().setHours(0, 0, 0, 0), // Mock uptime
    eventProcessed: Math.floor(Math.random() * 10000) + 50000, // Mock events processed
  };

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
              {healthResponse && <SystemHealthBadge health={healthResponse} />}
            </div>
            <Link href="/world">
              <Button className="flex items-center gap-2">
                <Box className="h-4 w-4" />
                3D World Viewer
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Real-time monitoring and management of your MMORPG backend system
          </p>
        </div>

        {/* System Overview Cards */}
        {/* ... rest of your Dashboard component ... */}
      </div>
    </div>
  );
}