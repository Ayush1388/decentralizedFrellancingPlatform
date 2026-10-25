import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "./lib/wagmi";
import { AuthProvider } from "./context/AuthContext";
import { ChainConfigProvider } from "./context/ChainConfigContext";
import NavigationBar from "./Components/NavigationBar";
import Footer from "./Components/Footer";
import ApiStatus from "./Components/ApiStatus";
import DemoBanner from "./Components/DemoBanner";
import LoginPopup from "./Components/LoginPopup";
import HomePage from "./Pages/HomePage";
import Developers from "./Pages/Developers";
import Jobs from "./Pages/Jobs";
import PostJob from "./Pages/PostJob";
import JobDetail from "./Pages/JobDetail";
import Wallet from "./Pages/Wallet";
import Dashboard from "./Pages/Dashboard";
import OAuthSuccess from "./Pages/OAuthSuccess";
import { Button, EmptyState } from "./Components/ui";

const queryClient = new QueryClient();


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChainConfigProvider>
          <BrowserRouter>
            <ScrollToTop />
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
              Skip to content
            </a>
            <ApiStatus />
            <NavigationBar />
            <DemoBanner />
            <main id="main" className="min-h-[60vh]">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/developers" element={<Developers />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/new" element={<PostJob />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/oauth-success" element={<OAuthSuccess />} />
                <Route
                  path="*"
                  element={
                    <div className="container-page pt-20">
                      <EmptyState icon="search" title="Page not found" action={<Button to="/">Go home</Button>}>
                        The page you are looking for does not exist.
                      </EmptyState>
                    </div>
                  }
                />
              </Routes>
            </main>
            <Footer />
            <LoginPopup />
          </BrowserRouter>
          </ChainConfigProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
