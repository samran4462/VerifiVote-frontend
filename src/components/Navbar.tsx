'use client';

import React, { useEffect, useState } from 'react';
import { useAccount, useSignMessage, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import api from '../lib/api';
import toast from 'react-hot-toast';

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handle1ClickLogin = async () => {
    setIsProcessing(true);
    try {
      let targetAddress = address;

      // 1. Connect Wallet if not connected
      if (!isConnected || !targetAddress) {
        const result = await connectAsync({ connector: injected() });
        targetAddress = result.accounts[0];
      }

      // 2. Sign-In via Backend
      if (!isAuthenticated && targetAddress) {
        const nonceRes = await api.get(`/auth/nonce?walletAddress=${targetAddress}`);
        const nonce = nonceRes.data.nonce;

        const message = `Sign this message to authenticate with the Voting System.\nNonce: ${nonce}`;
        const signature = await signMessageAsync({ message });

        const verifyRes = await api.post('/auth/verify', {
          walletAddress: targetAddress,
          signature,
        });
        
        const { access_token } = verifyRes.data;
        localStorage.setItem('auth_token', access_token);
        setIsAuthenticated(true);
        toast.success('Successfully connected and authenticated!');
      }
    } catch (error: any) {
      console.error('1-Click Login failed:', error);
      toast.error(error?.message || 'Authentication failed or rejected.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    disconnect();
    toast.success('Signed out successfully');
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdmin = address?.toLowerCase() === '0x8f71bcd375fc18c49ad36dffeaacc016c49778b9'.toLowerCase();

  return (
    <nav className="flex items-center justify-between p-4 bg-[#115740] shadow-md border-b border-[#0D402F] relative z-50">
      <div className="flex items-center gap-8">
        <a href="/" className="text-xl font-bold tracking-tight text-white cursor-pointer">
          <span className="text-green-300">Verifi</span>Vote
        </a>
        <div className="hidden md:flex gap-6 text-sm font-medium">
          <a href="/vote" className="text-green-50 hover:text-white transition-colors">Voter Portal</a>
          <a href="/kyc" className="text-green-50 hover:text-white transition-colors">KYC Verify</a>
          <a href="/candidate" className="text-green-50 hover:text-white transition-colors">Candidate Portal</a>
          <a href="/results" className="text-green-50 hover:text-white transition-colors">Public Ledger</a>
          {mounted && isAuthenticated && isAdmin && (
            <a href="/admin" className="text-green-50 hover:text-white transition-colors">Admin Dashboard</a>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Connect buttons have been moved to context-specific pages (Admin/Voter) */}
        
        {mounted && isConnected && isAuthenticated && (
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 text-xs font-semibold text-green-300 bg-[#0D402F] rounded-lg border border-[#0D402F] text-white">
              {address ? `${address.slice(0,6)}...${address.slice(-4)}` : 'Verified'}
            </span>
            <button 
              onClick={handleSignOut}
              className="px-4 py-1.5 text-sm font-medium text-[#115740] bg-white hover:bg-gray-100 border border-transparent rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
