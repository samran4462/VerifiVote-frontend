'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Critical Frontend Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gray-900 border border-red-500/50 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl shadow-red-500/20"
      >
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-red-400 mb-2">Web3 Connection Terminated</h2>
        <p className="text-gray-400 mb-6 text-sm">
          A critical error occurred while attempting to synchronize with the blockchain provider or wallet instance. 
          {error.message && (
            <span className="block mt-2 font-mono text-xs text-red-300 bg-red-900/20 p-2 rounded break-words">
              {error.message}
            </span>
          )}
        </p>
        <button
          onClick={() => reset()}
          className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 transition-all w-full"
        >
          Re-Initialize Connection
        </button>
      </motion.div>
    </div>
  );
}
