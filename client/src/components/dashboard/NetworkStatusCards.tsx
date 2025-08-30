import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function NetworkStatusCards() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Network & Communication</CardTitle>
        <CardDescription>
          Monitor API endpoints, pub/sub channels, and system connectivity
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-2">REST API</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Status</span>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex justify-between">
                <span>Port</span>
                <span className="font-mono">5000</span>
              </div>
              <div className="flex justify-between">
                <span>Endpoints</span>
                <span className="font-mono">12</span>
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-2">Redis Event Bus</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Status</span>
                <Badge variant="default">Connected</Badge>
              </div>
              <div className="flex justify-between">
                <span>Channels</span>
                <span className="font-mono">8</span>
              </div>
              <div className="flex justify-between">
                <span>Messages/min</span>
                <span className="font-mono">{Math.floor(Math.random() * 1000) + 100}</span>
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-2">Queue System</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Status</span>
                <Badge variant="default">Processing</Badge>
              </div>
              <div className="flex justify-between">
                <span>Workers</span>
                <span className="font-mono">4</span>
              </div>
              <div className="flex justify-between">
                <span>Jobs/sec</span>
                <span className="font-mono">{Math.floor(Math.random() * 50) + 10}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
