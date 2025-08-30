import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Region } from '@/types/dashboard';

interface RegionsTableProps {
  regions: Region[];
  isLoading: boolean;
}

export function RegionsTable({ regions, isLoading }: RegionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>World Regions</CardTitle>
        <CardDescription>
          Monitor region status, player distribution, and server load
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-sm text-muted-foreground">Loading regions...</div>
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
                      <div className="font-semibold">{region.name}</div>
                      <div className="text-sm text-muted-foreground">{region.id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        region.status === 'active' ? 'default' : 
                        region.status === 'maintenance' ? 'secondary' : 'destructive'
                      }
                    >
                      {region.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{region.playerCount} / {region.maxPlayers}</span>
                      <div className="w-full bg-secondary rounded-full h-2 mt-1">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(region.playerCount / region.maxPlayers) * 100}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{region.serverNode}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${
                      region.playerCount / region.maxPlayers > 0.8 ? 'text-red-500' :
                      region.playerCount / region.maxPlayers > 0.6 ? 'text-yellow-500' :
                      'text-green-500'
                    }`}>
                      {Math.round((region.playerCount / region.maxPlayers) * 100)}%
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
  );
}
