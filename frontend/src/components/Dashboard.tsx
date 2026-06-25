import { useState, useRef } from "react";
import type { DragEvent, ChangeEvent } from "react";

interface DashboardProps {
  onUploadStart: () => void;
  onUploadSuccess: (
    volumeBuffer: ArrayBuffer,
    maskBuffer: ArrayBuffer | null,
    fileName: string,
    jobId: string,
    previewFrames: string[],
    previewLabels: string[],
  ) => void;
  onUploadError: (error: string) => void;
  onUploadProgress: (progress: number, status: string) => void;
  onClear: () => void;
  isProcessing: boolean;
}

export default function Dashboard({
  onUploadStart,
  onUploadSuccess,
  onUploadError,
  onUploadProgress,
  onClear,
  isProcessing,
}: DashboardProps) {
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File extension validations
  const validateFile = (file: File): boolean => {
    const name = file.name.toLowerCase();
    return name.endsWith(".nii") || name.endsWith(".nii.gz");
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        uploadAndProcess(file);
      } else {
        onUploadError("Invalid file type. Please upload a NIfTI image (.nii or .nii.gz).");
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        uploadAndProcess(file);
      } else {
        onUploadError("Invalid file type. Please upload a NIfTI image (.nii or .nii.gz).");
      }
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const waitForSegmentationJob = async (jobId: string) => {
    const startedAt = Date.now();

    while (true) {
      const response = await fetch(`/api/segment/status/${jobId}`);
      const status = await response.json();

      if (!response.ok) {
        throw new Error(status.detail || "Failed to read segmentation progress.");
      }

      if (status.status === "failed") {
        throw new Error(status.error || status.message || "Segmentation failed.");
      }

      const backendProgress = typeof status.progress === "number" ? status.progress : 0;
      const mappedProgress = Math.max(35, Math.min(95, 35 + Math.round(backendProgress * 0.6)));
      onUploadProgress(mappedProgress, status.message || "Segmenting brain structures");

      if (status.status === "completed") {
        const resultResponse = await fetch(`/api/segment/result/${jobId}`);
        if (!resultResponse.ok) {
          throw new Error(await resultResponse.text());
        }

        onUploadProgress(98, "Downloading completed mask");
        return {
          blob: await resultResponse.blob(),
          previewFrames: Array.isArray(status.preview_frames) ? status.preview_frames : [],
          previewLabels: Array.isArray(status.preview_labels) ? status.preview_labels : [],
        };
      }

      if (Date.now() - startedAt > 30 * 60 * 1000) {
        throw new Error("Segmentation timed out after 30 minutes.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
  };

  // Perform async API upload & segmentation
  const uploadAndProcess = async (file: File) => {
    onUploadStart();

    const formData = new FormData();
    formData.append("file", file);
    const volumeBuffer = await file.arrayBuffer();

    try {
      const job = await new Promise<{ job_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/segment");
        xhr.responseType = "json";

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.max(1, Math.min(30, Math.round((event.loaded / event.total) * 30)));
          onUploadProgress(progress, "Uploading scan to backend");
        };

        xhr.onerror = () => reject(new Error("Unable to contact the segmentation backend."));
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(xhr.response?.detail || xhr.responseText || "Backend server failed to start the NIfTI scan."));
            return;
          }

          const payload = xhr.response as { job_id?: string } | null;
          if (!payload?.job_id) {
            reject(new Error("Backend did not return a segmentation job id."));
            return;
          }

          resolve({ job_id: payload.job_id });
        };

        xhr.send(formData);
      });

      onUploadProgress(35, "Queued for segmentation");

      const result = await waitForSegmentationJob(job.job_id);
      const maskBuffer = await result.blob.arrayBuffer();

      // Notify App coordinator
      onUploadSuccess(volumeBuffer, maskBuffer, file.name, job.job_id, result.previewFrames, result.previewLabels);
    } catch (err: any) {
      console.error(err);
      onUploadError(err.message || "An unexpected error occurred during segmentation processing.");
      // Fallback: load base scan without overlay
      onUploadSuccess(volumeBuffer, null, file.name, "", [], []);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClear();
  };

  return (
    <div className="flex flex-col bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl transition-all duration-300 gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 mb-1">Neuro-Imaging Analysis</h2>
        <p className="text-xs text-slate-400">
          Upload 3D structural MRI scans in NIfTI format. Our PyTorch + MONAI backend processes automated brain structure segmentations instantly.
        </p>
      </div>

      {/* Drag & Drop Area */}
      {!selectedFile && !isProcessing && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 group ${
            isDragActive
              ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5 scale-[1.01]"
              : "border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-950/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".nii,.nii.gz"
            onChange={handleFileChange}
          />
          
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all duration-300 mb-4 shadow-inner">
            <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <p className="text-sm font-bold text-slate-300 mb-1">
            Drag & drop scan or <span className="text-indigo-400 hover:underline">browse files</span>
          </p>
          <p className="text-xs text-slate-500">Supports NIfTI scans (.nii, .nii.gz)</p>
        </div>
      )}

      {/* Processing Loader State */}
      {isProcessing && (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-950/30 border border-slate-800/80 rounded-2xl text-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin"></div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-200 mb-1">Segmenting Brain Structures...</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto animate-pulse">
              Running MONAI transformations and PyTorch threshold inference on structural volume. Please wait.
            </p>
          </div>
        </div>
      )}

      {/* Loaded file indicator */}
      {selectedFile && !isProcessing && (
        <div className="flex flex-col p-4 bg-slate-950/40 border border-slate-800 rounded-2xl gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-xs font-bold">
                NII
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-300 truncate max-w-[200px] sm:max-w-xs" title={selectedFile.name}>
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
