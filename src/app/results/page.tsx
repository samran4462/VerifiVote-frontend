'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReadContract, useReadContracts, usePublicClient } from 'wagmi';
import { parseAbi, parseAbiItem, formatUnits } from 'viem';
import api from '../../lib/api';
import toast from 'react-hot-toast';

const ELECTION_ABI = parseAbi([
  'function state() view returns (uint8)',
  'function startTime() view returns (uint256)',
  'function winnerId() view returns (uint256)',
  'function candidates(uint256) view returns (uint256 id, string name, uint256 voteCount)',
  'event VoteCast(address indexed voter, uint256 indexed candidateId)'
]);

const VOTING_DURATION_SECONDS = 600; // 10 minutes

export default function ResultsDashboard() {
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElection, setSelectedElection] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<string>('00:00');
  const publicClient = usePublicClient();

  useEffect(() => {
    fetchElections();
  }, []);

  useEffect(() => {
    if (selectedElection) {
      fetchCandidates(selectedElection.electionId);
      fetchAuditLogs();
    }
  }, [selectedElection]);

  const fetchElections = async () => {
    try {
      const res = await api.get('/elections');
      setElections(res.data.filter((e: any) => e.contractAddress));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCandidates = async (id: number) => {
    try {
      const res = await api.get(`/candidates?electionId=${id}`);
      setCandidates(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditLogs = async () => {
    if (!publicClient || !selectedElection?.contractAddress) return;
    try {
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 999n ? currentBlock - 999n : 0n;
      
      const logs = await publicClient.getLogs({
        address: selectedElection.contractAddress as `0x${string}`,
        event: parseAbiItem('event VoteCast(address indexed voter, uint256 indexed candidateId)'),
        fromBlock,
        toBlock: 'latest'
      });
      setAuditLogs(logs.reverse()); // Newest first
    } catch (e) {
      console.error("Error fetching logs", e);
    }
  };

  // On-Chain Reads for Election State
  const { data: electionStateData } = useReadContracts({
    contracts: [
      {
        address: selectedElection?.contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'state',
      },
      {
        address: selectedElection?.contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'startTime',
      },
      {
        address: selectedElection?.contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'winnerId',
      }
    ],
    query: {
      enabled: !!selectedElection?.contractAddress,
      refetchInterval: 5000 // Poll every 5s for live dashboard feel
    }
  });

  const onChainState = electionStateData?.[0]?.result as number | undefined;
  const onChainStartTime = electionStateData?.[1]?.result as bigint | undefined;
  const onChainWinnerId = electionStateData?.[2]?.result as bigint | undefined;

  // On-Chain Reads for Candidates (Cryptographic Proof)
  const { data: candidateVotesData } = useReadContracts({
    contracts: candidates.map((c) => ({
      address: selectedElection?.contractAddress as `0x${string}`,
      abi: ELECTION_ABI,
      functionName: 'candidates',
      args: [BigInt(c.candidateId)]
    })),
    query: {
      enabled: candidates.length > 0 && !!selectedElection?.contractAddress,
      refetchInterval: 5000
    }
  });

  // Hydrate candidate list with live on-chain votes & sort dynamically
  const hydratedCandidates = candidates.map((c, index) => {
    const chainData = candidateVotesData?.[index]?.result as any;
    const liveVotes = chainData ? Number(chainData[2]) : c.voteCount;
    return { ...c, liveVotes };
  }).sort((a, b) => b.liveVotes - a.liveVotes);

  // Timer Logic
  useEffect(() => {
    if (!onChainStartTime || onChainState !== 1) {
      setTimeLeft('00:00');
      return;
    }

    const interval = setInterval(() => {
      const startMs = Number(onChainStartTime) * 1000;
      const endMs = startMs + (VOTING_DURATION_SECONDS * 1000);
      const now = Date.now();
      const diff = endMs - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        clearInterval(interval);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [onChainStartTime, onChainState]);

  const getStateBadge = () => {
    if (onChainState === 0) return <span className="bg-gray-500/20 text-gray-300 px-3 py-1 rounded-full text-xs">Draft</span>;
    if (onChainState === 1) return <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs">Active Voting</span>;
    if (onChainState === 2) return <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs">Completed</span>;
    if (onChainState === 3) return <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs">Draw / Tied</span>;
    return <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs">Cancelled</span>;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 py-12">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 mb-4">
          Public Audit Ledger
        </h1>
        <p className="text-gray-400">Cryptographically verified election results directly from the Sepolia Testnet.</p>
      </motion.div>

      {!selectedElection ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-3 gap-6">
          {elections.map((el) => (
            <div 
              key={el.electionId} 
              onClick={() => setSelectedElection(el)} 
              className="cursor-pointer bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-teal-500 transition-colors shadow-lg flex flex-col justify-between h-48"
            >
              <div>
                <h3 className="text-xl font-bold text-gray-200 mb-2 line-clamp-1">{el.title}</h3>
                <p className="text-gray-500 text-sm line-clamp-2">{el.description}</p>
              </div>
              <div className="flex justify-between items-center mt-4 border-t border-gray-800 pt-4">
                <span className="text-xs text-gray-600 font-mono">ID: {el.electionId}</span>
                <span className="text-teal-400 text-sm font-medium">View Ledger →</span>
              </div>
            </div>
          ))}
          {elections.length === 0 && <div className="text-gray-500 col-span-3 text-center py-20">No deployed elections found.</div>}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Dashboard Panel */}
          <div className="lg:col-span-2 space-y-6">
            <button onClick={() => setSelectedElection(null)} className="text-teal-400 hover:text-teal-300 text-sm font-semibold flex items-center gap-2 mb-4">
              ← Back to Ledgers
            </button>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-bold mb-2 text-white">{selectedElection.title}</h2>
                  <p className="text-gray-400 text-sm break-all font-mono">Contract: {selectedElection.contractAddress}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStateBadge()}
                  {onChainState === 1 && (
                    <div className="text-2xl font-mono text-teal-400 bg-gray-950 px-4 py-2 rounded-lg border border-gray-800 shadow-inner">
                      {timeLeft}
                    </div>
                  )}
                </div>
              </div>

              {onChainState === 2 && onChainWinnerId !== undefined && (
                <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/40 to-teal-900/40 border border-teal-500/30 rounded-xl flex items-center gap-6">
                  <div className="text-5xl">🏆</div>
                  <div>
                    <h3 className="text-lg text-teal-300 font-semibold mb-1">Official Winner Declared</h3>
                    <p className="text-2xl font-bold text-white">
                      {hydratedCandidates.find(c => c.candidateId === Number(onChainWinnerId))?.partyName || `Candidate #${Number(onChainWinnerId)}`}
                    </p>
                  </div>
                </div>
              )}

              {onChainState === 3 && (
                <div className="mb-8 p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-6">
                  <div className="text-5xl">⚖️</div>
                  <div>
                    <h3 className="text-lg text-yellow-400 font-semibold mb-1">Election Ended in a Draw</h3>
                    <p className="text-sm text-gray-400">The smart contract determined a mathematical tie between the top candidates.</p>
                  </div>
                </div>
              )}

              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-teal-400">❖</span> Live Mathematical Tally
              </h3>
              
              <div className="space-y-4">
                <AnimatePresence>
                  {hydratedCandidates.map((c, idx) => (
                    <motion.div
                      key={c.candidateId}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex items-center justify-between relative overflow-hidden"
                    >
                      {/* Progress Bar Background */}
                      <motion.div 
                        className="absolute left-0 top-0 bottom-0 bg-teal-900/20 z-0"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (c.liveVotes / (hydratedCandidates[0]?.liveVotes || 1)) * 100)}%` }}
                        transition={{ duration: 1 }}
                      />
                      
                      <div className="relative z-10 flex items-center gap-4">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${idx === 0 && c.liveVotes > 0 ? 'bg-teal-500 text-gray-900' : 'bg-gray-800 text-gray-400'}`}>
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="font-bold text-lg text-gray-200">{c.partyName || 'Independent'}</h4>
                          <span className="text-xs text-gray-500 font-mono">ID: {c.candidateId}</span>
                        </div>
                      </div>
                      
                      <div className="relative z-10 text-right">
                        <motion.span 
                          key={c.liveVotes}
                          initial={{ scale: 1.5, color: '#2dd4bf' }}
                          animate={{ scale: 1, color: '#ffffff' }}
                          className="text-3xl font-black tabular-nums"
                        >
                          {c.liveVotes}
                        </motion.span>
                        <span className="text-sm text-gray-500 ml-2">votes</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {candidates.length === 0 && <div className="text-center py-6 text-gray-500">No candidates registered.</div>}
              </div>
            </div>
          </div>

          {/* Audit Trail Sidebar */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl h-[800px] flex flex-col">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-teal-400">❖</span> Cryptographic Audit Trail
            </h3>
            <p className="text-xs text-gray-500 mb-4 pb-4 border-b border-gray-800">
              Live event logs fetched directly from the Sepolia network. Proof of absolute transparency.
            </p>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-700">
              {auditLogs.length > 0 ? auditLogs.map((log, i) => (
                <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase text-teal-500 bg-teal-500/10 px-2 py-1 rounded">VoteCast</span>
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${log.transactionHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-gray-400 hover:text-teal-400 underline decoration-gray-600"
                    >
                      TxHash ↗
                    </a>
                  </div>
                  <p className="text-xs text-gray-400 font-mono break-all mb-1">
                    <span className="text-gray-600">Voter:</span> {log.args.voter}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">
                    <span className="text-gray-600">Candidate ID:</span> {Number(log.args.candidateId)}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-2 text-right">Block: {Number(log.blockNumber)}</p>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
                  <span className="text-4xl mb-2 opacity-20">⛓️</span>
                  No on-chain votes cast yet.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
