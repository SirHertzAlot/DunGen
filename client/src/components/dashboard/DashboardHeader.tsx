import { Badge } from '@/components/ui/badge';
import { Gamepad2 } from 'lucide-react';

interface DashboardHeaderProps {
  systemHealth: boolean;
}

export function DashboardHeader({ systemHealth }: DashboardHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <Gamepad2 className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">MMORPG Backend Dashboard</h1>
        <Badge variant={systemHealth ? "default" : "destructive"}>
          {systemHealth ? "Online" : "Offline"}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        Real-time monitoring and management of your MMORPG backend system
      </p>
    </div>
  );
}
