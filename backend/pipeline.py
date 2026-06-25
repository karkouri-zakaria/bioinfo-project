import os
from time import perf_counter

import nibabel as nib
import numpy as np
from typing import Callable, Dict, Optional

def run_segmentation_pipeline(
    input_path: str,
    output_path: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> Dict[str, float]:
    """
    Loads a structural brain MRI scan, normalizes it with a lightweight numpy path,
    performs a thresholding operation, and saves the output segmentation mask while
    preserving the original affine matrix and spatial header.
    """
    timings: Dict[str, float] = {}

    def report(progress: int, message: str):
        if progress_callback:
            progress_callback(progress, message)

    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found at {input_path}")

    total_start = perf_counter()

    # Step 1: Load the original volume to retrieve the original affine and header
    report(5, "Loading input volume")
    load_start = perf_counter()
    orig_nii = nib.load(input_path)
    orig_affine = orig_nii.affine
    orig_header = orig_nii.header
    timings["load_volume"] = perf_counter() - load_start

    # Step 2: Convert to float32 and normalize without MONAI.
    report(25, "Normalizing intensity values")
    normalize_start = perf_counter()
    img_data = np.asarray(orig_nii.dataobj, dtype=np.float32)
    img_data = np.clip(img_data, 0.0, 1000.0) / 1000.0
    timings["normalize_intensity"] = perf_counter() - normalize_start

    # Step 3: Perform a basic thresholding operation for the initial segmentation mask.
    report(70, "Thresholding brain volume")
    threshold_start = perf_counter()
    mask_data = (img_data > 0.5).astype(np.int16)
    timings["threshold"] = perf_counter() - threshold_start

    # Step 4: Save the mask back to NIfTI format using the original affine matrix and header.
    report(90, "Saving segmentation mask")
    save_start = perf_counter()
    mask_nii = nib.Nifti1Image(mask_data, orig_affine, header=orig_header)
    nib.save(mask_nii, output_path)
    timings["save_mask"] = perf_counter() - save_start

    timings["total"] = perf_counter() - total_start
    report(100, f"Segmentation complete in {timings['total']:.2f}s")
    print(
        "[pipeline] timings",
        {key: round(value, 3) for key, value in timings.items()},
    )
    return timings
