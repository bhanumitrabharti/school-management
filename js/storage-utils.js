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
     * Uploads a student photo File to Firebase Storage.
     * Compresses first, then stores at schools/{schoolId}/students/{studentId}/{fieldName}.jpg
     * @param {File} file
     * @param {string} schoolId
     * @param {string} studentId
     * @param {string} fieldName - 'student' or 'parent'
     * @returns {Promise<string|null>} - Download URL or null on failure
     */
    StorageUtils.uploadStudentPhoto = async function (file, schoolId, studentId, fieldName) {
        fieldName = fieldName || 'student';
        if (!window.storage || !window.storageSDK) {
            console.error('Firebase Storage not initialized (window.storage missing). Check app.js import.');
            return null;
        }
        try {
            // Compress before upload: student=300px, parent=120px portrait
            var maxPx = (fieldName === 'parent') ? 120 : 300;
            var compressedFile = await StorageUtils.compressImage(file, maxPx, 0.80);
            var storagePath = 'schools/' + schoolId + '/students/' + studentId + '/' + fieldName + '.jpg';
            var storageRef = window.storageSDK.ref(window.storage, storagePath);
            var snapshot = await window.storageSDK.uploadBytes(storageRef, compressedFile);
            var downloadURL = await window.storageSDK.getDownloadURL(snapshot.ref);
            console.log('[StorageUtils] Uploaded', fieldName, 'photo for', studentId, '→', downloadURL);
            return downloadURL;
        } catch (e) {
            console.error('[StorageUtils] uploadStudentPhoto failed:', e);
            return null;
        }
    };

    /**
     * Uploads a base64 data URL (e.g. parent photo from canvas) to Firebase Storage.
     * Used when saving an existing base64 photo that needs to migrate to Storage.
     * @param {string} base64DataUrl - data:image/jpeg;base64,...
     * @param {string} schoolId
     * @param {string} studentId
     * @param {string} fieldName - 'student' or 'parent'
     * @returns {Promise<string|null>}
     */
    StorageUtils.uploadBase64Photo = async function (base64DataUrl, schoolId, studentId, fieldName) {
        fieldName = fieldName || 'photo';
        if (!window.storage || !window.storageSDK) {
            console.error('[StorageUtils] Firebase Storage not initialized.');
            return null;
        }
        if (!base64DataUrl || !base64DataUrl.startsWith('data:')) {
            return null;
        }
        try {
            // Convert base64 data URL → Blob
            var res = await fetch(base64DataUrl);
            var blob = await res.blob();
            var storagePath = 'schools/' + schoolId + '/students/' + studentId + '/' + fieldName + '.jpg';
            var storageRef = window.storageSDK.ref(window.storage, storagePath);
            var snapshot = await window.storageSDK.uploadBytes(storageRef, blob);
            var downloadURL = await window.storageSDK.getDownloadURL(snapshot.ref);
            console.log('[StorageUtils] Uploaded base64', fieldName, 'for', studentId, '→', downloadURL);
            return downloadURL;
        } catch (e) {
            console.error('[StorageUtils] uploadBase64Photo failed:', e);
            return null;
        }
    };

    /**
     * Compresses any image file so that its output is guaranteed to be <= maxBytes (default 300 KB).
     * Never rejects large input files (e.g. 1.2 MB or 10 MB); only rejects non-image files.
     * Uses canvas to scale to maxDim (default 400px), then progressively lowers quality / dimensions if needed.
     * @param {File|Blob} file 
     * @param {number} maxDimension - maximum width/height in px (default 400)
     * @param {number} maxBytes - maximum allowed file size in bytes (default 300 * 1024)
     * @returns {Promise<Blob>}
     */
    StorageUtils.compressImageBlob = async function (file, maxDimension, maxBytes) {
        maxDimension = maxDimension || 400;
        maxBytes = maxBytes || (300 * 1024);

        if (!file) {
            throw new Error('No file provided for compression.');
        }
        if (!file.type || !file.type.startsWith('image/')) {
            throw new Error('Please select an image file (PNG, JPEG, WebP, etc.).');
        }

        // SVG files are vector XML text. If already within maxBytes, preserve as-is.
        if (file.type === 'image/svg+xml' || (file.name && file.name.toLowerCase().endsWith('.svg'))) {
            if (file.size <= maxBytes) {
                return file;
            }
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = (err) => reject(new Error('Failed to read image file: ' + (err && err.message || 'unknown error')));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
                img.onload = () => {
                    try {
                        const isPng = (file.type === 'image/png' || (file.name && file.name.toLowerCase().endsWith('.png')));
                        
                        const renderToBlob = (dim, quality, mimeType) => {
                            return new Promise((resBlob) => {
                                const canvas = document.createElement('canvas');
                                let targetW = img.width;
                                let targetH = img.height;
                                if (targetW > dim || targetH > dim) {
                                    if (targetW > targetH) {
                                        targetH = Math.round(targetH * dim / targetW);
                                        targetW = dim;
                                    } else {
                                        targetW = Math.round(targetW * dim / targetH);
                                        targetH = dim;
                                    }
                                }
                                canvas.width = Math.max(1, targetW);
                                canvas.height = Math.max(1, targetH);
                                const ctx = canvas.getContext('2d');
                                if (mimeType === 'image/jpeg') {
                                    ctx.fillStyle = '#FFFFFF';
                                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                                }
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                canvas.toBlob((blob) => {
                                    resBlob(blob);
                                }, mimeType, quality);
                            });
                        };

                        (async () => {
                            let currentDim = maxDimension;
                            // If original is PNG, try PNG export first to preserve transparency
                            if (isPng) {
                                const pngBlob = await renderToBlob(currentDim, 1.0, 'image/png');
                                if (pngBlob && pngBlob.size <= maxBytes) {
                                    return resolve(pngBlob);
                                }
                            }

                            // Otherwise, compress as JPEG with progressive quality reduction
                            let quality = 0.85;
                            let blob = await renderToBlob(currentDim, quality, 'image/jpeg');
                            while (blob && blob.size > maxBytes && quality > 0.40) {
                                quality -= 0.15;
                                blob = await renderToBlob(currentDim, quality, 'image/jpeg');
                            }

                            // If still exceeds maxBytes, downscale dimensions
                            while (blob && blob.size > maxBytes && currentDim > 120) {
                                currentDim = Math.round(currentDim * 0.75);
                                blob = await renderToBlob(currentDim, 0.70, 'image/jpeg');
                            }

                            if (!blob) {
                                return reject(new Error('Image compression produced an empty result.'));
                            }

                            resolve(blob);
                        })().catch(reject);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    /**
     * Uploads school logo to Firebase Storage.
     * @param {File} file
     * @param {string} schoolId
     * @param {string} progressElementId - optional DOM id for progress text
     * @returns {Promise<string|null>}
     */
    StorageUtils.uploadSchoolLogo = async function (file, schoolId, progressElementId) {
        if (!window.storage || !window.storageSDK) {
            console.error('[StorageUtils] Firebase Storage not initialized (window.storage or window.storageSDK missing).');
            return null;
        }
        if (!file || !file.type || !file.type.startsWith('image/')) {
            console.error('[StorageUtils] uploadSchoolLogo failed: selected file is not an image.');
            return null;
        }
        var progressEl = progressElementId ? document.getElementById(progressElementId) : null;
        try {
            if (progressEl) {
                progressEl.textContent = 'Processing & compressing logo...';
                progressEl.style.display = 'block';
            }
            var compressedBlob = await StorageUtils.compressImageBlob(file, 400, 300 * 1024);
            if (progressEl) progressEl.textContent = 'Uploading logo (' + Math.round(compressedBlob.size / 1024) + ' KB)...';

            var ext = (compressedBlob.type === 'image/png' || (file.name && file.name.toLowerCase().endsWith('.png'))) ? 'png' : 'jpg';
            var storagePath = 'schools/' + schoolId + '/logo.' + ext;
            var storageRef = window.storageSDK.ref(window.storage, storagePath);
            var snapshot = await window.storageSDK.uploadBytes(storageRef, compressedBlob);
            var downloadURL = await window.storageSDK.getDownloadURL(snapshot.ref);
            if (progressEl) {
                progressEl.textContent = 'Upload complete!';
                setTimeout(function() { if (progressEl.textContent === 'Upload complete!') progressEl.style.display = 'none'; }, 2000);
            }
            console.log('[StorageUtils] Logo uploaded for', schoolId, '→', downloadURL);
            return downloadURL;
        } catch (e) {
            console.error('[StorageUtils] uploadSchoolLogo failed:', e);
            if (progressEl) {
                progressEl.textContent = 'Logo upload failed: ' + (e && e.message || 'unknown error');
            }
            return null;
        }
    };

    /**
     * Uploads principal signature to Firebase Storage.
     * Allowed filename: schools/{schoolId}/signature.<ext>
     * @param {File} file
     * @param {string} schoolId
     * @param {string} progressElementId - optional DOM id for progress text
     * @returns {Promise<string|null>}
     */
    StorageUtils.uploadPrincipalSignature = async function (file, schoolId, progressElementId) {
        if (!window.storage || !window.storageSDK) {
            console.error('[StorageUtils] Firebase Storage not initialized (window.storage or window.storageSDK missing).');
            return null;
        }
        if (!file || !file.type || !file.type.startsWith('image/')) {
            console.error('[StorageUtils] uploadPrincipalSignature failed: selected file is not an image.');
            return null;
        }
        var progressEl = progressElementId ? document.getElementById(progressElementId) : null;
        try {
            if (progressEl) {
                progressEl.textContent = 'Processing & compressing signature...';
                progressEl.style.display = 'block';
            }
            var compressedBlob = await StorageUtils.compressImageBlob(file, 400, 300 * 1024);
            if (progressEl) progressEl.textContent = 'Uploading signature (' + Math.round(compressedBlob.size / 1024) + ' KB)...';

            var ext = (compressedBlob.type === 'image/png' || (file.name && file.name.toLowerCase().endsWith('.png'))) ? 'png' : 'jpg';
            var storagePath = 'schools/' + schoolId + '/signature.' + ext;
            var storageRef = window.storageSDK.ref(window.storage, storagePath);
            var snapshot = await window.storageSDK.uploadBytes(storageRef, compressedBlob);
            var downloadURL = await window.storageSDK.getDownloadURL(snapshot.ref);
            if (progressEl) {
                progressEl.textContent = 'Upload complete!';
                setTimeout(function() { if (progressEl.textContent === 'Upload complete!') progressEl.style.display = 'none'; }, 2000);
            }
            console.log('[StorageUtils] Signature uploaded for', schoolId, '→', downloadURL);
            return downloadURL;
        } catch (e) {
            console.error('[StorageUtils] uploadPrincipalSignature failed:', e);
            if (progressEl) {
                progressEl.textContent = 'Signature upload failed: ' + (e && e.message || 'unknown error');
            }
            return null;
        }
    };

})();
