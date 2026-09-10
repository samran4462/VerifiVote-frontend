'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useConnect, useSignMessage } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '../../lib/api';

type Step = 1 | 2 | 3;

function CameraCapture({ onCapture, onCancel }: { onCapture: (url: string) => void, onCancel: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [stream, setStream] = React.useState<MediaStream | null>(null);

  React.useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => {
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(err => {
        console.error("Camera access denied", err);
        alert("Camera access denied or not available on this device.");
        onCancel();
      });
    return () => {
      // Cleanup stream on unmount
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // Run only on mount

  // Watch stream state for cleanup if needed
  React.useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  }, [stream]);

  const capture = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        onCapture(canvas.toDataURL('image/jpeg', 0.8));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
       <div className="bg-white p-6 rounded-3xl w-full max-w-md flex flex-col items-center shadow-2xl">
          <h3 className="text-xl font-bold mb-4 text-slate-900">Live Selfie Capture</h3>
          <div className="w-full bg-black rounded-2xl overflow-hidden mb-6 aspect-video max-h-[50vh] flex items-center justify-center relative">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-0 border-4 border-[#115740]/30 rounded-2xl pointer-events-none" />
          </div>
          <div className="flex gap-4 w-full">
            <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-slate-800 font-bold rounded-xl transition-all">Cancel</button>
            <button onClick={capture} className="flex-1 py-3 bg-[#115740] hover:bg-[#0D402F] text-white font-bold rounded-xl shadow-lg shadow-[#115740]/30 transition-all">Take Photo</button>
          </div>
       </div>

    </div>
  );
}


export default function KycPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const [step, setStep] = useState<Step>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [form, setForm] = useState({ fullName: '', dob: '', electionId: '' });
  const [cnicFront, setCnicFront] = useState<string | null>(null);
  const [cnicBack, setCnicBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [elections, setElections] = useState<any[]>([]);

  useEffect(() => {
    fetchElections();
  }, []);

  const fetchElections = async () => {
    try {
      const res = await api.get('/elections');
      setElections(res.data.filter((e: any) => e.status === 'Active' || e.status === 'Draft'));
    } catch (e) { console.error(e); }
  };

  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const toBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (file) setter(await toBase64(file));
  };

  const handleStep1Submit = async () => {
    if (!form.fullName || !form.dob || !form.electionId) return toast.error('Please fill all required fields.');
    if (!cnicFront || !cnicBack || !selfie) return toast.error('Please upload CNIC Front, Back, and Selfie.');
    setIsProcessing(true);
    try {
      let targetAddress = address;
      if (!isConnected || !targetAddress) {
        const result = await connectAsync({ connector: injected() });
        targetAddress = result.accounts[0];
      }
      setWalletAddress(targetAddress!);
      toast.loading('AI is verifying your identity...', { id: 'kyc' });
      const res = await api.post('/kyc/verify', {
        walletAddress: targetAddress,
        role: 'VOTER',
        electionId: Number(form.electionId),
        cnicFrontBase64: cnicFront,
        cnicBackBase64: cnicBack,
        selfieBase64: selfie,
        expectedName: form.fullName,
        expectedDob: form.dob
      });
      toast.dismiss('kyc');
      if (res.data?.status === 'Pending') {
        toast.success(res.data.message || 'KYC submitted! Awaiting Admin Approval.');
        setTimeout(() => router.push('/'), 2000);
      } else {
        toast.error('Unexpected response from AI Verification.');
      }
    } catch (e: any) {
      toast.dismiss('kyc');
      toast.error(e?.response?.data?.message || e?.message || 'KYC verification failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStep2Sign = async () => {
    setIsProcessing(true);
    try {
      let targetAddress = walletAddress || address;
      if (!isConnected || !targetAddress) {
        const result = await connectAsync({ connector: injected() });
        targetAddress = result.accounts[0];
        setWalletAddress(targetAddress);
      }
      const nonceRes = await api.get('/auth/nonce?walletAddress=' + targetAddress);
      const signature = await signMessageAsync({
        message: 'Sign this message to authenticate with the Voting System.\nNonce: ' + nonceRes.data.nonce,
      });
      const verifyRes = await api.post('/auth/verify', { walletAddress: targetAddress, signature });
      localStorage.setItem('auth_token', verifyRes.data.access_token);
      toast.success('Wallet authenticated! Redirecting...');
      setStep(3);
      setTimeout(() => router.push('/vote'), 1500);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Authentication failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const stepMeta = [
    { num: 1, label: 'Identity Verification' },
    { num: 2, label: 'Wallet Auth' },
    { num: 3, label: 'Access Granted' },
  ];

  interface UploadBoxProps {
    label: string;
    value: string | null;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    capture?: string;
    onClickOverride?: () => void;
  }
  const UploadBox = ({ label, value, inputRef, onChange, capture, onClickOverride }: UploadBoxProps) => (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      <div
        onClick={() => onClickOverride ? onClickOverride() : inputRef.current?.click()}
        className={`cursor-pointer w-full h-28 flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${value ? 'border-[#115740] bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-[#115740]'}`}
      >
        {value
          ? <span className="text-green-700 font-bold text-sm">✓ Uploaded</span>
          : <span className="text-slate-400 text-sm">Click to upload</span>
        }
        {capture ? (
          <input ref={inputRef} type="file" accept="image/*" capture={capture} className="hidden" onChange={onChange} />
        ) : (
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-6 py-12 relative z-10">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-10 relative">
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-gray-200 -z-10" />
        {stepMeta.map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-2 z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step > s.num ? 'bg-[#115740] border-[#115740] text-white' : step === s.num ? 'bg-white border-[#115740] text-[#115740]' : 'bg-white border-gray-200 text-slate-400'}`}>
              {step > s.num ? '✓' : s.num}
            </div>
            <span className={`text-xs font-medium text-center max-w-[90px] ${step >= s.num ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Identity Verification</h1>
            <p className="text-slate-500 text-sm mb-8">Our Gemini AI will verify your identity from your CNIC and selfie.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                <input type="text" placeholder="As written on your CNIC" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#115740] outline-none" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Date of Birth</label>
                <input type="date" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#115740] outline-none" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Election ID</label>
                <input type="number" placeholder="e.g. 1" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#115740] outline-none" value={form.electionId} onChange={e => setForm({ ...form, electionId: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <UploadBox label="CNIC Front" value={cnicFront} inputRef={frontRef} onChange={e => handleFileChange(e, setCnicFront)} />
                <UploadBox label="CNIC Back" value={cnicBack} inputRef={backRef} onChange={e => handleFileChange(e, setCnicBack)} />
                <UploadBox label="Live Selfie" value={selfie} inputRef={selfieRef} onChange={e => handleFileChange(e, setSelfie)} onClickOverride={() => setShowCamera(true)} />
              </div>
              <button onClick={handleStep1Submit} disabled={isProcessing} className="w-full mt-2 py-3 bg-[#115740] hover:bg-[#0D402F] text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50">
                {isProcessing ? 'AI Verifying...' : 'Verify My Identity →'}
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-[#115740]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Identity Confirmed!</h2>
            <p className="text-slate-500 mb-8">Now prove wallet ownership by signing a message. This does not cost any gas.</p>
            {walletAddress && <div className="px-4 py-3 bg-gray-50 rounded-xl text-slate-700 font-mono text-sm mb-6 border border-gray-200">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</div>}
            <button onClick={handleStep2Sign} disabled={isProcessing} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50">
              {isProcessing ? 'Awaiting Signature...' : 'Sign & Authenticate Wallet'}
            </button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }} className="w-20 h-20 bg-[#115740] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">All Set!</h2>
            <p className="text-slate-500">You are verified and authenticated. Redirecting to Voter Portal...</p>
          </motion.div>
        )}
      </AnimatePresence>
      {showCamera && <CameraCapture onCapture={(img) => { setSelfie(img); setShowCamera(false); }} onCancel={() => setShowCamera(false)} />}

    </div>
  );
}
