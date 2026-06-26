Act as an expert Senior Medical Imaging Data Scientist and Python Engineer. Write a complete, production-grade Jupyter Notebook (`.ipynb`) that implements a machine learning pipeline on 4D cardiac cine-MRI data from the ACDC dataset.

### 1. Dataset & Environment Constraints
* **Data Paths:** * Training data: `database/training/`
    * Testing data: `database/testing/`
* **Input Data:** 4D NIfTI files (`patientXXX_4d.nii.gz`) representing 3D spatial volumes over ~30 time frames.
* **Target Labels:** Read the pathology class for each patient from the accompanying `Info.cfg` files (e.g., NOR, MINF, DCM, HCM, RV).
* **Dependencies:** Use `nibabel` for data loading, `SimpleITK` or `scikit-image` for preprocessing, `scikit-learn` for modeling, and `tqdm` for execution tracking.

### 2. Progress Tracking & Image Sampling Strategy
To ensure transparency during execution, the notebook must include:
* **Visual Progress Bars:** Wrap all major iterative loops (data loading, batch preprocessing, feature extraction, and grid searches) using `tqdm` or `tqdm.notebook`. 
* **Pipeline Logging:** Print informative status updates (e.g., "Loading patient 001/100...", "Feature extraction shape: (X, Y)...") at every phase.
* **Intermediate Image Sampling:** Immediately after defining a processing function, include a visualization cell that samples a random patient's volume. Display a grid of matplotlib subplots showing the progression of a single mid-ventricular slice across key phases:
    1. Raw Input Slice
    2. Intensity Enhanced/Normalized Slice
    3. Cropped ROI (Region of Interest) Box around the heart
    4. The generated Temporal Motion/Variance Map

### 3. Required Image Preprocessing & Feature Engineering
Implement a robust preprocessing pipeline to isolate the heart and enhance features before feeding them into the model:
* **Intensity Normalization & Enhancement:** Apply Z-score normalization or Min-Max scaling. Use contrast limited adaptive histogram equalization (CLAHE) or intensity clipping to enhance the contrast of the myocardium and blood pools.
* **Spatial Cropping (ROI Detection):** Implement an automated method to crop the volumes tightly around the heart area to eliminate background noise (e.g., using a temporal variance map across the 30 frames to isolate the moving heart region).
* **Temporal & Shape Feature Extraction:** Extract shape descriptors or capture temporal dynamics (e.g., calculating maximum/minimum volume frames, ejection fraction approximations, or temporal gradients/variance across the 30 frames to act as "thermal-like" kinetic feature maps).

### 4. Model Architecture (Unsupervised Feature Extraction + Classification)
* **Step A:** Use an unsupervised method (e.g., PCA, t-SNE, or an unsupervised Convolutional Autoencoder) on the preprocessed 4D/3D representations to reduce dimensionality and extract latent features.
* **Step B:** Train a classifier (e.g., Random Forest, SVM, or a lightweight MLP) on these unsupervised latent features using the training labels from `Info.cfg`. Ensure cross-validation folds display training/validation progress logs.

### 5. Evaluation & Final Outputs
* Evaluate the final pipeline's performance on the unseen test set located in `database/testing/`. Provide a `tqdm` progress bar for the test evaluation phase.
* Print out final metrics: Accuracy, Macro F1-score, and a Confusion Matrix.
* Include inline comments, structured markdown cells separating each phase, and a final summary visualization of the model's classification performance.