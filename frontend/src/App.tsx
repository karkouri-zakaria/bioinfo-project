import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import VolumeViewer from "./components/VolumeViewer";

type PipelineOverview = {
  title: string;
  subtitle: string;
  steps: Array<{
    name: string;
    detail: string;
  }>;
};

export default function App() {
  const [volumeBuffer, setVolumeBuffer] = useState<ArrayBuffer | null>(null);
  const [maskBuffer, setMaskBuffer] = useState<ArrayBuffer | null>(null);
  const [previewFrames, setPreviewFrames] = useState<string[]>([]);
  const [previewLabels, setPreviewLabels] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState<boolean>(false);
  const [pipelineOverview, setPipelineOverview] = useState<PipelineOverview | null>(null);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        const response = await fetch("/api/pipeline/overview");
        if (!response.ok) return;
        setPipelineOverview((await response.json()) as PipelineOverview);
      } catch {
        // keep the modal functional even if the backend is temporarily unavailable
      }
    };

    loadOverview();
  }, []);

  const handleUploadStart = () => {
    setIsProcessing(true);
    setUploadProgress(0);
    setUploadStatus("Preparing upload");
    setError(null);
  };

  const handleUploadProgress = (progress: number, status: string) => {
    setUploadProgress(progress);
    setUploadStatus(status);
  };

  const handleUploadSuccess = (
    newVolumeBuffer: ArrayBuffer,
    newMaskBuffer: ArrayBuffer | null,
    name: string,
    _jobId: string,
    newPreviewFrames: string[],
    newPreviewLabels: string[],
  ) => {
    setVolumeBuffer(newVolumeBuffer);
    setMaskBuffer(newMaskBuffer);
    setPreviewFrames(newPreviewFrames);
    setPreviewLabels(newPreviewLabels);
    setFileName(name);
    setIsProcessing(false);
    setUploadProgress(100);
    setUploadStatus("Rendering complete");
  };

  const handleUploadError = (errMsg: string) => {
    setError(errMsg);
    setIsProcessing(false);
    setUploadStatus("");
  };

  const handleClear = () => {
    setVolumeBuffer(null);
    setMaskBuffer(null);
    setFileName(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.15),rgba(255,255,255,0))]">
      
      {/* Header / Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-wider bg-gradient-to-r from-indigo-200 via-slate-100 to-slate-200 bg-clip-text text-transparent uppercase">
                NEUROMASK
              </span>
              <span className="ml-2 text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                v1.0.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Backend Connected
            </span>
            <button
              onClick={() => setIsPipelineModalOpen(true)}
              className="ml-3 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200 transition hover:bg-indigo-500/20"
            >
              Open pipeline modal
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        
        {/* Error notification banner */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-center justify-between gap-4 animate-slide-down">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-rose-300 leading-relaxed">
                {error}
              </p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-900 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Dashboard
              onUploadStart={handleUploadStart}
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
              onUploadProgress={handleUploadProgress}
              onClear={handleClear}
              isProcessing={isProcessing}
            />

            {/* Instruction Card */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-3xl p-6 flex flex-col gap-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Quick Guide
              </h4>
              <div className="flex flex-col gap-3.5">
                {[
                  { step: "1", text: "Drag your NIfTI brain volume (.nii/.nii.gz) or load the standard MNI152 template." },
                  { step: "2", text: "Wait for the MONAI-powered API to run intensity scaling and thresholding." },
                  { step: "3", text: "Interact with the WebGL viewport to inspect aligned orthogonal planes and overlays." }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0">
                      {item.step}
                    </div>
                    <p className="text-[11px] leading-normal text-slate-400 font-medium">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Viewport Column */}
          <div className="lg:col-span-2 h-full">
            <VolumeViewer
              volumeBuffer={volumeBuffer}
              maskBuffer={maskBuffer}
              volumeName={fileName}
              isProcessing={isProcessing}
              uploadProgress={uploadProgress}
              uploadStatus={uploadStatus}
              previewFrames={previewFrames}
              previewLabels={previewLabels}
            />
          </div>
        </div>
      </main>

      {isPipelineModalOpen && pipelineOverview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between border-b border-slate-800 bg-gradient-to-r from-slate-950 to-slate-900 px-6 py-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-indigo-300/80">Notebook modal</p>
                <h3 className="mt-2 text-2xl font-bold text-slate-50">{pipelineOverview.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{pipelineOverview.subtitle}</p>
              </div>
              <button
                onClick={() => setIsPipelineModalOpen(false)}
                className="rounded-full border border-slate-800 p-2 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100"
                aria-label="Close pipeline modal"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
              {pipelineOverview.steps.map((step, index) => (
                <div key={step.name} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-indigo-500/30 hover:bg-slate-900">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-sm font-bold text-indigo-300">0{index + 1}</span>
                    <h4 className="text-base font-semibold text-slate-100">{step.name}</h4>
                  </div>
                  <p className="text-sm leading-6 text-slate-400">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isPipelineModalOpen && !pipelineOverview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-5 text-sm text-slate-300 shadow-2xl">
            Pipeline details are still loading.
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-950 py-6 mt-12 bg-slate-950/20 text-center text-xs text-slate-500">
        <p>© 2026 NeuroMask AI. Running on MONAI & NiiVue. All rights reserved.</p>
      </footer>
    </div>
  );
}
