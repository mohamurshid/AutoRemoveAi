import { useState, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

function App() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [images, setImages] = useState([]); // Array of { id, file, previewUrl, resultUrl, filename, status, error }
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const fileInputRef = useRef(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
      addFiles(files);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      addFiles(files);
    }
    // Reset input to allow selecting same files again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addFiles = (files) => {
    const newImages = files.map(file => ({
      id: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      resultUrl: null,
      filename: file.name.split('.')[0] + '-removed',
      status: 'pending', // pending, processing, done, error
      error: null
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const updateImageState = (id, updates) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, ...updates } : img
    ));
  };

  const handleRemoveBackground = async (id) => {
    const image = images.find(img => img.id === id);
    if (!image || image.status === 'processing') return;

    updateImageState(id, { status: 'processing', error: null });

    const formData = new FormData();
    formData.append('image_file', image.file);
    formData.append('size', 'auto');

    try {
      const response = await fetch('/api/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': import.meta.env.VITE_REMOVE_BG_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 402) throw new Error('Insufficient credits.');
        if (response.status === 403) throw new Error('Invalid API Key.');
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      updateImageState(id, { resultUrl: url, status: 'done' });
    } catch (err) {
      console.error(err);
      updateImageState(id, { status: 'error', error: err.message || 'Failed' });
    }
  };

  const handleProcessAll = async () => {
    setIsProcessingAll(true);
    const pendingImages = images.filter(img => img.status === 'pending' || img.status === 'error');

    // Process sequentially to be nice to the API (or parallel if we want speed but careful about rate limits)
    // Using simple loop for now.
    for (const img of pendingImages) {
      await handleRemoveBackground(img.id);
    }
    setIsProcessingAll(false);
  };

  const handleDownload = (id) => {
    const image = images.find(img => img.id === id);
    if (image && image.resultUrl) {
      saveAs(image.resultUrl, `${image.filename}.png`);
    }
  };

  const handleDownloadAll = async () => {
    const processedImages = images.filter(img => img.status === 'done' && img.resultUrl);
    if (processedImages.length === 0) return;

    const zip = new JSZip();

    // Fetch all blobs
    const promises = processedImages.map(async (img) => {
      const response = await fetch(img.resultUrl);
      const blob = await response.blob();
      // Ensure unique filenames in zip
      zip.file(`${img.filename}.png`, blob);
    });

    await Promise.all(promises);

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'background-removed-images.zip');
  };

  const handleDelete = (id) => {
    const image = images.find(img => img.id === id);
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    if (image?.resultUrl) URL.revokeObjectURL(image.resultUrl);
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleClearAll = () => {
    images.forEach(img => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      if (img.resultUrl) URL.revokeObjectURL(img.resultUrl);
    });
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="app-container" style={{
      display: 'flex', flexDirection: 'column', height: '100%', padding: '2rem',
      maxWidth: '1200px', margin: '0 auto', width: '100%'
    }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 24, height: 24, background: 'var(--color-primary)', borderRadius: '6px' }}></div>
          AutoRemoveAI
        </div>
        <nav>
          <a href="#" style={{ color: 'var(--color-text-dim)', textDecoration: 'none', fontSize: '0.9rem' }}>GitHub</a>
        </nav>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '2rem', letterSpacing: '-0.03em', textAlign: 'center' }}>
          <span className="text-gradient">Remove Backgrounds</span><br />
          <span style={{ color: 'var(--color-primary)' }}>Batch Processing</span>
        </h1>

        {images.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <p style={{ color: 'var(--color-text-dim)', fontSize: '1.25rem', maxWidth: '600px', marginBottom: '3rem', textAlign: 'center' }}>
              Upload multiple images and remove backgrounds automatically.
            </p>
            <div
              className={`glass-panel ${isDragOver ? 'drag-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', maxWidth: '640px', height: '320px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderStyle: 'dashed', borderColor: isDragOver ? 'var(--color-primary)' : 'rgba(255,255,255,0.2)',
                borderWidth: '2px', transition: 'all 0.3s ease', cursor: 'pointer'
              }}
            >
              <div style={{
                width: '64px', height: '64px', borderRadius: '16px',
                background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1rem', color: 'var(--color-primary)'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Click or drag images to upload</h3>
              <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Supports JPG, PNG and WEBP</p>
              <button className="btn-primary" onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}>Upload Images</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>

            {/* Toolbar */}
            <div className="glass-panel" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>+ Add Images</button>
                <span style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>{images.length} images</span>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={handleProcessAll} disabled={isProcessingAll} className="btn-primary" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
                  {isProcessingAll ? 'Processing...' : 'Process All Pending'}
                </button>
                <button onClick={handleDownloadAll} disabled={!images.some(img => img.status === 'done')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
                  Download All (Zip)
                </button>
                <button onClick={handleClearAll} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text)', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Clear All
                </button>
              </div>
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {images.map(img => (
                <div key={img.id} className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                  <button
                    onClick={() => handleDelete(img.id)}
                    style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ×
                  </button>

                  <div style={{ height: '200px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                    {img.status === 'done' ? (
                      <img src={img.resultUrl} alt="Result" style={{ maxWidth: '100%', maxHeight: '100%', backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '20px 20px', backgroundColor: '#fff' }} />
                    ) : (
                      <img src={img.previewUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: '100%', opacity: img.status === 'processing' ? 0.5 : 1 }} />
                    )}

                    {img.status === 'processing' && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff' }}>Processing...</div>
                    )}
                    {img.status === 'error' && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.8)', color: '#fff', textAlign: 'center', padding: '1rem', fontSize: '0.8rem' }}>{img.error}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={img.filename}
                        onChange={(e) => updateImageState(img.id, { filename: e.target.value })}
                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.2)', color: 'var(--color-text)', width: '100%', padding: '0.25rem 0' }}
                      />
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '0.8rem' }}>.png</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {img.status !== 'done' && (
                        <button
                          onClick={() => handleRemoveBackground(img.id)}
                          disabled={img.status === 'processing'}
                          className="btn-primary"
                          style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem' }}
                        >
                          Remove BG
                        </button>
                      )}
                      {img.status === 'done' && (
                        <button
                          onClick={() => handleDownload(img.id)}
                          className="btn-primary"
                          style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
        />
      </main>

      <footer style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--color-text-dim)', padding: '2rem 0', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} AutoRemoveAI. All rights reserved.
      </footer>
    </div>
  )
}

export default App
