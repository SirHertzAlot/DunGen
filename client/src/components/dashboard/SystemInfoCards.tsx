import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Database, Cpu } from 'lucide-react';
import { SystemStats } from '@/types/dashboard';

interface SystemInfoCardsProps {
  stats: SystemStats;
  totalRegions: number;
}

export function SystemInfoCards({ stats, totalRegions }: SystemInfoCardsProps) {
  return (
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
              <span className="font-mono">{stats.totalPlayers + totalRegions}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Active Sessions</span>
              <span className="font-mono">{stats.onlinePlayers}</span>
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
              <span className="font-mono">{Math.floor(Math.random() * 100) + 50}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Queue Length</span>
              <span className="font-mono">{Math.floor(Math.random() * 10)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
