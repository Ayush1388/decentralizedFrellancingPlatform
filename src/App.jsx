import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { LazyMotion, MotionConfig, domMax } from "motion/react";
import { config } from "./lib/wagmi";
import { AuthProvider } from "./context/AuthContext";
import { ChainConfigProvider } from "./context/ChainConfigContext";
import NavigationBar from "./Components/NavigationBar";
import Footer from "./Components/Footer";
import ApiStatus from "./Components/ApiStatus";
import DemoBanner from "./Components/DemoBanner";
import WalletModal from "./Components/WalletModal";
import LoginPopup from "./Components/LoginPopup";
import HomePage from "./Pages/HomePage";
import Developers from "./Pages/Developers";
import Jobs from "./Pages/Jobs";
import PostJob, { EditJob } from "./Pages/PostJob";
import JobDetail from "./Pages/JobDetail";
import Wallet from "./Pages/Wallet";
import Dashboard from "./Pages/Dashboard";
import DeveloperProfile from "./Pages/DeveloperProfile";
import Receipt from "./Pages/Receipt";
import Settings from "./Pages/Settings";
import Notifications from "./Pages/Notifications";
import Admin from "./Pages/Admin";
import Help from "./Pages/Help";
import { Privacy, Terms } from "./Pages/Legal";
import { ResetPassword, VerifyEmail } from "./Pages/AuthPages";
import VerifyBanner from "./Components/VerifyBanner";
import ErrorBoundary from "./Components/ErrorBoundary";
import OAuthSuccess from "./Pages/OAuthSuccess";
import { Button, EmptyState } from "./Components/ui";

const queryClient = new QueryClient();


// A crash on one page shows a friendly screen, and moving to another page clears it.
function Boundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

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
      {/* Motion is loaded once for the whole app; anyone who asks their system for less motion gets none. */}
      <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChainConfigProvider>
          <BrowserRouter>
            <ScrollToTop />
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-semibold focus:text-poster">
              Skip to content
            </a>
            <ApiStatus />
            <NavigationBar />
            <DemoBanner />
            <VerifyBanner />
            <main id="main" className="min-h-[60vh]">
              <Boundary>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/developers" element={<Developers />} />
                <Route path="/developers/:id" element={<DeveloperProfile />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/new" element={<PostJob />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/jobs/:id/edit" element={<EditJob />} />
                <Route path="/jobs/:id/receipt/:mid" element={<Receipt />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/help" element={<Help />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/verify" element={<VerifyEmail />} />
                <Route path="/reset" element={<ResetPassword />} />
                <Route path="/oauth-success" element={<OAuthSuccess />} />
                <Route
                  path="*"
                  element={
                    <div className="container-page pt-20">
                      <EmptyState as="h1" icon="search" title="Page not found" action={<Button to="/">Go home</Button>}>
                        The page you are looking for does not exist.
                      </EmptyState>
                    </div>
                  }
                />
              </Routes>
              </Boundary>
            </main>
            <Footer />
            <LoginPopup />
            <WalletModal />
          </BrowserRouter>
          </ChainConfigProvider>
        </AuthProvider>
      </QueryClientProvider>
      </MotionConfig>
      </LazyMotion>
    </WagmiProvider>
  );
}
