/**
 * ===================================================
 *  STORAGE UTILS — CTRL Shift ERP
 *  Firebase Cloud Storage & Client-side Image Processor
 * ===================================================
 */

(function () {
    'use strict';

    if (!window.StorageUtils) {
        window.StorageUtils = {};
    }

    const StorageUtils = window.StorageUtils;

    const firebaseConfig = {
      apiKey: "AIzaSyAPKi-0EjMjsA9q60rwEHeI2T9HTWPGklo",
      authDomain: "ctrl-shift-solutions.firebaseapp.com",
      projectId: "ctrl-shift-solutions",
      storageBucket: "ctrl-shift-solutions.firebasestorage.app",
      messagingSenderId: "958349968165",
      appId: "1:958349968165:web:e11daa979fcff8f6f0d0cc"
    };

    /** Ensure compat Firebase instance is initialized for storage compatibility */
    function getStorage() {
        if (typeof firebase === 'undefined') {
            console.error('Firebase compat library is not loaded. Cannot use Storage.');
            return null;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        try {
            return firebase.storage();
        } catch (e) {
            console.error('Failed to resolve Firebase Storage instance:', e);
            return null;
        }
    }

    /**
     * Resizes and compresses the school logo using HTML5 Canvas.
     * SVG files are preserved as text/XML base64.
     * PNG files are compressed as PNG to preserve transparency.
     * Other files are compressed as JPEG at 0.7 quality.
     * @param {File} file
     * @returns {Promise<string>} - Resolves with compressed base64 data URL
     */
    StorageUtils.compressAndResizeLogo = function (file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided.'));
                return;
            }

            // SVG files are vector text, read directly as data URL (no canvas compression needed)
            if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const maxDim = 200;
                    let w = img.width;
                    let h = img.height;
                    
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round(h * maxDim / w);
                            w = maxDim;
                        } else {
                            w = Math.round(w * maxDim / h);
                            h = maxDim;
                        }
                    }
                    
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
                        // Export as PNG to preserve transparency
                        resolve(canvas.toDataURL('image/png'));
                    } else {
                        // Export as JPEG with 0.7 quality
                        resolve(canvas.toDataURL('image/jpeg', 0.7));
                    }
                };
                img.onerror = (err) => reject(err);
                img.src = e.target.result;
            };
            reader.onerror = (err) => reject(err);
        });
    };

    /**
     * Renders a local image file preview in an <img> tag.
     * @param {File} file 
     * @param {string} previewImgId - ID of <img> element
     */
    StorageUtils.previewImage = async function (file, previewImgId) {
        const preview = document.getElementById(previewImgId);
        if (!preview || !file) return;

        const progress = document.getElementById('logo-progress');
        if (progress) {
            progress.textContent = 'Processing & compressing logo...';
            progress.style.display = 'block';
        }

        try {
            const compressedBase64 = await StorageUtils.compressAndResizeLogo(file);
            
            // Check size limits
            if (compressedBase64.length > 500000) {
                if (progress) progress.style.display = 'none';
                alert("Logo file too large even after compression. Please use a smaller/simpler image.");
                preview.src = '';
                preview.style.display = 'none';
                
                const fileInput = document.getElementById('logo-file-input');
                if (fileInput) fileInput.value = '';
                return;
            }

            preview.src = compressedBase64;
            preview.style.display = 'block';
            if (progress) progress.style.display = 'none';
        } catch (err) {
            console.error("Logo processing failed:", err);
            if (progress) progress.style.display = 'none';
            alert("Failed to process and compress logo image.");
        }
    };

    /**
     * Client-side image compressor using HTML5 Canvas.
     * @param {File} file 
     * @param {number} maxWidthPx 
     * @param {number} qualityPercent 
     * @returns {Promise<File>} - Resolves with compressed JPEG File
     */
    StorageUtils.compressImage = async function (file, maxWidthPx = 300, qualityPercent = 0.75) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided for compression.'));
                return;
            }
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    let w = img.width;
                    let h = img.height;
                    if (w > maxWidthPx || h > maxWidthPx) {
                        if (w > h) {
                            h = Math.round(h * maxWidthPx / w);
                            w = maxWidthPx;
                        } else {
                            w = Math.round(w * maxWidthPx / h);
                            h = maxWidthPx;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) {
                                reject(new Error('Canvas compression failed.'));
                                return;
                            }
                            resolve(new File([blob], file.name, { type: "image/jpeg" }));
                        },
                        "image/jpeg",
                        qualityPercent
                    );
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    };

    /**
     * Uploads compressed student photo to Firebase Storage.
     * @param {File} file 
     * @param {string} schoolId 
     * @param {string} studentId 
     * @returns {Promise<string>} - Resolves with public download URL
     */
    StorageUtils.uploadStudentPhoto = async function (file, schoolId, studentId) {
        console.warn("Storage not available. Skipping upload.");
        return null;
    };

    StorageUtils.uploadSchoolLogo = async function (file, schoolId, progressElementId) {
        console.warn("Storage not available. Skipping upload.");
        return null;
    };

})();
