'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useWriteContract, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { parseAbi } from 'viem';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useMemo } from 'react';

const ELECTION_ABI = parseAbi([
  'function registerCandidate(string memory _name, bytes calldata signature) external'
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

export default function CandidatePortal() {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { writeContractAsync } = useWriteContract();

  const [elections, setElections] = useState<any[]>([]);
  const [selectedElection, setSelectedElection] = useState<any | null>(null);

  const [form, setForm] = useState({ name: '', partyName: '', proposal: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchElections();
  }, []);

  const fetchElections = async () => {
    try {
      const res = await api.get('/elections');
      setElections(res.data.filter((e: any) => e.status === 'Draft' || e.status === 'Active'));
    } catch (error) {
      console.error('Failed to fetch elections', error);
    }
  };

  const handleRegister = async () => {
    if (!selectedElection) return toast.error('Please select an election.');
    if (!form.name || !form.partyName || !form.proposal) return toast.error('Please fill all fields.');

    setIsProcessing(true);
    try {
      let targetAddress = address;
      if (!isConnected || !targetAddress) {
        const result = await connectAsync({ connector: injected() });
        targetAddress = result.accounts[0];
      }

      const res = await api.post('/candidates/register', {
        walletAddress: targetAddress,
        name: form.name,
        partyName: form.partyName,
        proposal: form.proposal,
        electionId: selectedElection.electionId
      });

      if (!res.data.signature) throw new Error('Failed to obtain backend signature.');

      const tx = await writeContractAsync({
        address: selectedElection.contractAddress as `0x${string}`,
        abi: ELECTION_ABI,
        functionName: 'registerCandidate',
        args: [form.name, res.data.signature as `0x${string}`],
        gas: BigInt(400000),
      });

      toast.success('Successfully registered on-chain!');
      setForm({ name: '', partyName: '', proposal: '' });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Registration failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full bg-transparent min-h-screen">
      <Background />
      <div className="max-w-4xl mx-auto p-6 py-12 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/40 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-green-500/20 p-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Candidate Portal</h1>
        <p className="text-green-200 mb-8">Register yourself as a candidate for an upcoming election.</p>

        <div className="space-y-6 max-w-xl">
          
          <div>
            <label className="block text-sm font-semibold text-green-300 mb-2">Select Active Election</label>
            <div className="grid md:grid-cols-2 gap-4">
              {elections.map((el) => (
                <div 
                  key={el.electionId} 
                  onClick={() => setSelectedElection(el)} 
                  className={`cursor-pointer border rounded-2xl p-4 transition-all ${selectedElection?.electionId === el.electionId ? 'bg-green-500/20 border-green-400' : 'bg-black/40 border-green-500/20 hover:border-green-400/50'}`}
                >
                  <h3 className="text-xl font-bold text-white mb-1">{el.title}</h3>
                  <p className="text-green-200/70 text-xs line-clamp-2 mb-2">{el.description}</p>
                  <span className="text-[10px] px-2 py-1 bg-[#115740] rounded-full text-white">{el.status}</span>
                </div>
              ))}
              {elections.length === 0 && (
                 <div className="col-span-2 p-4 text-center text-green-300/50">No elections open for registration.</div>
              )}
            </div>
          </div>


          <div>
            <label className="block text-sm font-semibold text-green-300 mb-2">Full Name</label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              className="w-full px-4 py-3 bg-black/60 border border-green-500/30 text-white rounded-xl focus:ring-2 focus:ring-[#115740] outline-none"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-green-300 mb-2">Party Name</label>
            <input
              type="text"
              placeholder="e.g. Independent, Green Party"
              className="w-full px-4 py-3 bg-black/60 border border-green-500/30 text-white rounded-xl focus:ring-2 focus:ring-[#115740] outline-none"
              value={form.partyName}
              onChange={e => setForm({...form, partyName: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-green-300 mb-2">Campaign Proposal</label>
            <textarea
              placeholder="Outline your vision and promises..."
              rows={4}
              className="w-full px-4 py-3 bg-black/60 border border-green-500/30 text-white rounded-xl focus:ring-2 focus:ring-[#115740] outline-none resize-none"
              value={form.proposal}
              onChange={e => setForm({...form, proposal: e.target.value})}
            />
          </div>

          <div className="pt-4">
            <button
              onClick={handleRegister}
              disabled={isProcessing}
              className="w-full py-4 text-white font-bold text-lg bg-[#115740] hover:bg-[#0D402F] rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              {isProcessing ? 'Processing Transaction...' : 'Connect Wallet & Register'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
    </div>
  );
}
