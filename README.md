# VerifiVote - Frontend

AI-Driven Decentralized Voting Platform Frontend built with Next.js (App Router), Wagmi, RainbowKit, Viem, and Tailwind CSS.

## Features
- **Modern UI & 3D Visuals:** Glassmorphism design system powered by Tailwind CSS, Framer Motion, and Three.js / React Three Fiber.
- **Web3 Integration:** Full wallet connection and smart contract interactions via Wagmi and Viem on Sepolia Testnet.
- **Multimodal AI KYC Portal:** Identity verification interface with automated CNIC front, back, and live selfie capture.
- **Admin Dashboard:** Election draft creation, on-chain deployment, pending KYC approval, and manual NADRA authorization.
- **Voting Portal:** Token balance verification, live voting feed via contract events, and real-time tie resolution.
- **Public Ledger:** Cryptographic audit trail and live mathematical vote tallying directly from the blockchain.

## Getting Started

First, install dependencies:
```bash
npm install
```

Copy the example environment file and configure your variables:
```bash
cp .env.example .env.local
```

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
