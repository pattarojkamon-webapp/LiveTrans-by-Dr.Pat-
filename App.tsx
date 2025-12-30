import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { getRoleInstruction, GEMINI_MODEL } from './constants';
import { TranscriptEntry } from './types';
import { encodeAudio, decodeAudio, decodeAudioData, downsample } from './services/audioService';
import AudioVisualizer from './components/AudioVisualizer';

type AccentTheme = 'professional' | 'trustworthy' | 'global' | 'premium';
type VoiceGender = 'Male' | 'Female';
type UserRole = 'Professor' | 'Student';

// High-quality 3D Anime Style Avatar URLs
const AVATARS = {
  Professor: 'https://i.postimg.cc/8z0ZzZp6/Teacher-3-D-Cute.png',
  Student: 'https://i.postimg.cc/7Z6n0M9Y/Student-3-D-Cute.png',
};

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>(() => {
    try {
      const saved = localStorage.getItem('edutranslate_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('edutranslate_theme') as 'light' | 'dark') || 'light');
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => (localStorage.getItem('edutranslate_accent') as AccentTheme) || 'professional');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(() => (localStorage.getItem('edutranslate_voice_gender') as VoiceGender) || 'Female');
  const [activeRole, setActiveRole] = useState<UserRole>(() => (localStorage.getItem('edutranslate_active_role') as UserRole) || 'Professor');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [currentOutput, setCurrentOutput] = useState('');

  const mainAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentInputRef = useRef('');
  const currentOutputRef = useRef('');
  const activeRoleRef = useRef<UserRole>(activeRole);

  useEffect(() => {
    activeRoleRef.current = activeRole;
    localStorage.setItem('edutranslate_active_role', activeRole);
  }, [activeRole]);

  useEffect(() => {
    localStorage.setItem('edutranslate_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('edutranslate_accent', accentTheme);
  }, [accentTheme]);

  useEffect(() => {
    localStorage.setItem('edutranslate_voice_gender', voiceGender);
  }, [voiceGender]);

  useEffect(() => {
    localStorage.setItem('edutranslate_history', JSON.stringify(transcripts));
  }, [transcripts]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      localStorage.setItem('edutranslate_history', JSON.stringify(transcripts));
      if (isRecording || transcripts.length > 0) {
        const message = "คุณกำลังอยู่ในการสนทนา ข้อมูลประวัติของคุณจะถูกบันทึกไว้ในเบราว์เซอร์ คุณแน่ใจหรือไม่ว่าต้องการออกจากหน้านี้?";
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [transcripts, isRecording]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcripts, currentInput, currentOutput]);

  const activeAccent = useMemo(() => ({
    professional: { 
      bg: 'bg-blue-800', 
      text: 'text-blue-800', 
      border: 'border-blue-800', 
      lightBg: 'bg-blue-50', 
      darkText: 'dark:text-blue-400', 
      soft: 'bg-blue-800/10',
      hex: '#1e40af',
      label: 'Professional Blue',
      desc: 'Reliability & Intelligence'
    },
    trustworthy: { 
      bg: 'bg-green-700', 
      text: 'text-green-700', 
      border: 'border-green-700', 
      lightBg: 'bg-green-50', 
      darkText: 'dark:text-green-400', 
      soft: 'bg-green-700/10',
      hex: '#15803d',
      label: 'Trustworthy Green',
      desc: 'Calm & Friendly'
    },
    global: { 
      bg: 'bg-indigo-600', 
      text: 'text-indigo-600', 
      border: 'border-indigo-600', 
      lightBg: 'bg-indigo-50', 
      darkText: 'dark:text-indigo-400', 
      soft: 'bg-indigo-600/10',
      hex: '#4f46e5',
      label: 'Global Indigo',
      desc: 'Creative & Connected'
    },
    premium: { 
      bg: 'bg-slate-900', 
      text: 'text-slate-900', 
      border: 'border-slate-900', 
      lightBg: 'bg-slate-100', 
      darkText: 'dark:text-slate-200', 
      soft: 'bg-slate-900/10',
      hex: '#0f172a',
      label: 'Modern Premium',
      desc: 'Luxury & Gold'
    }
  }[accentTheme]), [accentTheme]);

  const saveToHistory = useCallback(() => {
    const input = currentInputRef.current;
    const output = currentOutputRef.current;
    if (input.trim() || output.trim()) {
      setTranscripts(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        text: input,
        translation: output,
        sourceLang: input.match(/[\u0E00-\u0E7F]/) ? 'Thai' : 'Chinese',
        role: activeRoleRef.current
      }]);
    }
    currentInputRef.current = ''; currentOutputRef.current = '';
    setCurrentInput(''); setCurrentOutput('');
  }, []);

  const stopSession = useCallback(() => {
    saveToHistory();
    setIsRecording(false);
    setStatus('idle');
    if (sessionRef.current) { try { sessionRef.current.close(); } catch (e) {} sessionRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    if (mainAudioContextRef.current) { 
      mainAudioContextRef.current.close().catch(() => {}); 
      mainAudioContextRef.current = null; 
    }
    analyserRef.current = null;
    sourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, [saveToHistory]);

  const startSession = async () => {
    try {
      if (!window.isSecureContext) {
        setErrorMessage('โปรดใช้งานผ่าน HTTPS เท่านั้น (Secure Context required)');
        return;
      }
      setStatus('connecting');
      setErrorMessage('');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      mainAudioContextRef.current = ctx;
      const silentBuffer = ctx.createBuffer(1, 1, 22050);
      const silentSource = ctx.createBufferSource();
      silentSource.buffer = silentBuffer;
      silentSource.connect(ctx.destination);
      silentSource.start(0);
      await ctx.resume();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMessage('โปรดอนุญาตให้เข้าถึงไมโครโฟนในการตั้งค่าเบราว์เซอร์');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMessage('ไม่พบไมโครโฟนบนอุปกรณ์นี้');
        } else {
          setErrorMessage(`ไม่สามารถเปิดไมโครโฟนได้: ${err.message}`);
        }
        setStatus('error');
        ctx.close();
        return;
      }
      streamRef.current = stream;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const apiVoiceName = voiceGender === 'Male' ? 'Puck' : 'Kore';
      const sessionPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: getRoleInstruction(activeRole),
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: apiVoiceName } }
          }
        },
        callbacks: {
          onopen: () => {
            setStatus('listening');
            setIsRecording(true);
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser); 
            const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const downsampledData = downsample(inputData, ctx.sampleRate, 16000);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({
                  media: { 
                    data: encodeAudio(new Uint8Array(downsampledData.buffer)), 
                    mimeType: 'audio/pcm;rate=16000' 
                  }
                });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(ctx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && mainAudioContextRef.current) {
              const currentCtx = mainAudioContextRef.current;
              if (currentCtx.state === 'suspended') await currentCtx.resume();
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentCtx.currentTime);
              const buffer = await decodeAudioData(decodeAudio(audioData), currentCtx, 24000, 1);
              const source = currentCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(currentCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (msg.serverContent?.inputTranscription) {
              const text = msg.serverContent.inputTranscription.text;
              currentInputRef.current += text; setCurrentInput(currentInputRef.current);
            }
            if (msg.serverContent?.outputTranscription) {
              const text = msg.serverContent.outputTranscription.text;
              currentOutputRef.current += text; setCurrentOutput(currentOutputRef.current);
            }
            if (msg.serverContent?.turnComplete) saveToHistory();
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
              sourcesRef.current.clear(); nextStartTimeRef.current = 0;
            }
          },
          onerror: (err) => { 
            console.error("Live Error:", err);
            setErrorMessage('พบข้อผิดพลาดในการเชื่อมต่อกับ AI'); 
            stopSession(); 
          },
          onclose: () => stopSession()
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Initialization error:", err);
      setErrorMessage(`เกิดข้อผิดพลาด: ${err.message || 'Unknown'}`);
      setStatus('error');
    }
  };

  const copyToClipboard = useCallback((text: string, id: string) => {
    if (!navigator.clipboard) {
      setErrorMessage('เบราว์เซอร์ไม่รองรับการคัดลอก');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }, []);

  const toggleRole = (id: string) => {
    setTranscripts(prev => prev.map(t => t.id === id ? { ...t, role: t.role === 'Professor' ? 'Student' : 'Professor' } : t));
  };

  const clearHistory = () => {
    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการสนทนาทั้งหมด?')) {
      setTranscripts([]); localStorage.removeItem('edutranslate_history');
    }
  };

  const exportTranscript = () => {
    const text = transcripts.map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.role}\nSource: ${t.text}\nTrans: ${t.translation}\n`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `LiveTrans_Session.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const roleSelector = (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
      {(['Professor', 'Student'] as UserRole[]).map((role) => (
        <button
          key={role}
          disabled={isRecording}
          onClick={() => setActiveRole(role)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
            activeRole === role 
              ? `${activeAccent.bg} text-white shadow-sm scale-[1.02]` 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          } disabled:opacity-50`}
        >
          <div className="w-5 h-5 md:w-6 md:h-6 rounded-full overflow-hidden border-2 border-white/50 shadow-sm shrink-0">
            <img src={AVATARS[role]} alt={role} className="w-full h-full object-cover" />
          </div>
          <span className="hidden sm:inline">{role === 'Professor' ? 'Teacher' : 'Student'}</span>
        </button>
      ))}
    </div>
  );

  const voiceSelector = (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
      {(['Female', 'Male'] as VoiceGender[]).map((gender) => (
        <button
          key={gender}
          disabled={isRecording}
          onClick={() => setVoiceGender(gender)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all flex items-center gap-1.5 ${
            voiceGender === gender 
              ? `${activeAccent.bg} text-white shadow-sm scale-[1.02]` 
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          } disabled:opacity-50`}
        >
          <i className={`fas ${gender === 'Female' ? 'fa-venus' : 'fa-mars'} text-[11px]`}></i>
          <span className="hidden sm:inline">{gender}</span>
        </button>
      ))}
    </div>
  );

  const accentSelector = (
    <div className="flex flex-wrap gap-2 justify-end">
      {(['professional', 'trustworthy', 'global', 'premium'] as AccentTheme[]).map((themeKey) => {
        const t = {
          professional: { color: 'bg-blue-800', label: 'Pro' },
          trustworthy: { color: 'bg-green-700', label: 'Trust' },
          global: { color: 'bg-indigo-600', label: 'Global' },
          premium: { color: 'bg-slate-900', label: 'Gold' }
        }[themeKey];
        return (
          <button
            key={themeKey}
            onClick={() => setAccentTheme(themeKey)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full border-2 transition-all hover:scale-105 ${
              accentTheme === themeKey ? 'border-slate-900 dark:border-white ring-2 ring-slate-200 dark:ring-slate-700' : 'border-transparent bg-slate-50 dark:bg-slate-800'
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${t.color}`} />
            <span className="text-[9px] font-black uppercase tracking-tight text-slate-500 dark:text-slate-400">{t.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] dark:bg-[#0B0F1A] transition-all duration-500 font-sans selection:bg-blue-100 selection:text-blue-900">
      <header className="sticky top-0 z-30 w-full bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className={`w-10 h-10 md:w-11 md:h-11 rounded-2xl overflow-hidden shadow-xl shadow-blue-500/10 shrink-0 border-2 ${activeAccent.border}`}>
              <img src="https://i.postimg.cc/RVVYZdHd/Dr-Pattaroj-Orange.png" alt="Dr. Pat" className="w-full h-full object-cover" />
            </div>
            <div className="hidden xs:block">
              <h1 className="text-sm md:text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">LiveTrans <span className={activeAccent.text}>by Dr.Pat</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Enterprise v2.0</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-1 justify-end">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {roleSelector}
              {voiceSelector}
            </div>
            
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <i className={`fas ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
              </button>

              {!isRecording ? (
                <button onClick={startSession} className={`${activeAccent.bg} hover:brightness-110 text-white px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95`}>
                  <i className="fas fa-microphone"></i> <span className="hidden sm:inline">Connect Live</span>
                </button>
              ) : (
                <button onClick={stopSession} className="bg-red-500 hover:bg-red-600 text-white px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 flex items-center gap-2 transition-all active:scale-95">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div> <span>Stop Live</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 overflow-hidden">
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white dark:bg-[#111827] rounded-[2rem] p-6 md:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-6 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-32 h-32 ${activeAccent.soft} rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-150`}></div>
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Active Processing</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${activeRole === 'Professor' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {activeRole === 'Professor' ? 'Teacher Mode' : 'Student Mode'}
                </span>
              </div>
              {status === 'listening' && <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 bg-green-500/10 px-3 py-1 rounded-full"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span> Live</div>}
            </div>
            <div className="flex flex-col gap-6 relative z-10">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                   <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 ${activeAccent.border} shadow-lg`}>
                     <img src={AVATARS[activeRole]} alt="active role" className="w-full h-full object-cover" />
                   </div>
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Detected Speech</span>
                </div>
                <div className="min-h-[100px] md:min-h-[120px] p-5 md:p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl text-slate-800 dark:text-slate-200 text-lg md:text-xl font-medium leading-relaxed border border-slate-100 dark:border-slate-800 transition-all">
                  {currentInput || <span className="text-slate-300 dark:text-slate-700 italic">Waiting for voice activity...</span>}
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                   <div className={`w-10 h-10 rounded-xl ${activeAccent.bg} flex items-center justify-center text-white shadow-lg`}><i className="fas fa-language"></i></div>
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Academic Translation</span>
                </div>
                <div className={`min-h-[100px] md:min-h-[120px] p-5 md:p-6 rounded-3xl text-slate-900 dark:text-white text-lg md:text-xl font-bold leading-relaxed border transition-all ${theme === 'dark' ? 'bg-blue-900/10 border-blue-900/30' : 'bg-blue-50/50 border-blue-100'}`}>
                  {currentOutput || <span className="text-blue-200 dark:text-blue-900/40 italic">System ready for output...</span>}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-6 border-t border-slate-100 dark:border-slate-800">
               <AudioVisualizer analyser={analyserRef.current} isActive={isRecording} color={activeAccent.hex} />
            </div>
          </div>
          
          <div className="bg-white dark:bg-[#111827] rounded-[1.5rem] p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Active UI Theme</p>
                <p className={`text-sm font-bold ${activeAccent.text}`}>{activeAccent.label}</p>
              </div>
              {accentSelector}
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 italic opacity-80">{activeAccent.desc}</p>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col bg-white dark:bg-[#111827] rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="px-6 md:px-8 py-5 md:py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center text-white shadow-lg"><i className="fas fa-list-ul"></i></div>
              <div>
                <h2 className="text-base md:text-lg font-black dark:text-white leading-none">Session Transcript</h2>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mt-1">Class dialogue history</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportTranscript} className="p-2 md:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:shadow-md transition-all active:scale-95" title="Export as Text">
                <i className="fas fa-file-export"></i>
              </button>
              <button onClick={clearHistory} className="p-2 md:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95" title="Clear All">
                <i className="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10 md:space-y-12 scroll-smooth bg-slate-50/20 dark:bg-transparent">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-800 gap-6 opacity-60">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-4xl md:text-5xl"><i className="fas fa-ghost"></i></div>
                <div className="text-center">
                  <p className="text-lg md:text-xl font-black uppercase tracking-tighter">Transcript Empty</p>
                  <p className="text-xs md:text-sm font-bold opacity-70">Begin speaking to start the log</p>
                </div>
              </div>
            ) : (
              transcripts.map((entry, idx) => (
                <div key={entry.id} className="relative group flex flex-col gap-4 animate-fadeIn">
                  {idx > 0 && <div className="absolute -top-8 left-8 md:left-12 w-px h-8 bg-slate-100 dark:bg-slate-800"></div>}
                  <div className="flex items-start gap-4 md:gap-6">
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button onClick={() => toggleRole(entry.id)} className={`w-10 h-10 md:w-14 md:h-14 rounded-2xl overflow-hidden shadow-lg transition-all active:scale-90 border-2 ${entry.role === 'Professor' ? activeAccent.border : 'border-slate-200 dark:border-slate-700'}`} title="Switch Role Label">
                        <img src={AVATARS[entry.role]} alt={entry.role} className="w-full h-full object-cover" />
                      </button>
                      <span className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 dark:text-slate-600 tracking-tighter">{entry.role === 'Professor' ? 'Teacher' : 'Student'}</span>
                    </div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      <div className="bg-white dark:bg-slate-800/50 p-4 md:p-6 rounded-[1.2rem] md:rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm relative group/bubble">
                         <div className="text-[8px] md:text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-2 flex justify-between">
                            <span>{entry.sourceLang === 'Thai' ? 'Source: Thai' : 'Source: Chinese'}</span>
                            <span className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                         <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base font-medium leading-relaxed">{entry.text}</p>
                      </div>
                      <div className={`p-4 md:p-6 rounded-[1.2rem] md:rounded-[1.5rem] border shadow-md relative group/bubble transition-all ${theme === 'dark' ? 'bg-blue-900/5 border-blue-900/20' : 'bg-blue-50/30 border-blue-100/50'}`}>
                        <div className="text-[8px] md:text-[9px] font-black text-blue-500/70 dark:text-blue-400 uppercase tracking-widest mb-2 flex justify-between items-center">
                          <span>Translation</span>
                          <button onClick={() => copyToClipboard(entry.translation, entry.id)} className="p-1 hover:text-blue-600 transition-colors">
                            <i className={`fas ${copiedId === entry.id ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
                          </button>
                        </div>
                        <p className="text-slate-900 dark:text-blue-50 text-sm md:text-base font-bold leading-relaxed">{entry.translation}</p>
                        {copiedId === entry.id && <span className="absolute top-0 right-10 md:right-12 mt-1.5 bg-slate-900 text-white text-[8px] px-2 py-1 rounded-lg animate-fadeIn z-20">Copied</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <footer className="w-full bg-white dark:bg-[#111827] border-t border-slate-100 dark:border-slate-800 px-8 py-5 flex flex-col lg:flex-row items-center justify-between gap-6 transition-all">
        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${activeAccent.bg} text-white shadow-xl shadow-blue-500/10 cursor-default select-none`}>
            <div className="w-2.5 h-2.5 bg-green-300 rounded-full animate-pulse shadow-[0_0_8px_rgba(134,239,172,0.8)]"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-50">System Online</span>
          </div>

          <button 
            disabled={isRecording}
            onClick={() => setActiveRole(r => r === 'Professor' ? 'Student' : 'Professor')}
            className={`group flex items-center gap-2 px-4 py-2 rounded-2xl ${activeAccent.bg} text-white shadow-xl shadow-blue-500/10 transition-all hover:brightness-110 active:scale-95 disabled:opacity-80`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden border-2 border-white/50 group-hover:rotate-12 transition-transform">
              <img src={AVATARS[activeRole]} alt="current role" className="w-full h-full object-cover" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-50">{activeRole === 'Professor' ? 'Teacher Mode' : 'Student Mode'}</span>
          </button>

          <button 
            disabled={isRecording}
            onClick={() => setVoiceGender(v => v === 'Female' ? 'Male' : 'Female')}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${activeAccent.bg} text-white shadow-xl shadow-blue-500/10 transition-all hover:brightness-110 active:scale-95 disabled:opacity-80`}
          >
            <i className={`fas ${voiceGender === 'Female' ? 'fa-venus' : 'fa-mars'} text-[11px] text-blue-200`}></i>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-50">{voiceGender} Voice</span>
          </button>
        </div>
        
        <div className="flex flex-col items-center lg:items-end gap-1">
          <p className="text-[11px] md:text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">
            LiveTrans <span className={activeAccent.text}>by Dr.Pat</span>
          </p>
          <p className="text-[9px] md:text-[10px] font-semibold text-slate-500 dark:text-slate-500 text-center lg:text-right leading-none max-w-[320px]">
            Developed and Copyright &copy; 2026 by Dr. Pattaroj Kamonrojsiri. <span className="font-normal opacity-70">All Rights Reserved.</span>
          </p>
        </div>
      </footer>

      {errorMessage && (
        <div className="fixed bottom-10 left-4 right-4 md:left-1/2 md:-translate-x-1/2 bg-red-600 text-white px-6 py-4 rounded-[1.5rem] shadow-2xl flex items-center gap-4 animate-bounce z-[100]">
          <i className="fas fa-exclamation-circle text-2xl"></i>
          <div className="flex-1">
            <p className="font-black uppercase text-[10px] tracking-widest">System Alert</p>
            <p className="text-xs font-medium opacity-90">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage('')} className="p-2 hover:bg-white/10 rounded-full"><i className="fas fa-times"></i></button>
        </div>
      )}
    </div>
  );
};

export default App;
