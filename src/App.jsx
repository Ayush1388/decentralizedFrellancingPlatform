import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import NavigationBar from "./Components/NavigationBar";
import HomePage from "./Pages/HomePage";
import Developers from "./Pages/developers";
//import Wallet from "./Pages/wallet";
import Tasks from "./Pages/tasks";
import LoginPopup from "./Components/LoginPopup";
import OAuthSuccess from "./Pages/OAuthSuccess";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

function App() {
  const [showLogin, setShowLogin] = useState(false);

  return (
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <Router>
            <NavigationBar setShowLogin={setShowLogin} />

            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/developers" element={<Developers />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/" element={<HomePage />} />
              <Route path="/oauth-success" element={<OAuthSuccess />} />
            </Routes>

            {showLogin && <LoginPopup setShowLogin={setShowLogin} />}
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
