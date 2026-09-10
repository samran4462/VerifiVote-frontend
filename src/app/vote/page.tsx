'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useReadContract, useWriteContract, useConnect, useSignMessage, useWatchContractEvent } from 'wagmi';
import { injected } from 'wagmi/connectors';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { parseAbi } from 'viem';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useRouter } from 'next/navigation';

const ELECTION_ABI = parseAbi([
  'function castVote(uint256 _candidateId) external',
  'function hasToken(address) view returns (bool)',
  'function hasVoted(address) view returns (bool)',
  'event VoteCast(address indexed voter, uint256 candidateId, uint256 weight)',
  'function electionState() view returns (uint8)'
]);

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

export default function VotePortal() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const [elections, setElections] = useState<any[]>([]);
  const [selectedElection, setSelectedElection] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [electionState, setElectionState] = useState<number | null>(null);

  // Wagmi Reads
  const { data: userHasToken, refetch: refetchHasToken } = useReadContract({
    address: selectedElection?.contractAddress as `0x${string}`,
    abi: ELECTION_ABI,
    functionName: 'hasToken',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!selectedElection?.contractAddress && !!address }
  });

  const { data: userHasVoted, refetch: refetchHasVoted } = useReadContract({
    address: selectedElection?.contractAddress as `0x${string}`,
    abi: ELECTION_ABI,
    functionName: 'hasVoted',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!selectedElection?.contractAddress && !!address }
  });

  const { data: contractState } = useReadContract({
    address: selectedElection?.contractAddress as `0x${string}`,
    abi: ELECTION_ABI,
    functionName: 'electionState',
    query: { enabled: !!selectedElection?.contractAddress }
  });

  useEffect(() => {
      if (contractState !== undefined) {
          setElectionState(contractState as number);
      }
  }, [contractState]);

  // Live Event Listener
  useWatchContractEvent({
    address: selectedElection?.contractAddress as `0x${string}`,
    abi: ELECTION_ABI,
    eventName: 'VoteCast',
    onLogs(logs) {
      logs.forEach((log) => {
        const voter = log.args.voter;
        const cId = Number(log.args.candidateId);
        const partyName = candidates.find(c => c.candidateId === cId)?.partyName || 'Unknown Party';
        
        setLiveFeed(prev => {
            const newFeed = [{ voter, partyName, time: new Date().toLocaleTimeString() }, ...prev];
            return newFeed.slice(0, 5); // keep last 5
        });
        
        // Refresh candidate counts
        fetchCandidates(selectedElection.electionId);
      });
    },
  });

  useEffect(() => {
    fetchElections();
    if (localStorage.getItem('auth_token')) setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    if (selectedElection) {
        fetchCandidates(selectedElection.electionId);
        refetchHasToken();
        refetchHasVoted();
    }
  }, [selectedElection, address]);

  const fetchElections = async () => {
    try {
      const res = await api.get('/elections');
      // Voters can see Active or Completed (to view results)
      setElections(res.data.filter((e: any) => (e.status === 'Active' || e.status === 'Completed') && e.contractAddress));
    } catch (e: any) { console.error(e); }
  };

  const fetchCandidates = async (id: any) => {
    try {
      const res = await api.get('/candidates?electionId=' + id);
      setCandidates(res.data);
    } catch (e: any) { console.error(e); }
  };

  const authenticateWallet = async () => {
    try {
        let targetAddress = address;
        if (!isConnected || !targetAddress) {
            const result = await connectAsync({ connector: injected() });
            targetAddress = result.accounts[0];
        }

        if (!isAuthenticated) {
            toast.loading('Authenticating...', { id: 'auth' });
            const nonceRes = await api.get('/auth/nonce?walletAddress=' + targetAddress);
            const signature = await signMessageAsync({
                message: 'Sign this message to authenticate with the Voting System.\nNonce: ' + nonceRes.data.nonce,
            });
            const verifyRes = await api.post('/auth/verify', { walletAddress: targetAddress, signature });
            localStorage.setItem('auth_token', verifyRes.data.access_token);
            setIsAuthenticated(true);
            toast.dismiss('auth');
            toast.success('Wallet Authenticated!');
        }
    } catch (e: any) {
        toast.dismiss('auth');
        toast.error('Authentication failed.');
    }
  };

  const castVote = async (candidateId: number) => {
    setTxPending(true);
    toast.loading('Casting vote on-chain...', { id: 'vote' });
    try {
      const tx = await writeContractAsync({
        address: selectedElection.contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'castVote',
        args: [BigInt(candidateId)],
        gas: BigInt(200000),
      });
      toast.dismiss('vote');
      toast.success('Vote cast successfully!');
      
      // Update local state temporarily until blockchain updates
      refetchHasVoted();
      refetchHasToken();
    } catch (e: any) {
      toast.dismiss('vote');
      toast.error(e?.shortMessage || e?.message || 'Vote failed');
    } finally {
      setTxPending(false);
    }
  };

  return (
    <div className="w-full bg-transparent min-h-screen">
      <Background />
      <div className="max-w-5xl mx-auto p-6 py-12 relative z-10">
        {!selectedElection ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-6">
            <div className="col-span-2 mb-4">
              <h1 className="text-4xl font-bold text-white mb-2">Voting Portal</h1>
              <p className="text-green-200">Select an active election to securely cast your vote on-chain.</p>
            </div>
            
            {elections.map((el) => (
              <div key={el.electionId} className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-6 transition-all hover:scale-[1.02]">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-bold text-white leading-tight">{el.title}</h3>
                  <span className={el.status === 'Active' ? 'px-3 py-1 bg-green-500/20 text-green-300 rounded-full border border-green-500/30 text-xs font-bold' : 'px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30 text-xs font-bold'}>
                    {el.status}
                  </span>
                </div>
                <p className="text-green-200/80 mb-6 text-sm line-clamp-2 h-10">{el.description}</p>
                <div className="flex justify-between text-xs text-green-400/60">
                  <span>ID: {el.electionId}</span>
                  <span>Contract: {el.contractAddress?.slice(0, 10)}...</span>
                </div>
                <button 
                    onClick={() => setSelectedElection(el)}
                    className="mt-4 w-full py-3 bg-[#115740] hover:bg-[#0D402F] text-white font-bold rounded-xl transition-all"
                >
                  Enter Portal
                </button>
              </div>
            ))}
            {elections.length === 0 && (
              <div className="col-span-2 bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-12 text-center">
                <div className="text-5xl mb-4 opacity-50">???</div>
                <h3 className="text-xl font-bold text-white mb-2">No Active Elections</h3>
                <p className="text-green-300">No active elections right now. Check back later.</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <button onClick={() => setSelectedElection(null)}
              className="text-green-400 hover:text-green-200 text-sm font-semibold flex items-center gap-2">
              ? Back to Elections
            </button>

            <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-8">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-3xl font-bold text-white">{selectedElection.title}</h2>
                <span className={selectedElection.status === 'Active' ? 'px-3 py-1 bg-green-500/20 text-green-300 rounded-full border border-green-500/30 text-xs font-bold' : 'px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30 text-xs font-bold'}>
                    {selectedElection.status}
                </span>
              </div>
              <p className="text-green-200 mb-4">{selectedElection.description}</p>
              <div className="text-xs text-green-400/60 font-mono">Contract: {selectedElection.contractAddress}</div>
            </div>

            {/* Tie / Results Logic */}
            {selectedElection.status === 'Completed' && electionState === 3 && (
                <div className="bg-black/40 backdrop-blur-xl border border-yellow-500/50 rounded-2xl shadow-xl p-8 text-center">
                    <div className="text-5xl mb-4">??</div>
                    <h3 className="text-3xl font-bold text-yellow-400 mb-2">Match Tie - 2nd Round Required</h3>
                    <p className="text-yellow-200">The election resulted in a draw. Please await instructions for the second round.</p>
                </div>
            )}

            {selectedElection.status === 'Completed' && electionState !== 3 && (
                <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-8 text-center">
                    <div className="text-5xl mb-4">??</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Election Completed</h3>
                    <p className="text-green-200">Voting is closed. Check the admin dashboard or blockchain for final results.</p>
                </div>
            )}

            {/* Voting Interface */}
            {selectedElection.status === 'Active' && (
                <>
                {userHasVoted ? (
                  <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-8 text-center">
                    <div className="text-5xl mb-4">?</div>
                    <h3 className="text-2xl font-bold text-green-400 mb-2">Vote Recorded on Blockchain!</h3>
                    <p className="text-green-200">Your vote has been permanently recorded. Thank you for participating.</p>
                  </div>
                ) : userHasToken ? (
                  <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-bold text-white">Select a Candidate</h3>
                      <span className="text-xs bg-green-500/20 text-green-300 px-3 py-1 rounded-full border border-green-500/30">
                        1 Token Available
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      {candidates.map(c => (
                        <div key={c.candidateId} className="bg-black/60 p-5 rounded-xl border border-green-500/30 flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-lg text-white">{c.name}</h4>
                            <p className="text-green-300 text-sm">{c.partyName || 'Independent'}</p>
                          </div>
                          <button onClick={() => castVote(c.candidateId)} disabled={txPending}
                            className="px-5 py-3 bg-[#115740] hover:bg-[#0D402F] disabled:opacity-50 text-white rounded-lg font-bold transition-all">
                            {txPending ? '...' : 'Vote'}
                          </button>
                        </div>
                      ))}
                      {candidates.length === 0 && (
                        <div className="col-span-2 p-8 text-center text-green-300/60">No candidates registered yet.</div>
                      )}
                    </div>
                  </div>
                ) : !isAuthenticated ? (
                  <div className="bg-black/40 backdrop-blur-xl border border-green-500/20 rounded-2xl shadow-xl p-8 text-center">
                    <div className="text-4xl mb-4">??</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Connect to Vote</h3>
                    <p className="text-green-200 mb-6">Connect your wallet to check your eligibility.</p>
                    <button onClick={authenticateWallet}
                      className="px-8 py-3 bg-[#115740] hover:bg-[#0D402F] text-white rounded-xl font-bold shadow-lg transition-all">
                      Connect & Authenticate
                    </button>
                  </div>
                ) : (
                  <div className="bg-black/40 backdrop-blur-xl border border-orange-500/20 rounded-2xl shadow-xl p-8 text-center">
                    <div className="text-4xl mb-4">???</div>
                    <h3 className="text-2xl font-bold text-white mb-2">Not Eligible / Pending Approval</h3>
                    <p className="text-orange-200 mb-6">You do not have a voting token for this election. If you haven't completed KYC, please do so. If you have, please wait for Admin Approval.</p>
                    <button onClick={() => router.push('/kyc')}
                      className="px-8 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg transition-all">
                      Go to KYC Portal
                    </button>
                  </div>
                )}
                </>
            )}

            {/* Live Feed */}
            {selectedElection.status === 'Active' && liveFeed.length > 0 && (
                <div className="bg-black/40 backdrop-blur-xl border border-blue-500/20 rounded-2xl shadow-xl p-6">
                    <h3 className="text-lg font-bold text-blue-300 mb-4 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                        Live Voting Feed
                    </h3>
                    <div className="space-y-3">
                        {liveFeed.map((event, i) => (
                            <motion.div 
                                initial={{ opacity: 0, x: -20 }} 
                                animate={{ opacity: 1, x: 0 }}
                                key={i} 
                                className="bg-black/60 border border-blue-500/30 rounded-lg p-3 text-sm flex justify-between items-center"
                            >
                                <span className="text-white">
                                    <span className="font-mono text-blue-200">{event.voter.slice(0,6)}...{event.voter.slice(-4)}</span> just voted for <span className="font-bold text-blue-400">{event.partyName}</span>!
                                </span>
                                <span className="text-xs text-blue-200/50">{event.time}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

          </motion.div>
        )}
      </div>
    </div>
  );
}
