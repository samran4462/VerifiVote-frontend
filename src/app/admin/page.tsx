'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useConnect, useSignMessage } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { jwtDecode } from 'jwt-decode';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useMemo } from 'react';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;
const BACKEND_VERIFIER = process.env.NEXT_PUBLIC_BACKEND_VERIFIER as `0x${string}`;

const FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: '_electionId', type: 'uint256' },
      { internalType: 'address', name: '_backendVerifier', type: 'address' }
    ],
    name: 'createElection',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

const ELECTION_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "voter", "type": "address"}],
        "name": "issueToken",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "resolveElection",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "startElection",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

function DataParticles() {
  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 4;
      pts.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ]);
    }
    return pts;
  }, []);

  return (
    <group>
      {points.map((pos: any, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      ))}
    </group>
  );
}

const Background = () => (
  <div className="fixed inset-0 w-full h-screen -z-10 pointer-events-none">
    <Canvas camera={{ position: [0, 2, 12], fov: 50 }}>
      <color attach="background" args={['#04170E']} />
      <ambientLight intensity={0.5} color="#ffffff" />
      <directionalLight position={[10, 20, 10]} intensity={2.0} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={5.0} color="#22c55e" />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <DataParticles />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  </div>
);

const getLocalISOString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
};

export default function AdminDashboard() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [electionForm, setElectionForm] = useState({ title: '', description: '', startTime: getLocalISOString(), durationMinutes: 10 });
  const [elections, setElections] = useState<any[]>([]);

  // New states for pending kyc and nadra auth
  const [pendingVoters, setPendingVoters] = useState<any[]>([]);
  const [pendingCandidates, setPendingCandidates] = useState<any[]>([]);
  const [nadraWallet, setNadraWallet] = useState('');

  const { writeContractAsync, isPending } = useWriteContract();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        if (decoded.role === 'Admin' || (address && address.toLowerCase() === '0x8f71bcd375fc18c49ad36dffeaacc016c49778b9'.toLowerCase())) {
          setIsAdmin(true);
          setIsAuthenticated(true);
          fetchElections();
          fetchPendingKyc();
        }
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  }, [address]);

  const fetchPendingKyc = async () => {
    try {
        const res = await api.get('/admin/pending-kyc');
        setPendingVoters(res.data.voters);
        setPendingCandidates(res.data.candidates);
    } catch (e) {
        console.error(e);
    }
  }

  const handleContextualLogin = async () => {
    setIsProcessingLogin(true);
    try {
      let targetAddress = address;
      if (!isConnected || !targetAddress) {
        const result = await connectAsync({ connector: injected() });
        targetAddress = result.accounts[0];
      }
      
      if (!isAuthenticated && targetAddress) {
        const nonceRes = await api.get('/auth/nonce?walletAddress=' + targetAddress);
        const signature = await signMessageAsync({ message: 'Sign this message to authenticate with the Voting System.\nNonce: ' + nonceRes.data.nonce });
        const verifyRes = await api.post('/auth/verify', { walletAddress: targetAddress, signature });
        localStorage.setItem('auth_token', verifyRes.data.access_token);
        
        const decoded: any = jwtDecode(verifyRes.data.access_token);
        if (decoded.role === 'Admin' || targetAddress.toLowerCase() === '0x8f71bcd375fc18c49ad36dffeaacc016c49778b9'.toLowerCase()) {
          setIsAdmin(true);
          setIsAuthenticated(true);
          fetchElections();
          fetchPendingKyc();
          toast.success('Admin wallet connected successfully!');
        } else {
          toast.error('Wallet connected, but it lacks Admin privileges.');
        }
      }
    } catch (e) {
      toast.error('Connection failed or rejected.');
    } finally {
      setIsProcessingLogin(false);
    }
  };

  const fetchElections = async () => {
    try {
      const res = await api.get('/elections');
      setElections(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const electionId = Math.floor(Math.random() * 1000000);
      const start = new Date(electionForm.startTime);
      if (isNaN(start.getTime())) {
        toast.error('Invalid start time');
        return;
      }
      const end = new Date(start.getTime() + electionForm.durationMinutes * 60000);
      await api.post('/elections', { 
        ...electionForm, 
        endTime: end.toISOString(), 
        electionId 
      });
      toast.success('Election drafted successfully!');
      setElectionForm({ title: '', description: '', startTime: getLocalISOString(), durationMinutes: 10 });
      fetchElections();
    } catch (error: any) {
      toast.error('Failed: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleResolveElection = async (contractAddress: string, electionId: number) => {
    try {
      if (!isConnected || !address) {
        toast.error('Wallet not connected. Please connect your admin wallet first.');
        const result = await connectAsync({ connector: injected() });
        if (!result.accounts[0]) return;
      }

      toast.loading('Resolving election on-chain...', { id: 'resolve' });
      await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'resolveElection',
        gas: BigInt(300000),
      });
      toast.dismiss('resolve');
      toast.success('Election resolved! Syncing result...');
      await api.patch('/elections/' + electionId + '/status', { status: 'Completed' });
      setTimeout(() => fetchElections(), 5000);
    } catch (e: any) {
      toast.dismiss('resolve');
      toast.error(e.shortMessage || e.message || 'Failed to resolve election');
    }
  };

  const handleStartElection = async (contractAddress: string, electionId: number) => {
    try {
      if (!isConnected || !address) {
        toast.error('Wallet not connected. Please connect your admin wallet first.');
        const result = await connectAsync({ connector: injected() });
        if (!result.accounts[0]) return;
      }

      toast.loading('Starting election on-chain...', { id: 'start' });
      const txHash = await writeContractAsync({
        address: contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'startElection',
        gas: BigInt(300000),
      });
      toast.dismiss('start');
      toast.success('Election started! Wait for confirmation.');
      await api.patch('/elections/' + electionId + '/status', { status: 'Active' });
      fetchElections();
    } catch (e: any) {
      toast.dismiss('start');
      toast.error(e.shortMessage || e.message || 'Failed to start election');
    }
  };

  const deployToBlockchain = async (electionId: number) => {
    try {
      if (!isConnected || !address) {
        toast.error('Wallet not connected. Please connect your admin wallet first.');
        const result = await connectAsync({ connector: injected() });
        if (!result.accounts[0]) return;
      }
      
      const txHash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createElection',
        args: [BigInt(electionId), BACKEND_VERIFIER],
        gas: BigInt(3000000),
      });
      toast.success('Transaction submitted! Waiting for confirmation...', { duration: 5000 });
      setTimeout(() => fetchElections(), 8000);
    } catch (e: any) {
      toast.error(e.shortMessage || e.message || 'Failed to deploy');
    }
  };

  const issueTokenAndApprove = async (walletAddress: string, role: string, isNadra = false) => {
    try {
        if (!isConnected || !address) {
            toast.error('Admin Wallet not connected.');
            return;
        }

        // Must find the active or latest election to issue token on
        // A robust system would ask which election to issue it for. We will use the first active/draft one.
        const activeElection = elections.find(e => e.contractAddress);
        if (!activeElection) {
            toast.error('No deployed election contract found. Please deploy an election first before issuing tokens.');
            return;
        }

        toast.loading('Issuing EVT Token to Voter...', { id: 'issue' });
        
        await writeContractAsync({
            address: activeElection.contractAddress as `0x${string}`,
            abi: ELECTION_ABI,
            functionName: 'issueToken',
            args: [walletAddress as `0x${string}`],
            gas: BigInt(300000),
        });

        toast.success('Token Issued on-chain!');

        if (isNadra) {
            await api.post('/admin/nadra-add', { walletAddress });
            setNadraWallet('');
        } else {
            await api.post('/admin/approve-kyc', { walletAddress, role });
            fetchPendingKyc();
        }
        
        toast.dismiss('issue');
        toast.success('User Approved and Token Transferred!');

    } catch (e: any) {
        toast.dismiss('issue');
        toast.error(e.shortMessage || e.message || 'Failed to issue token');
    }
  }

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="w-full bg-transparent min-h-screen flex items-center justify-center">
        <Background />
        <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Admin Access Required</h1>
          <p className="text-green-200 mb-6">Please authenticate with the admin wallet to proceed.</p>
          <button 
            onClick={handleContextualLogin}
            disabled={isProcessingLogin}
            className="w-full py-3 bg-[#115740] hover:bg-[#0D402F] text-white font-bold rounded-xl transition-all disabled:opacity-50"
          >
            {isProcessingLogin ? 'Authenticating...' : 'Connect Admin Wallet'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-transparent min-h-screen">
      <Background />
      <div className="max-w-7xl mx-auto p-6 py-12 relative z-10 grid md:grid-cols-3 gap-8">
        
        {/* Left Col: Forms */}
        <div className="md:col-span-1 space-y-8">
          <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-green-400">?</span> Draft New Election
            </h2>
            <form onSubmit={handleCreateElection} className="flex flex-col gap-4">
              <input 
                required
                type="text" 
                placeholder="Election Title" 
                className="w-full bg-black/60 border border-green-500/30 rounded-lg p-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                value={electionForm.title} onChange={e => setElectionForm({...electionForm, title: e.target.value})}
              />
              <textarea 
                placeholder="Description" 
                className="w-full bg-black/60 border border-green-500/30 rounded-lg p-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 h-24"
                value={electionForm.description} onChange={e => setElectionForm({...electionForm, description: e.target.value})}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-green-300/70 mb-1 block">Start Time</label>
                  <input 
                    required type="datetime-local" 
                    className="w-full bg-black/60 border border-green-500/30 rounded-lg p-3 text-green-100 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    value={electionForm.startTime} onChange={e => setElectionForm({...electionForm, startTime: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-green-300/70 mb-1 block">Duration (Minutes)</label>
                  <input 
                    required type="number" min="1"
                    className="w-full bg-black/60 border border-green-500/30 rounded-lg p-3 text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    value={electionForm.durationMinutes} onChange={e => setElectionForm({...electionForm, durationMinutes: Number(e.target.value)})}
                  />
                </div>
              </div>
              <button type="submit" className="mt-4 w-full py-3 bg-[#115740] hover:bg-[#0D402F] text-white font-bold rounded-lg transition-colors">
                Save Draft Off-Chain
              </button>
            </form>
          </div>

          <div className="bg-black/40 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-blue-400">???</span> NADRA Auth
            </h2>
            <p className="text-xs text-blue-200/70 mb-4">Add a voter manually to bypass KYC and auto-issue EVT token.</p>
            <div className="flex flex-col gap-4">
              <input 
                type="text" 
                placeholder="0x..." 
                className="w-full bg-black/60 border border-blue-500/30 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={nadraWallet} onChange={e => setNadraWallet(e.target.value)}
              />
              <button 
                onClick={() => issueTokenAndApprove(nadraWallet, 'Voter', true)}
                disabled={!nadraWallet || isPending}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
              >
                Approve & Issue Token
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Lists */}
        <div className="md:col-span-2 space-y-8">
            
          {/* Pending KYC Table */}
          <div className="bg-black/40 backdrop-blur-xl border border-orange-500/20 rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-orange-400">?</span> Pending KYC Requests
              </h2>
              <button onClick={fetchPendingKyc} className="p-2 hover:bg-orange-500/20 rounded-full text-orange-300 transition-colors" title="Refresh">
                ??
              </button>
            </div>
            
            <div className="space-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {[...pendingVoters, ...pendingCandidates].map(user => (
                    <div key={user.walletAddress} className="bg-black/60 border border-orange-500/30 rounded-xl p-4 flex justify-between items-center">
                        <div>
                            <div className="flex gap-2 items-center">
                                <h3 className="font-semibold text-white">{user.name}</h3>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 uppercase">{user.role}</span>
                            </div>
                            <p className="text-xs text-orange-200/60 mt-1">{user.walletAddress}</p>
                            <p className="text-xs text-orange-200/60 mt-1">CNIC: {user.cnic} | Age: {user.age}</p>
                        </div>
                        <button 
                            onClick={() => issueTokenAndApprove(user.walletAddress, user.role, false)}
                            disabled={isPending}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                            Approve
                        </button>
                    </div>
                ))}
                {pendingVoters.length === 0 && pendingCandidates.length === 0 && (
                    <div className="text-center p-8 text-orange-300/50 border-2 border-dashed border-orange-500/20 rounded-xl">
                        No pending KYC requests.
                    </div>
                )}
            </div>
          </div>

          <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-green-400">??</span> Manage Elections
              </h2>
              <button onClick={fetchElections} className="p-2 hover:bg-green-500/20 rounded-full text-green-300 transition-colors" title="Refresh">
                ??
              </button>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-4">
              {elections.map((el) => (
                <div key={el.electionId} className="bg-black/60 border border-green-500/30 rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-white">{el.title}</h3>
                      <span className={el.status === 'Active' ? 'text-xs px-2 py-1 rounded-md font-bold bg-green-500/20 text-green-300' : 'text-xs px-2 py-1 rounded-md font-bold bg-yellow-500/20 text-yellow-300'}>{el.status}</span>
                    </div>
                    {el.description && <p className="text-green-200/60 text-xs mt-1 line-clamp-1">{el.description}</p>}
                    
                    <div className="mt-4 space-y-1">
                      <p className="text-xs text-green-300/70">Start: {new Date(el.startTime).toLocaleString()}</p>
                      <p className="text-xs text-green-300/70">End: {new Date(el.endTime).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-green-500/20">
                    {el.contractAddress ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-green-400 font-mono break-all">Deployed: {el.contractAddress}</p>
                        {el.status === 'Draft' && (
                          <button 
                            onClick={() => handleStartElection(el.contractAddress, el.electionId)}
                            className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors"
                          >
                            Start Election
                          </button>
                        )}
                        {el.status === 'Active' && (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold text-green-300 text-center">? STATUS: ACTIVE (Voting Open)</span>
                            <button 
                              onClick={() => handleResolveElection(el.contractAddress, el.electionId)}
                              disabled={isPending}
                              className="w-full py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                              Resolve Election
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button 
                        onClick={() => deployToBlockchain(el.electionId)}
                        disabled={isPending}
                        className="mt-2 w-full py-2 bg-[#115740] hover:bg-[#0D402F] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {isPending ? 'Deploying...' : 'Deploy to Blockchain'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {elections.length === 0 && (
                <div className="col-span-2 text-center p-8 text-green-300/50 border-2 border-dashed border-green-500/20 rounded-xl">
                  No elections found. Draft one to get started.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
