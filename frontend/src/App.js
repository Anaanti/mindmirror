import { useState, useRef, useEffect } from "react";
import { Play, Pause, Trash2, Video, Plus, Calendar, Tag, Clock, Mic, MicOff } from "lucide-react";

// VideoDB functions (keeping your existing logic)
const DB_NAME = 'mindmirror-videos';
const STORE_NAME = 'videos';

const dbPromise = new Promise((resolve) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const saveVideoBlob = async (key, blob) => {
  const db = await dbPromise;
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  await store.put({ id: key, blob });
};

const getVideoBlob = async (key) => {
  const db = await dbPromise;
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const result = await store.get(key);
  return result?.blob || null;
};

const deleteVideoBlob = async (key) => {
  const db = await dbPromise;
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  await store.delete(key);
};

// Styles object
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 50%, #faf5ff 100%)',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  maxWidth: {
    maxWidth: '1024px',
    margin: '0 auto'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '1.5rem',
    marginBottom: '1.5rem'
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
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '1rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#1f2937'
  },
  videoContainer: {
    position: 'relative',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '1rem'
  },
  video: {
    width: '100%',
    height: '16rem',
    objectFit: 'cover'
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
    gap: '1rem'
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
    fontSize: '1rem'
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
    color: 'white',
    width: '100%'
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s ease'
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
  entryCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    transition: 'box-shadow 0.2s ease'
  },
  entryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  entryTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '0.5rem'
  },
  entryMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    fontSize: '0.875rem',
    color: '#6b7280'
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  deleteButton: {
    color: '#ef4444',
    background: 'none',
    border: 'none',
    padding: '0.5rem',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '1rem'
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
    padding: '3rem 0',
    color: '#6b7280'
  },
  toast: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '500',
    zIndex: 1000
  },
  successToast: {
    backgroundColor: '#10b981'
  },
  errorToast: {
    backgroundColor: '#ef4444'
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '4px solid #2563eb',
    borderTop: '4px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  badge: {
    backgroundColor: '#f3e8ff',
    color: '#7c3aed',
    padding: '0.25rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.875rem',
    fontWeight: '500'
  }
};

// Add CSS animations
const cssAnimations = `
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.button:hover {
  transform: translateY(-1px);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.delete-button:hover {
  background-color: #fef2f2;
  color: #dc2626;
}

.entry-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}
`;

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      ...styles.toast,
      ...(type === 'success' ? styles.successToast : styles.errorToast)
    }}>
      {message}
    </div>
  );
};

// Video Recorder Component
const VideoRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedVideoURL, setRecordedVideoURL] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordedChunks = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      videoRef.current.srcObject = stream;

      mediaRecorderRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunks.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedVideoURL(url);

        const key = `video-${Date.now()}`;
        await saveVideoBlob(key, blob);

        if (onRecordingComplete) {
          onRecordingComplete(key);
        }

        stream.getTracks().forEach((track) => track.stop());
        clearInterval(timerRef.current);
      };

      mediaRecorderRef.current.start();
      setRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <Video color="#2563eb" size={24} />
        <h2 style={styles.sectionTitle}>Record Your Entry</h2>
      </div>
      
      <div style={styles.videoContainer}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          style={styles.video}
        />
        {recording && (
          <div style={styles.recordingBadge}>
            <div style={styles.pulse}></div>
            REC {formatTime(recordingTime)}
          </div>
        )}
      </div>

      <div style={styles.buttonContainer}>
        {!recording ? (
          <button
            onClick={startRecording}
            style={{...styles.button, ...styles.primaryButton}}
          >
            <Mic size={20} />
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{...styles.button, ...styles.dangerButton}}
          >
            <MicOff size={20} />
            Stop Recording
          </button>
        )}
      </div>

      {recordedVideoURL && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            Preview:
          </h4>
          <video 
            src={recordedVideoURL} 
            controls 
            style={{...styles.video, height: '16rem'}}
          />
        </div>
      )}
    </div>
  );
};

// Journal Form Component
const JournalForm = ({ videoKey, onEntrySaved }) => {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);

    const tagArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const res = await fetch("http://localhost:5000/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          tags: tagArray,
          videoUrl: videoKey || "no-video",
        }),
      });

      if (res.ok) {
        setTitle("");
        setTags("");
        if (onEntrySaved) onEntrySaved();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <Plus color="#10b981" size={24} />
        <h2 style={styles.sectionTitle}>Add Journal Details</h2>
      </div>

      <div>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Journal Title</label>
          <input
            type="text"
            placeholder="What's on your mind today?"
            style={styles.input}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            requirced
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Tags</label>
          <input
            type="text"
            placeholder="mood, thoughts, daily (comma separated)"
            style={styles.input}
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !title.trim()}
          style={{...styles.button, ...styles.gradientButton}}
          className="button"
        >
          {loading ? (
            <div style={styles.spinner}></div>
          ) : (
            <>
              <Plus size={20} />
              Save Entry
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Journal Viewer Component
const JournalViewer = ({ refreshTrigger }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:5000/api/entries");
        const data = await res.json();

        const entriesWithVideos = await Promise.all(
          data.map(async (entry) => {
            const blob = await getVideoBlob(entry.videoUrl);
            const videoUrl = blob ? URL.createObjectURL(blob) : null;
            return { ...entry, videoBlobUrl: videoUrl };
          })
        );

        setEntries(entriesWithVideos);
      } catch (err) {
        console.error("Error fetching entries:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, [refreshTrigger]);

  const handleDelete = async (entryId, videoKey) => {
    try {
      const res = await fetch(`http://localhost:5000/api/entries/${entryId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (videoKey && videoKey !== "no-video") {
          await deleteVideoBlob(videoKey);
        }
        setEntries((prev) => prev.filter((e) => e._id !== entryId));
      }
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '8rem'}}>
          <div style={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <Calendar color="#7c3aed" size={24} />
        <h2 style={styles.sectionTitle}>Your Journal Entries</h2>
        <span style={styles.badge}>
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={styles.emptyState}>
          <Video size={48} style={{margin: '0 auto 1rem'}} />
          <p style={{fontSize: '1.125rem', marginBottom: '0.5rem'}}>No entries yet</p>
          <p>Start by recording your first video journal!</p>
        </div>
      ) : (
        <div>
          {entries.map((entry) => (
            <div key={entry._id} style={styles.entryCard} className="entry-card">
              <div style={styles.entryHeader}>
                <div style={{flex: 1}}>
                  <h3 style={styles.entryTitle}>{entry.title}</h3>
                  
                  <div style={styles.entryMeta}>
                    <div style={styles.metaItem}>
                      <Clock size={14} />
                      {formatDate(entry.createdAt)}
                    </div>
                    
                    {entry.tags.length > 0 && (
                      <div style={styles.metaItem}>
                        <Tag size={14} />
                        {entry.tags.join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(entry._id, entry.videoUrl)}
                  style={styles.deleteButton}
                  className="delete-button"
                  title="Delete entry"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              {entry.videoBlobUrl ? (
                <video 
                  src={entry.videoBlobUrl} 
                  controls 
                  style={{...styles.video, height: '16rem'}}
                />
              ) : (
                <div style={{
                  ...styles.video,
                  height: '16rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280'
                }}>
                  <div style={{textAlign: 'center'}}>
                    <Video size={32} style={{margin: '0 auto 0.5rem'}} />
                    <p>Video not available</p>
                  </div>
                </div>
              )}

              {entry.tags.length > 0 && (
                <div style={styles.tagContainer}>
                  {entry.tags.map((tag, index) => (
                    <span key={index} style={styles.tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main App Component
function App() {
  const [videoKey, setVideoKey] = useState(null);
  const [refreshEntries, setRefreshEntries] = useState(false);
  const [toast, setToast] = useState(null);

  const handleEntrySaved = () => {
    setRefreshEntries(prev => !prev);
    setVideoKey(null);
    setToast({ message: "Journal entry saved successfully!", type: "success" });
  };

  const handleRecordingComplete = (key) => {
    setVideoKey(key);
    setToast({ message: "Video recorded successfully!", type: "success" });
  };

  return (
    <>
      <style>{cssAnimations}</style>
      <div style={styles.container}>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
        
        <div style={styles.maxWidth}>
          <div style={styles.header}>
            <h1 style={styles.title}>MindMirror</h1>
            <p style={styles.subtitle}>Your personal video journal companion</p>
          </div>

          <VideoRecorder onRecordingComplete={handleRecordingComplete} />
          <JournalForm videoKey={videoKey} onEntrySaved={handleEntrySaved} />
          <JournalViewer refreshTrigger={refreshEntries} />
        </div>
      </div>
    </>
  );
}

export default App;