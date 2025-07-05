import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, Pause, Square, Video, Tag, Clock, Target, Award, Search, Trash2, X
} from "lucide-react";

// IndexedDB setup
const DB_NAME = 'MindMirrorDB';
const DB_VERSION = 2; // Incremented to force upgrade
const ENTRY_STORE = 'entries';
const VIDEO_STORE = 'videos';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const videoStore = db.createObjectStore(VIDEO_STORE, { keyPath: 'key' });
        videoStore.createIndex('thumbnail', 'thumbnail', { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Mock backend with IndexedDB
const mindMirrorBackend = {
  entries: [],
  videos: new Map(),
  
  initialize: async () => {
    try {
      const db = await openDB();
      const tx = db.transaction([ENTRY_STORE, VIDEO_STORE], 'readonly');
      const entryStore = tx.objectStore(ENTRY_STORE);
      const videoStore = tx.objectStore(VIDEO_STORE);
      
      const entries = await new Promise((resolve, reject) => {
        const request = entryStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      mindMirrorBackend.entries = entries;
      
      const videoData = await new Promise((resolve, reject) => {
        const request = videoStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      mindMirrorBackend.videos.clear();
      videoData.forEach(({ key, blob, thumbnail }) => {
        if (blob instanceof Blob && thumbnail) {
          console.log('Loading video from IndexedDB:', key, 'Blob size:', blob.size, 'Type:', blob.type);
          mindMirrorBackend.videos.set(key, { blob, thumbnail });
        } else {
          console.warn('Invalid blob or thumbnail for key:', key, 'Data:', { blob, thumbnail });
        }
      });
      if (mindMirrorBackend.videos.size === 0 && videoData.length > 0) {
        console.warn('Videos Map empty despite data in IndexedDB');
      }
      
      db.close();
      console.log('IndexedDB initialized:', { entries: entries.length, videos: mindMirrorBackend.videos.size });
    } catch (error) {
      console.error('Error initializing IndexedDB:', error);
      // Attempt to recreate stores if missing
      const db = await openDB();
      const tx = db.transaction([ENTRY_STORE, VIDEO_STORE], 'readwrite');
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: '_id' });
        console.log('Recreated ENTRY_STORE');
      }
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const videoStore = db.createObjectStore(VIDEO_STORE, { keyPath: 'key' });
        videoStore.createIndex('thumbnail', 'thumbnail', { unique: false });
        console.log('Recreated VIDEO_STORE');
      }
      db.close();
      await mindMirrorBackend.initialize(); // Retry initialization
    }
  },
  
  saveEntry: async (entry) => {
    const db = await openDB();
    const newEntry = {
      ...entry,
      _id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      duration: entry.duration || "0:00"
    };
    const tx = db.transaction([ENTRY_STORE], 'readwrite');
    const store = tx.objectStore(ENTRY_STORE);
    await new Promise((resolve, reject) => {
      const request = store.put(newEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    mindMirrorBackend.entries.unshift(newEntry);
    db.close();
    console.log('Entry saved:', newEntry);
    return newEntry;
  },
  
  getEntries: async () => {
    const db = await openDB();
    const tx = db.transaction([ENTRY_STORE], 'readonly');
    const store = tx.objectStore(ENTRY_STORE);
    const entries = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return entries;
  },
  
  deleteEntry: async (id) => {
    const db = await openDB();
    const index = mindMirrorBackend.entries.findIndex(e => e._id === id);
    if (index !== -1) {
      const entry = mindMirrorBackend.entries[index];
      if (entry.videoUrl && entry.videoUrl !== "no-video") {
        const videoTx = db.transaction([VIDEO_STORE], 'readwrite');
        const videoStore = videoTx.objectStore(VIDEO_STORE);
        await new Promise((resolve, reject) => {
          const request = videoStore.delete(entry.videoUrl);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        const video = mindMirrorBackend.videos.get(entry.videoUrl);
        if (video?.blob) {
          URL.revokeObjectURL(URL.createObjectURL(video.blob));
        }
        mindMirrorBackend.videos.delete(entry.videoUrl);
      }
      const tx = db.transaction([ENTRY_STORE], 'readwrite');
      const store = tx.objectStore(ENTRY_STORE);
      await new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      mindMirrorBackend.entries.splice(index, 1);
      db.close();
      console.log('Entry deleted:', id);
      return true;
    }
    db.close();
    return false;
  },
  
  saveVideo: async (key, blob, thumbnail) => {
    if (!(blob instanceof Blob)) {
      console.error('Invalid blob type for key:', key, 'Type:', typeof blob);
      return null;
    }
    mindMirrorBackend.videos.set(key, { blob, thumbnail });
    const db = await openDB();
    const tx = db.transaction([VIDEO_STORE], 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);
    await new Promise((resolve, reject) => {
      const request = store.put({ key, blob, thumbnail });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
    console.log('Video saved:', { key, thumbnail: thumbnail ? 'present' : 'missing', blobSize: blob.size, blobType: blob.type });
    return key;
  },
  
  getVideo: async (key) => {
    const video = mindMirrorBackend.videos.get(key);
    if (video?.blob && video.blob instanceof Blob) {
      try {
        const url = URL.createObjectURL(video.blob);
        console.log('Generated URL for key:', key, 'URL:', url, 'Blob size:', video.blob.size, 'Type:', video.blob.type, 'Blob valid:', video.blob.size > 0);
        // Fallback test: Copy this URL into a new tab to test playback manually
        console.log('Test URL manually:', url);
        return url;
      } catch (error) {
        console.error('Failed to create object URL for key:', key, 'Error:', error, 'Blob:', video.blob, 'Blob type:', video.blob.type);
        return null;
      }
    }
    console.error('No valid blob found for key:', key, 'Video data:', video);
    return null;
  },
  
  getThumbnail: async (key) => {
    const db = await openDB();
    const tx = db.transaction([VIDEO_STORE], 'readonly');
    const store = tx.objectStore(VIDEO_STORE);
    const metadata = await new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return metadata?.thumbnail || null;
  }
};

// CSS Animation for pulse
const pulseAnimation = `
@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = pulseAnimation;
document.head.appendChild(styleSheet);

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #faf5ff 100%)',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  maxWidth: {
    maxWidth: '1200px',
    margin: '0 auto'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid rgba(0, 0, 0, 0.05)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem'
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #2563eb, #9333ea)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '0.5rem'
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '1.1rem'
  },
  tabContainer: {
    display: 'flex',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '1.5rem',
    border: '1px solid #e2e8f0'
  },
  tab: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    textAlign: 'center'
  },
  activeTab: {
    backgroundColor: 'white',
    color: '#2563eb',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
  },
  inactiveTab: {
    color: '#64748b'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1rem',
    border: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statNumber: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#1f2937'
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#6b7280',
    fontWeight: '500'
  },
  videoContainer: {
    position: 'relative',
    backgroundColor: '#1f2937',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '1rem',
    aspectRatio: '16/9'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  recordingBadge: {
    position: 'absolute',
    top: '1rem',
    left: '1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    padding: '0.5rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.875rem',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  pulse: {
    width: '8px',
    height: '8px',
    backgroundColor: 'white',
    borderRadius: '50%',
    animation: 'pulse 1s infinite'
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '0.875rem'
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    color: 'white'
  },
  dangerButton: {
    backgroundColor: '#dc2626',
    color: 'white'
  },
  gradientButton: {
    background: 'linear-gradient(135deg, #2563eb, #9333ea)',
    color: 'white'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box'
  },
  inputGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '0.5rem'
  },
  entriesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1rem'
  },
  entryCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    backgroundColor: 'white',
    position: 'relative'
  },
  entryThumbnail: {
    aspectRatio: '16/9',
    backgroundColor: '#f3f4f6',
    position: 'relative',
    overflow: 'hidden'
  },
  entryContent: {
    padding: '1rem'
  },
  entryTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '0.5rem'
  },
  entryMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '0.75rem',
    color: '#6b7280',
    marginBottom: '0.75rem',
    flexWrap: 'wrap'
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem'
  },
  tag: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '0.25rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 1rem',
    color: '#6b7280'
  },
  searchContainer: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
    flexWrap: 'wrap'
  },
  searchInput: {
    flex: 1,
    minWidth: '200px'
  },
  deleteButton: {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '0.25rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    zIndex: 10
  },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#e5e7eb',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '0.5rem'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: '3px',
    transition: 'width 0.3s ease'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
    zIndex: 1001
  },
  closeButton: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    border: 'none',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s ease',
    zIndex: 1002,
    outline: 'none',
    ':hover': { backgroundColor: '#f0f0f0' }
  }
};

// Progress Bar Component
const ProgressBar = ({ value, max = 100 }) => (
  <div style={styles.progressBar}>
    <div 
      style={{
        ...styles.progressFill,
        width: `${Math.min((value / max) * 100, 100)}%`
      }}
    />
  </div>
);

// Video Player Component
const VideoPlayer = ({ videoKey, onClose }) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadVideo = async () => {
      console.log('Attempting to load video for key:', videoKey);
      const url = await mindMirrorBackend.getVideo(videoKey);
      if (isMounted && url) {
        setVideoUrl(url);
        console.log('Video URL successfully loaded:', url, 'Key:', videoKey);
      } else {
        console.error('Failed to load video URL for key:', videoKey, 'URL:', url, 'Is mounted:', isMounted);
        setVideoUrl(null);
      }
    };

    if (videoKey) loadVideo();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        console.log('Escape key pressed, closing video player');
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      isMounted = false;
      if (videoRef.current && videoRef.current.src) {
        console.log('Revoking video URL:', videoRef.current.src);
        URL.revokeObjectURL(videoRef.current.src);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [videoKey, onClose]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            try {
              console.log('Close button clicked');
              onClose();
            } catch (error) {
              console.error('Error closing video player:', error);
            }
          }} 
          style={styles.closeButton} 
          aria-label="Close video player"
          tabIndex="0"
          onMouseOver={() => console.log('Close button hovered')}
        >
          <X size={20} />
        </button>
        {videoUrl ? (
          <video
            ref={videoRef}
            style={styles.video}
            controls
            autoPlay
            src={videoUrl}
            onError={(e) => {
              console.error('Video playback error:', e, 'Current src:', videoRef.current?.src, 'Error code:', e.target.error?.code, 'Message:', e.target.error?.message);
              setVideoUrl(null);
            }}
            onLoadedData={() => console.log('Video loaded successfully:', videoUrl)}
          />
        ) : (
          <div style={styles.emptyState}>Video not found or failed to load. Please try again.</div>
        )}
      </div>
    </div>
  );
};

// Video Recorder Component
const VideoRecorder = ({ onRecordingComplete, onError }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const recordedChunks = useRef([]);
  const rawRecordingTime = useRef(0); // Added to track raw timer value

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processing, setProcessing] = useState(false);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    console.log('recordingTime updated to:', recordingTime); // Debug state updates
  }, [recordingTime]);

  const generateThumbnail = async (videoBlob) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      let attempts = 0;
      const maxAttempts = 5;

      const attemptCapture = () => {
        if (attempts >= maxAttempts) {
          console.warn('Max thumbnail attempts reached, falling back to null');
          URL.revokeObjectURL(video.src);
          resolve(null);
          return;
        }
        video.currentTime = Math.min(1 + attempts, 5);
        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(video.src);
            console.log('Thumbnail generated successfully for blob size:', videoBlob.size);
            resolve(thumbnail);
          } catch (error) {
            console.error('Thumbnail generation error:', error);
            attempts++;
            setTimeout(attemptCapture, 500);
          }
        };
        video.onerror = () => {
          console.error('Video load error for thumbnail');
          attempts++;
          setTimeout(attemptCapture, 500);
        };
      };

      video.onloadedmetadata = () => attemptCapture();
      video.load();
    });
  };

  const startRecording = async () => {
    try {
      setProcessing(true);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const supportedMimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/mp4'
      ];
      const mimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunks.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.current.push(event.data);
          console.log('Chunk recorded, size:', event.data.size);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunks.current, { type: mimeType });
          console.log('Recording stopped, blob created, size:', blob.size, 'type:', mimeType);
          const thumbnail = await generateThumbnail(blob);
          const key = `video-${Date.now()}`;
          const savedKey = await mindMirrorBackend.saveVideo(key, blob, thumbnail);
          if (savedKey) {
            console.log('Video saved with key:', savedKey);
            if (onRecordingComplete) {
              onRecordingComplete(savedKey, formatTime(rawRecordingTime.current)); // Use raw value
            }
          } else {
            console.error('Failed to save video, key not returned');
            if (onError) onError('Failed to save video recording.');
          }
        } catch (error) {
          console.error('Error processing video:', error);
          if (onError) {
            onError("Failed to process video recording: " + error.message);
          }
        } finally {
          cleanup();
          setProcessing(false);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      rawRecordingTime.current = 0; // Reset raw time
      setRecordingTime(0); // Reset to 0 when starting
      setProcessing(false);
      
      timerRef.current = setInterval(() => {
        rawRecordingTime.current += 1; // Increment raw value
        setRecordingTime(prev => {
          const newTime = prev + 1;
          console.log('Recording time updated:', newTime);
          return newTime;
        });
      }, 1000);
      
    } catch (err) {
      console.error("Error starting recording:", err);
      setProcessing(false);
      if (onError) {
        onError(`Failed to start recording: ${err.message}. Please check camera and microphone permissions.`);
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        timerRef.current = setInterval(() => {
          rawRecordingTime.current += 1; // Increment raw value
          setRecordingTime(prev => {
            const newTime = prev + 1;
            console.log('Recording time updated:', newTime);
            return newTime;
          });
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setProcessing(true);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      console.log('Stopping recording with final duration:', recordingTime, 'Raw duration:', rawRecordingTime.current); // Enhanced debug log
      if (onRecordingComplete) {
        onRecordingComplete(`video-${Date.now()}`, formatTime(rawRecordingTime.current)); // Use raw value
      }
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.card}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Video color="#2563eb" size={20} />
        Record New Entry
      </h3>
      
      <div style={styles.videoContainer}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          style={styles.video}
        />
        {isRecording && (
          <div style={styles.recordingBadge}>
            <div style={styles.pulse}></div>
            {isPaused ? 'PAUSED' : 'REC'} {formatTime(recordingTime)}
          </div>
        )}
        {processing && (
          <div style={{
            ...styles.recordingBadge,
            backgroundColor: '#f59e0b'
          }}>
            Processing...
          </div>
        )}
      </div>

      <div style={styles.buttonContainer}>
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={processing}
            style={{...styles.button, ...styles.primaryButton}}
            className="button"
            aria-label="Start recording"
          >
            <Video size={16} />
            Start Recording
          </button>
        ) : (
          <>
            <button
              onClick={pauseRecording}
              style={{...styles.button, backgroundColor: '#f59e0b', color: 'white'}}
              className="button"
              aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={stopRecording}
              style={{...styles.button, ...styles.dangerButton}}
              className="button"
              aria-label="Stop recording"
            >
              <Square size={16} />
              Stop & Save
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Entry Form Component
const EntryForm = ({ videoKey, videoDuration, onEntrySaved, onError }) => {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      if (onError) onError("Please enter a title for your entry");
      return;
    }

    setLoading(true);

    try {
      const tagArray = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      console.log('Saving entry with duration:', videoDuration);
      const entry = await mindMirrorBackend.saveEntry({
        title: title.trim(),
        tags: tagArray,
        videoUrl: videoKey || "no-video",
        duration: videoDuration || "0:00"
      });

      setTitle("");
      setTags("");
      
      if (onEntrySaved) {
        console.log('Entry saved, triggering onEntrySaved:', entry);
        onEntrySaved();
      }
    } catch (err) {
      console.error("Error saving entry:", err);
      if (onError) {
        onError("Failed to save entry. Please try again: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Tag color="#10b981" size={20} />
        Entry Details
        {videoKey && (
          <span style={{
            backgroundColor: '#dcfce7',
            color: '#16a34a',
            padding: '0.25rem 0.5rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: '500'
          }}>
            Video Ready
          </span>
        )}
      </h3>

      <div style={styles.inputGroup}>
        <label style={styles.label}>Entry Title *</label>
        <input
          type="text"
          placeholder="e.g., Daily Practice, Interview Prep..."
          style={styles.input}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-required="true"
        />
      </div>

      <div style={styles.inputGroup}>
        <label style={styles.label}>Tags (comma separated)</label>
        <input
          type="text"
          placeholder="e.g., pronunciation, confidence, daily"
          style={styles.input}
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      {videoDuration && (
        <div style={styles.inputGroup}>
          <label style={styles.label}>Video Duration</label>
          <input
            type="text"
            value={videoDuration}
            style={{ ...styles.input, backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
            readOnly
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !title.trim()}
        style={{...styles.button, ...styles.gradientButton, width: '100%'}}
        className="button"
        aria-label="Save entry"
      >
        {loading ? "Saving..." : "Save Entry"}
      </button>
    </div>
  );
};

// Main MindMirror Component
const MindMirrorApp = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [videoKey, setVideoKey] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    console.log('Playing video state updated:', playingVideo);
  }, [playingVideo]);

  const stats = {
    totalEntries: entries.length,
    totalMinutes: entries.reduce((acc, entry) => {
      const [mins, secs] = (entry.duration || "0:00").split(':').map(Number);
      return acc + (mins || 0) + ((secs || 0) / 60);
    }, 0),
    currentStreak: 7,
    weeklyGoal: 5,
    weeklyProgress: Math.min(entries.length, 5)
  };

  const fetchEntries = useCallback(async () => {
    try {
      const data = await mindMirrorBackend.getEntries();
      setEntries(data);
      console.log('Entries fetched:', data);
    } catch (error) {
      console.error("Error fetching entries:", error);
    }
  }, []);

  useEffect(() => {
    mindMirrorBackend.initialize().then(fetchEntries);
  }, [refreshTrigger, fetchEntries]);

  const allTags = Array.from(new Set(entries.flatMap(entry => entry.tags)));
  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => entry.tags.includes(tag));
    return matchesSearch && matchesTags;
  });

  const handleRecordingComplete = useCallback((key, duration) => {
    console.log('handleRecordingComplete:', { key, duration });
    setVideoKey(key);
    setVideoDuration(duration);
    setActiveTab('record');
  }, []);

  const handleEntrySaved = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    setVideoKey(null);
    setVideoDuration(null);
    setActiveTab('entries');
  }, []);

  const handleDeleteEntry = async (entryId) => {
    try {
      await mindMirrorBackend.deleteEntry(entryId);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error("Error deleting entry:", error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handlePlayVideo = (videoKey) => {
    console.log('handlePlayVideo called with key:', videoKey, 'Event triggered');
    if (videoKey && videoKey !== "no-video") {
      setPlayingVideo(videoKey);
      console.log('Setting playingVideo to:', videoKey);
    } else {
      console.warn('Invalid videoKey:', videoKey);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div>
                  <div style={styles.statNumber}>{stats.totalEntries}</div>
                  <div style={styles.statLabel}>Total Entries</div>
                </div>
                <Video color="#2563eb" size={24} />
              </div>
              <div style={styles.statCard}>
                <div>
                  <div style={styles.statNumber}>{Math.round(stats.totalMinutes * 10) / 10}m</div>
                  <div style={styles.statLabel}>Practice Time</div>
                </div>
                <Clock color="#10b981" size={24} />
              </div>
              <div style={styles.statCard}>
                <div>
                  <div style={styles.statNumber}>{stats.currentStreak}</div>
                  <div style={styles.statLabel}>Day Streak</div>
                </div>
                <Award color="#f59e0b" size={24} />
              </div>
              <div style={styles.statCard}>
                <div>
                  <div style={styles.statNumber}>{stats.weeklyProgress}/{stats.weeklyGoal}</div>
                  <div style={styles.statLabel}>Weekly Goal</div>
                  <ProgressBar value={stats.weeklyProgress} max={stats.weeklyGoal} />
                </div>
                <Target color="#8b5cf6" size={24} />
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                Recent Entries
              </h3>
              {entries.length === 0 ? (
                <div style={styles.emptyState}>
                  <Video size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No entries yet. Start practicing!</p>
                </div>
              ) : (
                <div style={styles.entriesGrid}>
                  {entries.slice(0, 3).map(entry => (
                    <div key={entry._id} style={styles.entryCard}>
                      <div 
                        style={styles.entryThumbnail} 
                        onClick={(e) => { e.preventDefault(); if (entry.videoUrl !== "no-video") handlePlayVideo(entry.videoUrl); }}
                        role={entry.videoUrl !== "no-video" ? "button" : undefined}
                        tabIndex={entry.videoUrl !== "no-video" ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && entry.videoUrl !== "no-video") {
                            handlePlayVideo(entry.videoUrl);
                          }
                        }}
                      >
                        {entry.videoUrl !== "no-video" ? (
                          <img
                            src={mindMirrorBackend.videos.get(entry.videoUrl)?.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgYAAAADEAAW/AsrwAAAAASUVORK5CYII='}
                            alt={`Thumbnail for ${entry.title}`}
                            style={styles.thumbnail}
                            onError={(e) => {
                              console.error('Thumbnail load error for:', entry.videoUrl);
                              e.target.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgYAAAADEAAW/AsrwAAAAASUVORK5CYII=';
                            }}
                          />
                        ) : (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'rgba(0, 0, 0, 0.1)'
                          }}>
                            <Video size={40} color="#666" />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEntry(entry._id);
                          }}
                          style={styles.deleteButton}
                          className="delete-button"
                          aria-label={`Delete entry ${entry.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={styles.entryContent}>
                        <h4 style={styles.entryTitle}>{entry.title}</h4>
                        <div style={styles.entryMeta}>
                          <div style={styles.metaItem}>
                            <Clock size={12} />
                            {formatDate(entry.createdAt)}
                          </div>
                          <div style={styles.metaItem}>
                            <Clock size={12} />
                            {entry.duration || "0:00"}
                          </div>
                        </div>
                        <div style={styles.tagContainer}>
                          {entry.tags.slice(0, 2).map(tag => (
                            <span key={tag} style={styles.tag}>#{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        );

      case 'record':
        return (
          <>
            <VideoRecorder
              onRecordingComplete={handleRecordingComplete}
              onError={(error) => console.error(error)}
            />
            <EntryForm
              videoKey={videoKey}
              videoDuration={videoDuration}
              onEntrySaved={handleEntrySaved}
              onError={(error) => console.error(error)}
            />
          </>
        );

      case 'entries':
        return (
          <>
            <div style={styles.card}>
              <div style={styles.searchContainer}>
                <div style={styles.searchInput}>
                  <input
                    type="text"
                    placeholder="Search entries..."
                    style={styles.input}
                    className="input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search entries"
                  />
                </div>
              </div>

              {allTags.length > 0 && (
                <div>
                  <label style={styles.label}>Filter by tags:</label>
                  <div style={styles.tagContainer}>
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        style={{
                          ...styles.tag,
                          backgroundColor: selectedTags.includes(tag) ? '#2563eb' : '#e5e7eb',
                          color: selectedTags.includes(tag) ? 'white' : '#374151',
                          cursor: 'pointer',
                          border: 'none'
                        }}
                        onClick={() => toggleTag(tag)}
                        aria-pressed={selectedTags.includes(tag)}
                        aria-label={`Filter by tag ${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={styles.entriesGrid}>
              {filteredEntries.length === 0 ? (
                <div style={{ ...styles.card, ...styles.emptyState, gridColumn: '1 / -1' }}>
                  <Search size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No entries found. Try adjusting your search or filters.</p>
                </div>
              ) : (
                filteredEntries.map(entry => (
                  <div key={entry._id} style={styles.entryCard} className="entry-card">
                    <div 
                      style={styles.entryThumbnail} 
                      onClick={(e) => { e.preventDefault(); if (entry.videoUrl !== "no-video") handlePlayVideo(entry.videoUrl); }}
                      role={entry.videoUrl !== "no-video" ? "button" : undefined}
                      tabIndex={entry.videoUrl !== "no-video" ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && entry.videoUrl !== "no-video") {
                          handlePlayVideo(entry.videoUrl);
                        }
                      }}
                    >
                      {entry.videoUrl !== "no-video" ? (
                        <img
                          src={mindMirrorBackend.videos.get(entry.videoUrl)?.thumbnail || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgYAAAADEAAW/AsrwAAAAASUVORK5CYII='}
                          alt={`Thumbnail for ${entry.title}`}
                          style={styles.thumbnail}
                          onError={(e) => {
                            console.error('Thumbnail load error for:', entry.videoUrl);
                            e.target.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgYAAAADEAAW/AsrwAAAAASUVORK5CYII=';
                          }}
                        />
                      ) : (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)'
                        }}>
                          <Video size={40} color="#666" />
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEntry(entry._id);
                        }}
                        style={styles.deleteButton}
                        className="delete-button"
                        aria-label={`Delete entry ${entry.title}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={styles.entryContent}>
                      <h4 style={styles.entryTitle}>{entry.title}</h4>
                      <div style={styles.entryMeta}>
                        <div style={styles.metaItem}>
                          <Clock size={12} />
                          {formatDate(entry.createdAt)}
                        </div>
                        <div style={styles.metaItem}>
                          <Clock size={12} />
                          {entry.duration || "0:00"}
                        </div>
                      </div>
                      <div style={styles.tagContainer}>
                        {entry.tags.map(tag => (
                          <span key={tag} style={styles.tag}>#{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        );

      case 'statistics':
        return (
          <>
            <div style={styles.card}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Target color="#2563eb" size={20} />
                Progress Overview
              </h3>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Weekly Goal Progress</span>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {stats.weeklyProgress}/{stats.weeklyGoal} entries
                  </span>
                </div>
                <ProgressBar value={stats.weeklyProgress} max={stats.weeklyGoal} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>{stats.totalEntries}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total Entries</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{stats.currentStreak}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Day Streak</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag color="#8b5cf6" size={20} />
                Most Used Tags
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {allTags.slice(0, 5).map((tag, index) => {
                  const count = entries.filter(entry => entry.tags.includes(tag)).length;
                  const maxCount = Math.max(...allTags.map(t => entries.filter(e => e.tags.includes(t)).length));
                  const percentage = count > 0 ? (count / maxCount) * 100 : 0;
                  
                  return (
                    <div key={tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                        <span style={styles.tag}>#{tag}</span>
                        <div style={{ 
                          flex: 1,
                          height: '8px',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            height: '100%',
                            backgroundColor: `hsl(${(index * 60) % 360}, 70%, 50%)`,
                            width: `${percentage}%`,
                            borderRadius: '4px',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
                        {count} {count === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Practice Insights</h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Your speaking practice journey</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#faf5ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{Math.round(stats.totalMinutes)}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>Total Minutes Practiced</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fff7ed', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ea580c' }}>
                    {entries.length > 0 ? Math.round((stats.totalMinutes / stats.totalEntries) * 10) / 10 : 0}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>Average Entry Length (min)</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#dc2626' }}>{allTags.length}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>Different Practice Areas</div>
                </div>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        <div style={styles.header}>
          <h1 style={styles.title}>MindMirror</h1>
          <p style={styles.subtitle}>Practice, Record, and Improve Your Speaking Skills</p>
        </div>

        <div style={styles.tabContainer}>
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'record', label: 'Record' },
            { id: 'entries', label: 'Entries' },
            { id: 'statistics', label: 'Statistics' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.activeTab : styles.inactiveTab)
              }}
              aria-label={`Switch to ${tab.label} tab`}
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderTabContent()}
        {playingVideo && (
          <VideoPlayer
            videoKey={playingVideo}
            onClose={() => setPlayingVideo(null)}
          />
        )}
      </div>
    </div>
  );
};

export default MindMirrorApp;