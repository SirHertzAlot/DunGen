import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Navbar } from "@/components/ui/Navbar";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import HeightmapViewer from "@/pages/HeightmapViewer";
import Settings from "@/pages/Settings";
import WorldViewer from "@/pages/WorldViewer";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <Navbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/heightmap-viewer" element={<HeightmapViewer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/world-viewer" element={<WorldViewer />} />
            {/* Fallback to 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
