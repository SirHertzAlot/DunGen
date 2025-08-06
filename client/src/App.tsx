import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import WorldViewer from "@/pages/world-viewer";
import NotFound from "@/pages/not-found";
import HeightmapViewer from "@/pages/heightmap-viewer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/world-viewer" component={WorldViewer} />
      <Route path="/world" component={WorldViewer} />
      <Route path="/heightmap-viewer" component={HeightmapViewer} />
      <Route path="/heightmaps" component={HeightmapViewer} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
