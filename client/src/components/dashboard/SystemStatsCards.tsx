import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Globe, Activity, Zap } from 'lucide-react';
import { SystemStats } from '@/types/dashboard';

interface SystemStatsCardsProps {
  stats: SystemStats;
  formatUptime: (ms: number) => string;
}

export function SystemStatsCards({ stats, formatUptime }: SystemStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Players</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalPlayers}</div>
          <p className="text-xs text-muted-foreground">
            {stats.onlinePlayers} currently online
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Regions</CardTitle>
          <Globe className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeRegions}</div>
          <p className="text-xs text-muted-foreground">
            of {stats.totalRegions} total regions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatUptime(stats.uptime)}</div>
          <p className="text-xs text-muted-foreground">
            Since last restart
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Events Processed</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.eventProcessed.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Total game events
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
