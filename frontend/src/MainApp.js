import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, Pause, Square, Video, Tag, Clock, Target, Award, Search, Trash2, X, User, LogOut 
} from "lucide-react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";

// IndexedDB setup with user-specific database name
const getDBName = (user) => {
  return user ? `MindMirrorDB_${user.uid}` : 'MindMirrorDB';
};
const DB_VERSION = 2;
const ENTRY_STORE = 'entries';
const VIDEO_STORE = 'videos';

const openDB = (user) => {
  return new Promise((resolve, reject) => {
    const dbName = getDBName(user);
    const request = indexedDB.open(dbName, DB_VERSION);
    
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
  
  initialize: async (user, retryCount = 0, maxRetries = 3) => {
    try {
      const db = await openDB(user);
      const transaction = db.transaction([ENTRY_STORE, VIDEO_STORE], 'readonly');
      const entryStore = transaction.objectStore(ENTRY_STORE);
      const videoStore = transaction.objectStore(VIDEO_STORE);
      
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
      
      transaction.oncomplete = () => db.close();
      console.log('IndexedDB initialized for user:', user?.uid, { entries: entries.length, videos: mindMirrorBackend.videos.size });
    } catch (error) {
      console.error('Error initializing IndexedDB for user:', user?.uid, error);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        await mindMirrorBackend.initialize(user, retryCount + 1, maxRetries);
      } else {
        const db = await openDB(user);
        if (!db.objectStoreNames.contains(ENTRY_STORE)) {
          db.createObjectStore(ENTRY_STORE, { keyPath: '_id' });
          console.log('Recreated ENTRY_STORE for user:', user?.uid);
        }
        if (!db.objectStoreNames.contains(VIDEO_STORE)) {
          const videoStore = db.createObjectStore(VIDEO_STORE, { keyPath: 'key' });
          videoStore.createIndex('thumbnail', 'thumbnail', { unique: false });
          console.log('Recreated VIDEO_STORE for user:', user?.uid);
        }
        db.close();
      }
    }
  },
  
  saveEntry: async (user, entry) => {
    const db = await openDB(user);
    const newEntry = {
      ...entry,
      _id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      duration: entry.duration || "0:00"
    };
    const transaction = db.transaction([ENTRY_STORE], 'readwrite');
    const store = transaction.objectStore(ENTRY_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.put(newEntry);
      request.onsuccess = () => {
        transaction.oncomplete = () => {
          mindMirrorBackend.entries.unshift(newEntry);
          db.close();
          console.log('Entry saved successfully for user:', user?.uid, newEntry);
          resolve(newEntry);
        };
        transaction.onerror = () => {
          db.close();
          reject(new Error('Transaction failed'));
        };
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  },
  
  getEntries: async (user) => {
    const db = await openDB(user);
    const store = db.transaction([ENTRY_STORE], 'readonly').objectStore(ENTRY_STORE);
    const entries = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return entries;
  },
  
  deleteEntry: async (user, id) => {
    const db = await openDB(user);
    const index = mindMirrorBackend.entries.findIndex(e => e._id === id);
    if (index !== -1) {
      const entry = mindMirrorBackend.entries[index];
      if (entry.videoUrl && entry.videoUrl !== "no-video") {
        const videoStore = db.transaction([VIDEO_STORE], 'readwrite').objectStore(VIDEO_STORE);
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
      const store = db.transaction([ENTRY_STORE], 'readwrite').objectStore(ENTRY_STORE);
      await new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      mindMirrorBackend.entries.splice(index, 1);
      db.close();
      console.log('Entry deleted for user:', user?.uid, id);
      return true;
    }
    db.close();
    return false;
  },
  
  saveVideo: async (user, key, blob, thumbnail) => {
    if (!(blob instanceof Blob)) {
      console.error('Invalid blob type for key:', key, 'Type:', typeof blob);
      return null;
    }
    mindMirrorBackend.videos.set(key, { blob, thumbnail });
    const db = await openDB(user);
    const store = db.transaction([VIDEO_STORE], 'readwrite').objectStore(VIDEO_STORE);
    await new Promise((resolve, reject) => {
      const request = store.put({ key, blob, thumbnail });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
    console.log('Video saved for user:', user?.uid, { key, thumbnail: thumbnail ? 'present' : 'missing', blobSize: blob.size, blobType: blob.type });
    return key;
  },
  
  getVideo: async (user, key) => {
    const video = mindMirrorBackend.videos.get(key);
    if (video?.blob && video.blob instanceof Blob) {
      try {
        const url = URL.createObjectURL(video.blob);
        console.log('Generated URL for key:', key, 'URL:', url, 'Blob size:', video.blob.size, 'Type:', video.blob.type, 'Blob valid:', video.blob.size > 0);
        return url;
      } catch (error) {
        console.error('Failed to create object URL for key:', key, 'Error:', error, 'Blob:', video.blob, 'Blob type:', video.blob.type);
        return null;
      }
    }
    console.error('No valid blob found for key:', key, 'Video data:', video);
    return null;
  },
  
  getThumbnail: async (user, key) => {
    const db = await openDB(user);
    const store = db.transaction([VIDEO_STORE], 'readonly').objectStore(VIDEO_STORE);
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

// Styles with theme support
const styles = {
  container: (theme) => ({
    minHeight: '100vh',
    background: theme === 'dark' ? '#1f2937' : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #faf5ff 100%)',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: theme === 'dark' ? '#d1d5db' : '#1f2937',
    transition: 'all 0.3s ease'
  }),
  maxWidth: {
    maxWidth: '1200px',
    margin: '0 auto'
  },
  card: (theme) => ({
    backgroundColor: theme === 'dark' ? '#374151' : 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    border: theme === 'dark' ? '1px solid #4b5563' : '1px solid rgba(0, 0, 0, 0.05)'
  }),
  header: (theme) => ({
    textAlign: 'center',
    marginBottom: '2.5rem',
    padding: '2rem 1rem',
    background: theme === 'dark' ? 'linear-gradient(90deg, rgba(37,99,235,0.2) 0%, rgba(147,51,234,0.2) 100%)' : 'linear-gradient(90deg, rgba(37,99,235,0.1) 0%, rgba(147,51,234,0.1) 100%)',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    position: 'relative',
    overflow: 'visible'
  }),
  title: (theme) => ({
    fontSize: '3rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #2563eb, #9333ea)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: '0',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    position: 'relative',
    zIndex: 2
  }),
  subtitle: (theme) => ({
    color: theme === 'dark' ? '#9ca3af' : '#4b5563',
    fontSize: '1.25rem',
    fontWeight: '500',
    marginTop: '0.5rem',
    opacity: 0.9,
    position: 'relative',
    zIndex: 2
  }),
  tabContainer: (theme) => ({
    display: 'flex',
    backgroundColor: theme === 'dark' ? '#4b5563' : '#f8fafc',
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '1.5rem',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #e2e8f0'
  }),
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
  activeTab: (theme) => ({
    backgroundColor: theme === 'dark' ? '#6b7280' : 'white',
    color: '#2563eb',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
  }),
  inactiveTab: (theme) => ({
    color: theme === 'dark' ? '#d1d5db' : '#64748b'
  }),
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  statCard: (theme) => ({
    backgroundColor: theme === 'dark' ? '#4b5563' : 'white',
    borderRadius: '8px',
    padding: '1rem',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }),
  statNumber: (theme) => ({
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: theme === 'dark' ? '#e5e7eb' : '#1f2937'
  }),
  statLabel: (theme) => ({
    fontSize: '0.75rem',
    color: theme === 'dark' ? '#9ca3af' : '#6b7280',
    fontWeight: '500'
  }),
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
  button: (theme) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '9999px',
    border: 'none',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '0.875rem',
    whiteSpace: 'nowrap',
    backgroundColor: theme === 'dark' ? '#4b5563' : 'white',
    color: theme === 'dark' ? '#e5e7eb' : '#374151',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #d1d5db'
  }),
  accountButton: (theme) => ({
    backgroundColor: theme === 'dark' ? '#4b5563' : 'white',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #d1d5db',
    color: theme === 'dark' ? '#e5e7eb' : '#374151',
    position: 'relative',
    padding: '0.75rem 1rem'
  }),
  accountPopout: (theme) => ({
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: theme === 'dark' ? '#374151' : 'white',
    border: theme === 'dark' ? '1px solid #4b5563' : '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '0.5rem 0',
    minWidth: '180px',
    zIndex: 1002,
    display: 'none',
    marginTop: '0.25rem'
  }),
  accountPopoutActive: {
    display: 'block'
  },
  popoutItem: (theme) => ({
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
    color: theme === 'dark' ? '#d1d5db' : '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: theme === 'dark' ? '#4b5563' : '#f3f4f6'
    }
  }),
  popoutItemDanger: (theme) => ({
    color: '#dc2626',
    ':hover': {
      backgroundColor: theme === 'dark' ? '#451a1a' : '#fef2f2'
    }
  }),
  logoutButton: (theme) => ({
    backgroundColor: theme === 'dark' ? '#451a1a' : '#fff0f0',
    color: '#dc2626',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #fecaca',
    marginLeft: '0.75rem',
    padding: '0.75rem 1.25rem'
  }),
  primaryButton: (theme) => ({
    backgroundColor: '#2563eb',
    color: 'white'
  }),
  dangerButton: (theme) => ({
    backgroundColor: '#dc2626',
    color: 'white'
  }),
  gradientButton: (theme) => ({
    background: 'linear-gradient(135deg, #2563eb, #9333ea)',
    color: 'white'
  }),
  input: (theme) => ({
    width: '100%',
    padding: '0.75rem',
    border: theme === 'dark' ? '1px solid #6b7280' : '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
    backgroundColor: theme === 'dark' ? '#4b5563' : 'white',
    color: theme === 'dark' ? '#d1d5db' : '#374151'
  }),
  inputGroup: {
    marginBottom: '1rem'
  },
  label: (theme) => ({
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: theme === 'dark' ? '#9ca3af' : '#374151',
    marginBottom: '0.5rem'
  }),
  entriesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1rem'
  },
  entryCard: (theme) => ({
    border: theme === 'dark' ? '1px solid #4b5563' : '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    backgroundColor: theme === 'dark' ? '#4b5563' : 'white',
    position: 'relative'
  }),
  entryThumbnail: {
    aspectRatio: '16/9',
    backgroundColor: '#f3f4f6',
    position: 'relative',
    overflow: 'hidden'
  },
  entryContent: (theme) => ({
    padding: '1rem',
    color: theme === 'dark' ? '#d1d5db' : '#1f2937'
  }),
  entryTitle: (theme) => ({
    fontSize: '1rem',
    fontWeight: '600',
    color: theme === 'dark' ? '#e5e7eb' : '#1f2937',
    marginBottom: '0.5rem'
  }),
  entryMeta: (theme) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '0.75rem',
    color: theme === 'dark' ? '#9ca3af' : '#6b7280',
    marginBottom: '0.75rem',
    flexWrap: 'wrap'
  }),
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
  tag: (theme) => ({
    backgroundColor: theme === 'dark' ? '#1e293b' : '#dbeafe',
    color: theme === 'dark' ? '#93c5fd' : '#1e40af',
    padding: '0.25rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500'
  }),
  emptyState: (theme) => ({
    textAlign: 'center',
    padding: '3rem 1rem',
    color: theme === 'dark' ? '#9ca3af' : '#6b7280'
  }),
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
  progressBar: (theme) => ({
    width: '100%',
    height: '6px',
    backgroundColor: theme === 'dark' ? '#4b5563' : '#e5e7eb',
    borderRadius: '3px',
    overflow: 'hidden',
    marginTop: '0.5rem'
  }),
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
    zIndex: 1003
  },
  modalContent: (theme) => ({
    backgroundColor: theme === 'dark' ? '#374151' : 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
    zIndex: 1004,
    width: '400px'
  }),
  closeButton: (theme) => ({
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)',
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
    zIndex: 1005,
    outline: 'none',
    ':hover': { backgroundColor: theme === 'dark' ? '#4b5563' : '#f0f0f0' }
  })
};

// Progress Bar Component
const ProgressBar = ({ value, max = 100, theme }) => (
  <div style={styles.progressBar(theme)}>
    <div 
      style={{
        ...styles.progressFill,
        width: `${Math.min((value / max) * 100, 100)}%`
      }}
    />
  </div>
);

// Video Player Component
const VideoPlayer = ({ videoKey, onClose, theme }) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const loadVideo = async () => {
      console.log('Attempting to load video for key:', videoKey);
      const url = await mindMirrorBackend.getVideo(auth.currentUser, videoKey);
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
      const videoElement = videoRef.current;
      if (videoElement && videoElement.src) {
        console.log('Revoking video URL:', videoElement.src);
        URL.revokeObjectURL(videoElement.src);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [videoKey, onClose]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent(theme)} onClick={(e) => e.stopPropagation()}>
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
          style={styles.closeButton(theme)} 
          aria-label="Close video player"
          tabIndex="0"
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
          <div style={styles.emptyState(theme)}>Video not found or failed to load. Please try again.</div>
        )}
      </div>
    </div>
  );
};

// Video Recorder Component
const VideoRecorder = ({ onRecordingComplete, onError, theme }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const recordedChunks = useRef([]);
  const rawRecordingTime = useRef(0);

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
    console.log('recordingTime updated to:', recordingTime);
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
          const savedKey = await mindMirrorBackend.saveVideo(auth.currentUser, key, blob, thumbnail);
          if (savedKey) {
            console.log('Video saved with key:', savedKey);
            if (onRecordingComplete) {
              onRecordingComplete(savedKey, formatTime(rawRecordingTime.current));
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
      rawRecordingTime.current = 0;
      setRecordingTime(0);
      setProcessing(false);
      
      timerRef.current = setInterval(() => {
        rawRecordingTime.current += 1;
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
          rawRecordingTime.current += 1;
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
      console.log('Stopping recording with final duration:', recordingTime, 'Raw duration:', rawRecordingTime.current);
      if (onRecordingComplete) {
        onRecordingComplete(`video-${Date.now()}`, formatTime(rawRecordingTime.current));
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
    <div style={styles.card(theme)}>
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
            style={{...styles.button(theme), ...styles.primaryButton(theme)}}
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
              style={{...styles.button(theme), backgroundColor: '#f59e0b', color: 'white'}}
              className="button"
              aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={stopRecording}
              style={{...styles.button(theme), ...styles.dangerButton(theme)}}
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
const EntryForm = ({ videoKey, videoDuration, onEntrySaved, onError, theme }) => {
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
      const entry = await mindMirrorBackend.saveEntry(auth.currentUser, {
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
    <div style={styles.card(theme)}>
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
        <label style={styles.label(theme)}>Entry Title *</label>
        <input
          type="text"
          placeholder="e.g., Daily Practice, Interview Prep..."
          style={styles.input(theme)}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-required="true"
        />
      </div>

      <div style={styles.inputGroup}>
        <label style={styles.label(theme)}>Tags (comma separated)</label>
        <input
          type="text"
          placeholder="e.g., pronunciation, confidence, daily"
          style={styles.input(theme)}
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      {videoDuration && (
        <div style={styles.inputGroup}>
          <label style={styles.label(theme)}>Video Duration</label>
          <input
            type="text"
            value={videoDuration}
            style={{ ...styles.input(theme), backgroundColor: theme === 'dark' ? '#4b5563' : '#f3f4f6', cursor: 'not-allowed' }}
            readOnly
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !title.trim()}
        style={{...styles.button(theme), ...styles.gradientButton(theme), width: '100%'}}
        className="button"
        aria-label="Save entry"
      >
        {loading ? "Saving..." : "Save Entry"}
      </button>
    </div>
  );
};

// Preferences Modal Component
const PreferencesModal = ({ onClose, theme, setTheme }) => {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent(theme)} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onClose} 
          style={styles.closeButton(theme)} 
          aria-label="Close preferences modal"
          tabIndex="0"
        >
          <X size={20} />
        </button>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: theme === 'dark' ? '#e5e7eb' : '#1f2937' }}>Preferences</h2>
        <div style={styles.inputGroup}>
          <label style={styles.label(theme)}>Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            style={styles.input(theme)}
            aria-label="Select theme"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>
  );
};

// Main MindMirror Component
const MindMirrorApp = ({ user, onClose }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [videoKey, setVideoKey] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const accountRef = useRef(null);
  const navigate = useNavigate();
  const [theme, setTheme] = useState('light');

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
    if (user) {
      try {
        const data = await mindMirrorBackend.getEntries(user);
        setEntries(data);
        console.log('Entries fetched for user:', user.uid, data);
      } catch (error) {
        console.error("Error fetching entries for user:", user?.uid, error);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      mindMirrorBackend.initialize(user).then(fetchEntries);
    }
  }, [refreshTrigger, fetchEntries, user]);

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
    if (user) {
      try {
        await mindMirrorBackend.deleteEntry(user, entryId);
        setRefreshTrigger(prev => prev + 1);
      } catch (error) {
        console.error("Error deleting entry for user:", user?.uid, error);
      }
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

  const handleLogout = async () => {
    try {
      console.log('Attempting to sign out:', auth.currentUser);
      await signOut(auth);
      console.log('Sign out successful, navigating to /login');
      navigate('/login');
    } catch (error) {
      console.error("Error logging out:", error);
      // Fallback navigation in case signOut fails
      navigate('/login');
    }
  };

  const handlePreferences = () => {
    console.log("Opening Preferences modal");
    setAccountOpen(false);
    setPreferencesOpen(true);
  };

  // Close popout when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setAccountOpen(false);
      }
    };
    if (accountOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [accountOpen]);

  const renderTabContent = () => {
    if (!user) return <div style={styles.card(theme)}>Please log in to access this page.</div>;

    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <div style={styles.statsGrid}>
              <div style={styles.statCard(theme)}>
                <div>
                  <div style={styles.statNumber(theme)}>{stats.totalEntries}</div>
                  <div style={styles.statLabel(theme)}>Total Entries</div>
                </div>
                <Video color="#2563eb" size={24} />
              </div>
              <div style={styles.statCard(theme)}>
                <div>
                  <div style={styles.statNumber(theme)}>{Math.round(stats.totalMinutes * 10) / 10}m</div>
                  <div style={styles.statLabel(theme)}>Practice Time</div>
                </div>
                <Clock color="#10b981" size={24} />
              </div>
              <div style={styles.statCard(theme)}>
                <div>
                  <div style={styles.statNumber(theme)}>{stats.currentStreak}</div>
                  <div style={styles.statLabel(theme)}>Day Streak</div>
                </div>
                <Award color="#f59e0b" size={24} />
              </div>
              <div style={styles.statCard(theme)}>
                <div>
                  <div style={styles.statNumber(theme)}>{stats.weeklyProgress}/{stats.weeklyGoal}</div>
                  <div style={styles.statLabel(theme)}>Weekly Goal</div>
                  <ProgressBar value={stats.weeklyProgress} max={stats.weeklyGoal} theme={theme} />
                </div>
                <Target color="#8b5cf6" size={24} />
              </div>
            </div>

            <div style={styles.card(theme)}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                Recent Entries
              </h3>
              {entries.length === 0 ? (
                <div style={styles.emptyState(theme)}>
                  <Video size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No entries yet. Start practicing!</p>
                </div>
              ) : (
                <div style={styles.entriesGrid}>
                  {entries.slice(0, 3).map(entry => (
                    <div key={entry._id} style={styles.entryCard(theme)}>
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
                            e.preventDefault();
                            handleDeleteEntry(entry._id);
                          }}
                          style={styles.deleteButton}
                          className="delete-button"
                          aria-label={`Delete entry ${entry.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={styles.entryContent(theme)}>
                        <h4 style={styles.entryTitle(theme)}>{entry.title}</h4>
                        <div style={styles.entryMeta(theme)}>
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
                            <span key={tag} style={styles.tag(theme)}>#{tag}</span>
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
              theme={theme}
            />
            <EntryForm
              videoKey={videoKey}
              videoDuration={videoDuration}
              onEntrySaved={handleEntrySaved}
              onError={(error) => console.error(error)}
              theme={theme}
            />
          </>
        );

      case 'entries':
        return (
          <>
            <div style={styles.card(theme)}>
              <div style={styles.searchContainer}>
                <div style={styles.searchInput}>
                  <input
                    type="text"
                    placeholder="Search entries..."
                    style={styles.input(theme)}
                    className="input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search entries"
                  />
                </div>
              </div>

              {allTags.length > 0 && (
                <div>
                  <label style={styles.label(theme)}>Filter by tags:</label>
                  <div style={styles.tagContainer}>
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        style={{
                          ...styles.tag(theme),
                          backgroundColor: selectedTags.includes(tag) ? '#2563eb' : (theme === 'dark' ? '#1e293b' : '#e5e7eb'),
                          color: selectedTags.includes(tag) ? 'white' : (theme === 'dark' ? '#93c5fd' : '#374151'),
                          cursor: 'pointer',
                          border: 'none'
                        }}
                        onClick={() => toggleTag(tag)}
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
                <div style={{ ...styles.card(theme), ...styles.emptyState(theme), gridColumn: '1 / -1' }}>
                  <Search size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p>No entries found. Try adjusting your search or filters.</p>
                </div>
              ) : (
                filteredEntries.map(entry => (
                  <div key={entry._id} style={styles.entryCard(theme)} className="entry-card">
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
                    <div style={styles.entryContent(theme)}>
                      <h4 style={styles.entryTitle(theme)}>{entry.title}</h4>
                      <div style={styles.entryMeta(theme)}>
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
                          <span key={tag} style={styles.tag(theme)}>#{tag}</span>
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
            <div style={styles.card(theme)}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Target color="#2563eb" size={20} />
                Progress Overview
              </h3>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Weekly Goal Progress</span>
                  <span style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>
                    {stats.weeklyProgress}/{stats.weeklyGoal} entries
                  </span>
                </div>
                <ProgressBar value={stats.weeklyProgress} max={stats.weeklyGoal} theme={theme} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>{stats.totalEntries}</div>
                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>Total Entries</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>{stats.currentStreak}</div>
                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280' }}>Day Streak</div>
                </div>
              </div>
            </div>

            <div style={styles.card(theme)}>
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
                        <span style={styles.tag(theme)}>#{tag}</span>
                        <div style={{ 
                          flex: 1,
                          height: '8px',
                          backgroundColor: theme === 'dark' ? '#4b5563' : '#e5e7eb',
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
                      <span style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontWeight: '500' }}>
                        {count} {count === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={styles.card(theme)}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Practice Insights</h3>
              <p style={{ color: theme === 'dark' ? '#9ca3af' : '#6b7280', marginBottom: '1.5rem' }}>Your speaking practice journey</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: theme === 'dark' ? '#4b5563' : '#faf5ff', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{Math.round(stats.totalMinutes)}</div>
                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontWeight: '500' }}>Total Minutes Practiced</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: theme === 'dark' ? '#4b5563' : '#fff7ed', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ea580c' }}>
                    {entries.length > 0 ? Math.round((stats.totalMinutes / stats.totalEntries) * 10) / 10 : 0}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontWeight: '500' }}>Average Entry Length (min)</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: theme === 'dark' ? '#4b5563' : '#fef2f2', borderRadius: '8px' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#dc2626' }}>{allTags.length}</div>
                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#9ca3af' : '#6b7280', fontWeight: '500' }}>Different Practice Areas</div>
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
    <div style={styles.container(theme)}>
      <div style={styles.maxWidth}>
        <div style={styles.header(theme)}>
          <div>
            <h1 style={styles.title(theme)}>MindMirror</h1>
            <p style={styles.subtitle(theme)}>Practice, Record, and Improve Your Speaking Skills</p>
          </div>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1001, gap: '0.5rem' }}>
              <div ref={accountRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => {
                    console.log('Account button clicked, toggling to:', !accountOpen);
                    setAccountOpen(!accountOpen);
                  }}
                  style={{ ...styles.button(theme), ...styles.accountButton(theme), cursor: 'pointer' }}
                  aria-label="Open account menu"
                  tabIndex="0"
                >
                  <User size={16} /> {user.displayName || user.email || 'User'}
                </button>
                <div style={{ ...styles.accountPopout(theme), ...(accountOpen && styles.accountPopoutActive), zIndex: 1002 }}>
                  <div style={styles.popoutItem(theme)} onClick={handlePreferences}>Preferences</div>
                </div>
              </div>
              <button
                onClick={() => {
                  console.log('Logout button clicked');
                  handleLogout();
                }}
                style={{ ...styles.button(theme), ...styles.logoutButton(theme), cursor: 'pointer' }}
                aria-label="Log out"
                tabIndex="0"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
          {/* Optional decorative element */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: theme === 'dark' ? 'radial-gradient(circle at 20% 30%, rgba(37,99,235,0.1) 0%, transparent 70%)' : 'radial-gradient(circle at 20% 30%, rgba(37,99,235,0.05) 0%, transparent 70%)',
            zIndex: 1
          }} />
        </div>

        <div style={styles.tabContainer(theme)}>
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
                ...(activeTab === tab.id ? styles.activeTab(theme) : styles.inactiveTab(theme))
              }}
              aria-label={`Switch to ${tab.label} tab`}
              disabled={!user}
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
            theme={theme}
          />
        )}
        {preferencesOpen && <PreferencesModal onClose={() => setPreferencesOpen(false)} theme={theme} setTheme={setTheme} />}
      </div>
    </div>
  );
};

export default MindMirrorApp;