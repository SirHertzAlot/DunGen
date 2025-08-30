/**
 * Dashboard Page
 * 
 * This page serves as the main interface for monitoring the MMORPG backend system.
 * It includes system statistics, region data, player management, and troubleshooting tools.
 * 
 * Tabs:
 * - Regions: Displays region status and player distribution.
 * - Players: Provides tools for managing player data.
 * - System: Shows system performance and storage details.
 * - Network: Monitors network and API connectivity.
 * - Troubleshooting: Displays logs and helps identify issues.
 */

import { useApiQuery } from '@/hooks/useApiQuery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Globe, Cpu, Network } from 'lucide-react';
import { Region, SystemStats } from '@/types/dashboard';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { SystemStatsCards } from '@/components/dashboard/SystemStatsCards';
import { RegionsTable } from '@/components/dashboard/RegionsTable';
import { SystemInfoCards } from '@/components/dashboard/SystemInfoCards';
import { NetworkStatusCards } from '@/components/dashboard/NetworkStatusCards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SystemHealthBadge } from '@/components/dashboard/SystemHealthBadge';
import { Troubleshooting } from '@/components/dashboard/Troubleshooting';

export default function Dashboard() {
  /**
   * Fetches region data from the backend API.
   * 
   * @returns {Region[]} An array of region objects containing player and server data.
   */
  const { data: regionsResponse, isLoading: regionsLoading } = useApiQuery<{ success: boolean; data: Region[] }>({
    queryKey: ['/api/regions'], // Explicitly include queryKey
    refetchInterval: 5000,
  });

  /**
   * Fetches system health data from the backend API.
   * 
   * @returns {Object} An object containing the system health status, service name, and timestamp.
   */
  const { data: healthResponse, isLoading: healthLoading, isError: healthError } = useApiQuery<
    { id: string; status: string; service: string; message: string; timestamp: string } | 
    { id: string; status: string; service: string; message: string; timestamp: string }[]
  >({
    queryKey: ['/api/health'], // Explicitly include queryKey
    refetchInterval: 2000,
  });

  const regions = regionsResponse?.data || [];

  /**
   * Determine overall system health.
   * If `healthResponse` is an array, check all services.
   * If it's a single object, check its status.
   */
  const systemHealth = !healthLoading && !healthError && (
    Array.isArray(healthResponse)
      ? healthResponse.every((service) => service.status === 'ok')
      : healthResponse?.status === 'ok'
  );

  /**
   * Calculates system statistics based on region data.
   * 
   * @returns {SystemStats} An object containing total players, online players, total regions, active regions, uptime, and events processed.
   */
  const systemStats: SystemStats = {
    totalPlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    onlinePlayers: regions.reduce((sum, region) => sum + region.playerCount, 0),
    totalRegions: regions.length,
    activeRegions: regions.filter(r => r.status === 'active').length,
    uptime: Date.now() - new Date().setHours(0, 0, 0, 0), // Mock uptime
    eventProcessed: Math.floor(Math.random() * 10000) + 50000 // Mock events processed
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
        {healthLoading ? (
          <div className="text-center text-muted-foreground">Checking system health...</div>
        ) : healthError ? (
          <div className="text-center text-destructive">Failed to load system health</div>
        ) : healthResponse ? (
          <>
            <DashboardHeader systemHealth={systemHealth} />
            <SystemHealthBadge health={Array.isArray(healthResponse) ? healthResponse : [healthResponse]} isLoading={healthLoading} />
          </>
        ) : null}

        <SystemStatsCards stats={systemStats} formatUptime={formatUptime} />

        {/* Main Content Tabs */}
        <Tabs defaultValue="regions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="regions" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Regions
            </TabsTrigger>
            <TabsTrigger value="players" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Players
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
            <RegionsTable regions={regions} isLoading={regionsLoading} />
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
                  <h3 className="text-lg font-semibold mb-2">Player Management</h3>
                  <p className="text-muted-foreground mb-4">
                    Player data will be displayed here when players are online
                  </p>
                  <Button>Refresh Player Data</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system">
            <SystemInfoCards stats={systemStats} totalRegions={regions.length} />
          </TabsContent>

          <TabsContent value="network">
            <NetworkStatusCards />
          </TabsContent>

          <TabsContent value="troubleshooting">
            <Troubleshooting />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}