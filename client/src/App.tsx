import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Navbar } from "@/components/ui/Navbar";
import Dashboard from "@/pages/dashboard";
import WorldViewer from "@/pages/world-viewer";
import NotFound from "@/pages/not-found";
import HeightmapViewer from "@/pages/heightmap-viewer";
import TerrainDesigner from "@/pages/terrain-designer";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/world-viewer" element={<WorldViewer />} />
      <Route path="/world" element={<WorldViewer />} />
      <Route path="/heightmap-viewer" element={<HeightmapViewer />} />
      <Route path="/heightmaps" element={<HeightmapViewer />} />
      <Route path="/terrain-designer" element={<TerrainDesigner />} />
      <Route path="/designer" element={<TerrainDesigner />} />
      {/* Fallback to 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
