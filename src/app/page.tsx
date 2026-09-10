'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, Stars, Ring, Sphere, Torus } from '@react-three/drei';
import { motion } from 'framer-motion';

// Majestic Blockchain Core representing National Security & Web3
function GovtCore() {
  const coreRef = useRef<any>(null);
  const ring1Ref = useRef<any>(null);
  const ring2Ref = useRef<any>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (coreRef.current) coreRef.current.rotation.y = t * 0.5;
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.3;
      ring1Ref.current.rotation.y = t * 0.4;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -t * 0.2;
      ring2Ref.current.rotation.z = t * 0.5;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1.5} position={[0, 0, 0]}>
      <group>
        {/* Outer Orbiting Blockchain Ring */}
        <Torus ref={ring1Ref} args={[4, 0.05, 16, 100]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#4ade80" emissive="#16a34a" emissiveIntensity={2} wireframe />
        </Torus>

        {/* Inner Orbiting Security Ring */}
        <Torus ref={ring2Ref} args={[3, 0.1, 16, 100]}>
          <meshStandardMaterial color="#ffffff" metalness={0.8} roughness={0.1} />
        </Torus>

        {/* Central Trust Sphere */}
        <Sphere ref={coreRef} args={[1.5, 64, 64]}>
          <meshStandardMaterial 
            color="#0D402F" 
            emissive="#115740" 
            emissiveIntensity={0.5} 
            metalness={0.9} 
            roughness={0.1} 
            wireframe={true} 
          />
        </Sphere>
        
        {/* Glowing Aura */}
        <Sphere args={[1.8, 32, 32]}>
          <meshBasicMaterial color="#22c55e" transparent opacity={0.1} />
        </Sphere>
      </group>
    </Float>
  );
}

// Floating Data Nodes (Voters/Identities)
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
      {points.map((p, i) => (
        <Float key={i} speed={1.5 + Math.random()} floatIntensity={2} position={p as [number, number, number]}>
          <Sphere args={[0.08, 8, 8]}>
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
          </Sphere>
        </Float>
      ))}
    </group>
  );
}

export default function Home() {
  return (
    <div className="w-full bg-transparent">
      {/* Premium 3D Background */}
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

      {/* Foreground Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center bg-transparent px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="max-w-4xl text-center p-12"
        >
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-300 text-sm font-semibold tracking-widest uppercase">
            Government of Pakistan
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 drop-shadow-lg">
            National E-Voting Portal
          </h1>
          <p className="text-lg md:text-2xl text-green-50/80 mb-10 leading-relaxed font-light max-w-3xl mx-auto">
            A state-of-the-art cryptographic voting infrastructure. Verify your identity securely via AI and cast your vote on an immutable Web3 ledger.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.a 
              href="/kyc"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-600/30 transition-all border border-green-400/50 pointer-events-auto"
            >
              Start KYC Verification
            </motion.a>
            <motion.a 
              href="/candidate"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold border border-white/30 transition-all shadow-md pointer-events-auto backdrop-blur-md"
            >
              Register as Candidate
            </motion.a>
            <motion.a 
              href="/results"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-[#0A3020] hover:bg-[#115740] text-white rounded-xl font-bold border border-[#115740] transition-all shadow-lg pointer-events-auto"
            >
              View Active Elections
            </motion.a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
