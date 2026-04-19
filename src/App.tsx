import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/RequireAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import MyRepos from "./pages/MyRepos.tsx";
import CodeGraph from "./pages/CodeGraph.tsx";
import TestPath from "./pages/TestPath.tsx";
import ImpactRadar from "./pages/ImpactRadar.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/repos"
              element={
                <RequireAuth>
                  <MyRepos />
                </RequireAuth>
              }
            />
            <Route
              path="/code-graph"
              element={
                <RequireAuth>
                  <CodeGraph />
                </RequireAuth>
              }
            />
            <Route
              path="/testpath"
              element={
                <RequireAuth>
                  <TestPath />
                </RequireAuth>
              }
            />
            <Route path="/sentinel-graph" element={<Navigate to="/testpath" replace />} />
            <Route path="/code-star" element={<Navigate to="/testpath" replace />} />
            <Route
              path="/impact-radar"
              element={
                <RequireAuth>
                  <ImpactRadar />
                </RequireAuth>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
