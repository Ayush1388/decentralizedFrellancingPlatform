import { Link } from "react-router-dom";
//import { ShowBalance } from './ShowBalance';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import {
    WalletModalProvider,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

export default function NavigationBar({ setShowLogin }) {
  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token"); // ✅ clear token
    window.location.reload(); // ✅ refresh UI
  };

  return (
    <nav className="flex justify-between items-center py-6 mx-50">
      {/* Logo */}
      <div>
        <Link to="/" className="text-2xl font-bold text-green-700">
          Blockchain
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex items-center space-x-8 text-lg px-3 font-medium text-gray-700">
        <ul className="flex space-x-8">
          <li>
            <Link to="/developers" className="hover:text-green-600">
              Developers
            </Link>
          </li>
          <li>
            <Link to="/tasks" className="hover:text-green-600">
              Tasks
            </Link>
          </li>
          <li>
            <Link to="/wallet" className="hover:text-green-600">
              Wallet
            </Link>
          </li>
        </ul>

        {/* Auth Section */}
        {!token ? (
          <button
            onClick={() => setShowLogin(true)}
            className="bg-green-600 hover:bg-green-800 text-white px-6 py-2 rounded-full"
          >
            Login
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-800 text-white px-6 py-2 rounded-full"
          >
            Logout
          </button>
        )}
        <div>
          <ConnectionProvider endpoint={"https://api.devnet.solana.com"}>
            <WalletProvider wallets={[]} autoConnect>
                <WalletModalProvider>
                    <WalletMultiButton className='  inline-flex items-center justify-center text-sm mx-4 py-2 px-2 rounded-md border border-white bg-white 
                text-black font-medium hover:scale-105 transition-all duration-200' />
                    {/* <WalletDisconnectButton /> */}
                    {/* <RequestAirdrop/> */}
                      {/* <ShowBalance />
                      <SendTokens/>
                      <SignMessage/> */}
                    { /* Your app's components go here, nested within the context providers. */ }
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
        </div>
      </div>
    </nav>
  );
}
