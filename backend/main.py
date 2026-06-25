import os
import base64
import shutil
import tempfile
from dataclasses import dataclass, asdict, field
from io import BytesIO
from threading import Lock
from threading import Thread
from time import perf_counter
from typing import Dict, List, Optional
from uuid import uuid4

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import nibabel as nib
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from pipeline import run_segmentation_pipeline

app = FastAPI(
    title="Neuroimaging Segmentation Backend",
    description="API gateway to process NIfTI brain volumes and return segmentation overlays"
)

# CORS configurations
# Allow connections from Vite dev server environments (port 5173)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


PIPELINE_OVERVIEW = {
    "title": "ACDC pipeline preview",
    "subtitle": "Notebook-derived summary for the preprocessing and model-selection flow.",
    "steps": [
        {
            "name": "Preprocessing",
            "detail": "Load the 4D study, normalize intensities, enhance contrast, and locate the ROI with temporal variance.",
        },
        {
            "name": "Feature matrix",
            "detail": "Extract temporal variance, curve-shape, gradient, and metadata features from each patient volume.",
        },
        {
            "name": "Dimensionality reduction",
            "detail": "Standardize the features and project them with PCA before the latent-space visualizations.",
        },
        {
            "name": "Model selection",
            "detail": "Compare candidate classifiers with stratified cross-validation and grid search.",
        },
    ],
}


@dataclass
class SegmentJob:
    status: str
    progress: int
    message: str
    filename: str
    error: Optional[str] = None
    result_path: Optional[str] = None
    timings: Dict[str, float] = field(default_factory=dict)
    preview_frames: List[str] = field(default_factory=list)
    preview_labels: List[str] = field(default_factory=list)
    preview_interval_ms: int = 120
    created_at: float = field(default_factory=perf_counter)
    finished_at: Optional[float] = None


jobs: Dict[str, SegmentJob] = {}
job_lock = Lock()


def set_job(job_id: str, **updates):
    with job_lock:
        job = jobs[job_id]
        for key, value in updates.items():
            setattr(job, key, value)


def get_job(job_id: str) -> SegmentJob:
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown segmentation job")
        return job


def remove_job(job_id: str):
    with job_lock:
        jobs.pop(job_id, None)

def cleanup_files(paths: List[str]):
    """Background task to remove temporary files after serving the response."""
    for path in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception as e:
            # Non-blocking log print
            print(f"Error during cleanup of {path}: {e}")


def cleanup_result_file(result_path: str, job_id: str):
    cleanup_files([result_path])
    remove_job(job_id)


def build_preview_frames(input_path: str, mask_path: Optional[str] = None, max_frames: int = 16):
    volume_img = nib.load(input_path)
    volume = np.asarray(volume_img.dataobj, dtype=np.float32)

    if volume.ndim == 4:
        volume = volume[..., 0]

    if volume.ndim != 3:
        raise ValueError("Preview rendering expects a 3D or 4D NIfTI volume")

    volume = np.nan_to_num(volume, nan=0.0, posinf=0.0, neginf=0.0)
    lower, upper = np.percentile(volume, [2, 98]) if np.isfinite(volume).any() else (0.0, 1.0)
    if upper - lower < 1e-6:
        upper = lower + 1.0
    volume = np.clip((volume - lower) / (upper - lower), 0.0, 1.0)

    mask = None
    if mask_path and os.path.exists(mask_path):
        mask = np.asarray(nib.load(mask_path).dataobj)
        if mask.ndim == 4:
            mask = mask[..., 0]

    frame_indices = np.unique(np.linspace(0, volume.shape[2] - 1, num=min(max_frames, volume.shape[2]), dtype=int))
    frames: List[str] = []
    labels: List[str] = []

    for index in frame_indices:
        fig, ax = plt.subplots(figsize=(4.5, 4.5), dpi=140)
        fig.patch.set_facecolor("#050816")
        ax.set_facecolor("#050816")
        ax.imshow(volume[:, :, index].T, cmap="gray", origin="lower", interpolation="nearest")

        if mask is not None:
            overlay = np.ma.masked_where(mask[:, :, index] <= 0, mask[:, :, index]).T
            ax.imshow(overlay, cmap="autumn", alpha=0.35, origin="lower", interpolation="nearest")

        ax.set_title(f"Slice {index + 1} / {volume.shape[2]}", color="white", fontsize=10, pad=10)
        ax.axis("off")

        buffer = BytesIO()
        fig.savefig(buffer, format="png", bbox_inches="tight", pad_inches=0.02, facecolor=fig.get_facecolor())
        plt.close(fig)

        frames.append(f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('ascii')}")
        labels.append(f"{index + 1} of {volume.shape[2]}")

    return frames, labels


def process_job(job_id: str, input_path: str, output_path: str):
    try:
        set_job(job_id, status="processing", progress=1, message="Starting segmentation pipeline")

        def report(progress: int, message: str):
            set_job(job_id, progress=progress, message=message)

        timings = run_segmentation_pipeline(input_path, output_path, progress_callback=report)
        preview_frames, preview_labels = build_preview_frames(input_path, output_path)
        set_job(
            job_id,
            status="completed",
            progress=100,
            message="Segmentation complete",
            result_path=output_path,
            timings=timings,
            preview_frames=preview_frames,
            preview_labels=preview_labels,
            finished_at=perf_counter(),
        )
        cleanup_files([input_path])
    except Exception as exc:
        set_job(
            job_id,
            status="failed",
            message="Segmentation failed",
            error=str(exc),
            finished_at=perf_counter(),
        )
        cleanup_files([input_path, output_path])

@app.post("/api/segment")
async def segment_volume(file: UploadFile = File(...)):
    """
    Accepts a NIfTI format file (.nii or .nii.gz), starts segmentation in the background,
    and returns a job id that can be polled for progress and results.
    """
    # 1. Input Validation
    filename = file.filename or ""
    if not (filename.endswith(".nii") or filename.endswith(".nii.gz")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a NIfTI file ending in .nii or .nii.gz"
        )

    suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii"

    temp_in_path = None
    temp_out_path = None
    job_id = uuid4().hex

    try:
        # 2. Write Uploaded Stream to disk inside container temp directory
        fd_in, temp_in_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd_in)

        with open(temp_in_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Prepare output path
        fd_out, temp_out_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd_out)

        with job_lock:
            jobs[job_id] = SegmentJob(
                status="queued",
                progress=0,
                message="Queued for processing",
                filename=filename,
            )

        # 4. Start the pipeline immediately on a daemon thread so the status endpoint
        # can observe the real job state without waiting on the request lifecycle.
        Thread(target=process_job, args=(job_id, temp_in_path, temp_out_path), daemon=True).start()

        return {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Queued for processing",
        }

    except Exception as e:
        # Clean up immediately if compilation/processing fails before file response can be sent
        if temp_in_path and os.path.exists(temp_in_path):
            os.remove(temp_in_path)
        if temp_out_path and os.path.exists(temp_out_path):
            os.remove(temp_out_path)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/segment/status/{job_id}")
async def segment_status(job_id: str):
    job = get_job(job_id)
    payload = asdict(job)
    payload["job_id"] = job_id
    payload["duration_seconds"] = (
        (job.finished_at or perf_counter()) - job.created_at if job.created_at else None
    )
    return payload


@app.get("/api/pipeline/overview")
async def pipeline_overview():
    return PIPELINE_OVERVIEW


@app.get("/api/segment/preview/{job_id}")
async def segment_preview(job_id: str):
    job = get_job(job_id)
    if job.status != "completed" or not job.preview_frames:
        raise HTTPException(status_code=409, detail="Preview is not ready yet")

    return {
        "job_id": job_id,
        "title": "Animated scan preview",
        "interval_ms": job.preview_interval_ms,
        "frames": job.preview_frames,
        "labels": job.preview_labels,
    }


@app.get("/api/segment/result/{job_id}")
async def segment_result(job_id: str):
    job = get_job(job_id)
    if job.status != "completed" or not job.result_path:
        raise HTTPException(status_code=409, detail="Segmentation is not finished yet")

    return FileResponse(
        path=job.result_path,
        media_type="application/octet-stream",
        filename=f"segmented_{job.filename}",
        background=BackgroundTask(cleanup_result_file, job.result_path, job_id),
    )
