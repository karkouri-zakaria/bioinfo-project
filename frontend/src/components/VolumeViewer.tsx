import { useEffect, useRef, useState } from "react";
import { Niivue } from "@niivue/niivue";

interface VolumeViewerProps {
  volumeBuffer: ArrayBuffer | null;
  maskBuffer: ArrayBuffer | null;
  volumeName: string | null;
  isProcessing: boolean;
  uploadProgress: number;
  uploadStatus: string;
  previewFrames: string[];
  previewLabels: string[];
}

export default function VolumeViewer({
  volumeBuffer,
  maskBuffer,
  volumeName,
  isProcessing,
  uploadProgress,
  uploadStatus,
  previewFrames,
  previewLabels,
}: VolumeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [opacity, setOpacity] = useState<number>(0.6);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Initialize NiiVue once
  useEffect(() => {
    if (!nvRef.current && canvasRef.current) {
      const nv = new Niivue({
        show3Dcrosshair: true,
        loadingText: "",
        backColor: [0.03, 0.03, 0.05, 1.0], // ultra-dark slate background
        crosshairColor: [0.38, 0.38, 0.94, 0.8], // indigo crosshair
      });
      nv.attachToCanvas(canvasRef.current);
      nvRef.current = nv;
    }
  }, []);

  // Update volumes when inputs change
  useEffect(() => {
    const nv = nvRef.current;
    if (!nv) return;

    const loadData = async () => {
      if (!volumeBuffer) {
        nv.volumes = [];
        nv.drawScene();
        setIsLoaded(false);
        setIsRendering(false);
        return;
      }

      setIsLoaded(true);
      setIsRendering(true);

      try {
        nv.volumes = [];
        await nv.loadFromArrayBuffer(volumeBuffer, volumeName || "volume.nii.gz");
 
        if (maskBuffer) {
          await nv.loadFromArrayBuffer(maskBuffer, `${volumeName || "volume"}_mask.nii.gz`);
          if (nv.volumes.length > 1) {
            nv.setOpacity(1, opacity);
          }
        }

        nv.updateGLVolume();
        
        // Force 3D layout mode (3 = 3D render view)
        nv.setSliceType(3);
        nv.drawScene();
      } catch (err) {
        console.error("Failed to load volume(s) into NiiVue:", err);
      } finally {
        setIsRendering(false);
      }
    };

    loadData();
  }, [volumeBuffer, maskBuffer, volumeName]);

  useEffect(() => {
    let timer: number | undefined;

    if (previewFrames.length > 1 && isPlaying) {
      timer = window.setInterval(() => {
        setPreviewIndex((current) => (current + 1) % previewFrames.length);
      }, 120);
    }

    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [previewFrames.length, isPlaying]);

  // Handle Opacity Slider dynamically
  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    const nv = nvRef.current;
    if (nv && nv.volumes.length > 1) {
      nv.setOpacity(1, val);
      nv.drawScene();
    }
  };

  useEffect(() => {
    setPreviewIndex(0);
    setIsPlaying(true);
  }, [previewFrames.length, previewLabels.length]);

  return (
    <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header Info Panel */}
      <div className="flex flex-wrap justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur-md gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${isLoaded ? "bg-emerald-500 animate-pulse" : "bg-slate-700"}`}></div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Active Viewport</span>
            <span className="text-sm font-bold text-slate-100 truncate max-w-[200px] sm:max-w-xs block">
              {volumeName ? volumeName : "No volume loaded"}
            </span>
          </div>
        </div>
        
        {isLoaded && (
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
            3D Render Mode
          </span>
        )}
      </div>

      {/* Canvas Viewport Container - Increased min-height to balance layout */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center min-h-[900px]">
        {previewFrames.length > 0 && (
          <div className="absolute left-4 top-4 z-20 w-64 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-300/70">Slice animation</p>
                <p className="mt-1 text-xs text-slate-400">{previewLabels[previewIndex] || `Frame ${previewIndex + 1}`}</p>
              </div>
              <button
                onClick={() => setIsPlaying((value) => !value)}
                className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-200 transition hover:border-indigo-500/40 hover:text-indigo-200"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
            </div>
            <img
              src={previewFrames[previewIndex]}
              alt="Animated volume slice"
              className="h-40 w-full object-cover"
            />
            <div className="flex items-center justify-between px-4 py-3 text-[11px] text-slate-500">
              <button onClick={() => setPreviewIndex((previewIndex - 1 + previewFrames.length) % previewFrames.length)}>Prev</button>
              <span>{previewIndex + 1}/{previewFrames.length}</span>
              <button onClick={() => setPreviewIndex((previewIndex + 1) % previewFrames.length)}>Next</button>
            </div>
          </div>
        )}

        {((isLoaded && isProcessing) || isRendering) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-6">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {isRendering ? "Rendering volume" : uploadStatus || "Loading volume"}
                </span>
                <span className="text-xs font-mono text-indigo-300">{Math.max(0, Math.min(100, uploadProgress))}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-950 text-center gap-4 z-10 select-none">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 mb-2 animate-bounce">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-200">Interactive 3D Canvas</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              Upload a structural brain NIfTI scan from the panel to initialize the NiiVue WebGL visualizer.
            </p>
          </div>
        )}

        {/* Height increased to h-[900px] */}
        <canvas
          ref={canvasRef}
          id="niivue-canvas"
          className={`w-full h-[900px] block cursor-grab active:cursor-grabbing transition-opacity duration-500 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      {/* Footer Controls Overlay */}
      {isLoaded && (
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 backdrop-blur-md flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            {maskBuffer && (
              <>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest whitespace-nowrap">
                  Overlay Opacity
                </span>
                <div className="flex items-center gap-3 w-full sm:w-48">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-xs font-mono text-slate-300 w-8">{Math.round(opacity * 100)}%</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <kbd className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300">Left Click + Drag</kbd>
            <span>Rotate 3D Space</span>
            <span className="text-slate-600">|</span>
            <kbd className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300">Scroll</kbd>
            <span>Zoom</span>
          </div>
        </div>
      )}
    </div>
  );
}