import { useAuth } from "./AuthContext";
import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Trash2, Video, Plus, Calendar, Tag, Clock, Mic, MicOff } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
const mockBackend = {
  entries: [],
  videos: new Map(),
  
  saveEntry: async (entry) => {
    const newEntry = {
      ...entry,
      _id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    mockBackend.entries.unshift(newEntry);
    return newEntry;
  },
  
  getEntries: async () => {
    return [...mockBackend.entries];
  },
  
  deleteEntry: async (id) => {
    const index = mockBackend.entries.findIndex(e => e._id === id);
    if (index !== -1) {
      const entry = mockBackend.entries[index];
      if (entry.videoUrl && entry.videoUrl !== "no-video") {
        mockBackend.videos.delete(entry.videoUrl);
      }
      mockBackend.entries.splice(index, 1);
      return true;
    }
    return false;
  },
  
  saveVideo: async (key, blob) => {
    const url = URL.createObjectURL(blob);
    mockBackend.videos.set(key, { blob, url });
    return url;
  },
  
  getVideo: async (key) => {
    const video = mockBackend.videos.get(key);
    return video ? video.url : null;
  }
};

// Styles object - Made more compact
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 50%, #faf5ff 100%)',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  maxWidth: {
    maxWidth: '680px', // Reduced from 1024px
    margin: '0 auto'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    padding: '1rem', // Reduced from 1.5rem
    marginBottom: '1rem' // Reduced from 1.5rem
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem' // Reduced from 2rem
  },
  title: {
    fontSize: '2rem', // Reduced from 2.5rem
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #2563eb, #9333ea)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: '0.25rem'
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '1rem' // Reduced from 1.1rem
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px', // Reduced from 12px
    marginBottom: '0.75rem' // Reduced from 1rem
  },
  sectionTitle: {
    fontSize: '1.125rem', // Reduced from 1.25rem
    fontWeight: '600',
    color: '#1f2937'
  },
  videoContainer: {
    position: 'relative',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '0.75rem' // Reduced from 1rem
  },
  video: {
    width: '100%',
    height: '12rem', // Reduced from 16rem
    objectFit: 'cover'
  },
  recordingBadge: {
    position: 'absolute',
    top: '0.75rem',
    left: '0.75rem',
    backgroundColor: '#ef4444',
    color: 'white',
    padding: '0.375rem 0.5rem', // Reduced padding
    borderRadius: '16px',
    fontSize: '0.75rem', // Reduced from 0.875rem
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem'
  },
  pulse: {
    width: '6px', // Reduced from 8px
    height: '6px',
    backgroundColor: 'white',
    borderRadius: '50%',
    animation: 'pulse 1s infinite'
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.75rem' // Reduced from 1rem
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem', // Reduced from 0.5rem
    padding: '0.625rem 1.25rem', // Reduced padding
    borderRadius: '6px',
    border: 'none',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '0.875rem' // Reduced from 1rem
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
    padding: '0.625rem 0.75rem', // Reduced padding
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.875rem', // Reduced from 1rem
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box'
  },
  inputGroup: {
    marginBottom: '0.75rem' // Reduced from 1rem
  },
  label: {
    display: 'block',
    fontSize: '0.75rem', // Reduced from 0.875rem
    fontWeight: '500',
    color: '#374151',
    marginBottom: '0.375rem'
  },
  entryCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '1rem', // Reduced from 1.5rem
    marginBottom: '1rem', // Reduced from 1.5rem
    transition: 'box-shadow 0.2s ease'
  },
  entryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.75rem' // Reduced from 1rem
  },
  entryTitle: {
    fontSize: '1rem', // Reduced from 1.125rem
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '0.375rem'
  },
  entryMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem', // Reduced from 1rem
    fontSize: '0.75rem', // Reduced from 0.875rem
    color: '#6b7280',
    flexWrap: 'wrap'
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
    padding: '0.375rem', // Reduced from 0.5rem
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem', // Reduced from 0.5rem
    marginTop: '0.75rem' // Reduced from 1rem
  },
  tag: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '0.125rem 0.375rem', // Reduced padding
    borderRadius: '10px',
    fontSize: '0.6875rem', // Reduced from 0.75rem
    fontWeight: '500'
  },
  emptyState: {
    textAlign: 'center',
    padding: '2rem 0', // Reduced from 3rem
    color: '#6b7280'
  },
  toast: {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    padding: '0.625rem 1.25rem', // Reduced padding
    borderRadius: '6px',
    color: 'white',
    fontWeight: '500',
    zIndex: 1000,
    maxWidth: '280px', // Reduced from 300px
    wordWrap: 'break-word',
    fontSize: '0.875rem'
  },
  successToast: {
    backgroundColor: '#10b981'
  },
  errorToast: {
    backgroundColor: '#ef4444'
  },
  spinner: {
    width: '16px', // Reduced from 20px
    height: '16px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingSpinner: {
    width: '28px', // Reduced from 32px
    height: '28px',
    border: '3px solid #2563eb',
    borderTop: '3px solid transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  badge: {
    backgroundColor: '#f3e8ff',
    color: '#7c3aed',
    padding: '0.125rem 0.375rem', // Reduced padding
    borderRadius: '10px',
    fontSize: '0.75rem', // Reduced from 0.875rem
    fontWeight: '500'
  }
};

// CSS animations
const cssAnimations = `
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.delete-button:hover {
  background-color: #fef2f2;
  color: #dc2626;
}

.entry-card:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
`;

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    if (!onClose) return;
    
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
const VideoRecorder = ({ onRecordingComplete, onError }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const recordedChunks = useRef([]);
  
  const [recording, setRecording] = useState(false);
  const [recordedVideoURL, setRecordedVideoURL] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processing, setProcessing] = useState(false);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (recordedVideoURL) {
      URL.revokeObjectURL(recordedVideoURL);
    }
  }, [recordedVideoURL]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

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

      const options = { mimeType: 'video/webm' };
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      recordedChunks.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        try {
          const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedVideoURL(url);
          
          const key = `video-${Date.now()}`;
          await mockBackend.saveVideo(key, blob);
          
          if (onRecordingComplete) {
            onRecordingComplete(key);
          }
        } catch (error) {
          console.error("Error processing video:", error);
          if (onError) {
            onError("Failed to process video recording");
          }
        } finally {
          cleanup();
          setProcessing(false);
        }
      };

      mediaRecorderRef.current.start(1000); // Record in 1s chunks
      setRecording(true);
      setRecordingTime(0);
      setProcessing(false);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error("Error starting recording:", err);
      setProcessing(false);
      if (onError) {
        onError("Failed to start recording. Please check camera permissions.");
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      setProcessing(true);
      mediaRecorderRef.current.stop();
      setRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
        <Video color="#2563eb" size={20} />
        <h2 style={styles.sectionTitle}>Record Your Entry</h2>
      </div>
      
      <div style={styles.videoContainer}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline
          style={styles.video}
        />
        {recording && (
          <div style={styles.recordingBadge}>
            <div style={styles.pulse}></div>
            REC {formatTime(recordingTime)}
          </div>
        )}
        {processing && (
          <div style={{
            ...styles.recordingBadge,
            backgroundColor: '#f59e0b'
          }}>
            <div style={styles.spinner}></div>
            Processing...
          </div>
        )}
      </div>

      <div style={styles.buttonContainer}>
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={processing}
            style={{...styles.button, ...styles.primaryButton}}
            className="button"
          >
            <Mic size={16} />
            Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            style={{...styles.button, ...styles.dangerButton}}
            className="button"
          >
            <MicOff size={16} />
            Stop Recording
          </button>
        )}
      </div>

      {recordedVideoURL && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
          <h4 style={{ fontSize: '0.75rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>
            Preview:
          </h4>
          <video 
            src={recordedVideoURL} 
            controls 
            playsInline
            style={{...styles.video, height: '10rem'}}
          />
        </div>
      )}
    </div>
  );
};

// Journal Form Component
const JournalForm = ({ videoKey, onEntrySaved, onError }) => {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      if (onError) onError("Please enter a title for your journal entry");
      return;
    }

    setLoading(true);

    try {
      const tagArray = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      await mockBackend.saveEntry({
        title: title.trim(),
        tags: tagArray,
        videoUrl: videoKey || "no-video",
      });

      setTitle("");
      setTags("");
      
      if (onEntrySaved) {
        onEntrySaved();
      }
    } catch (err) {
      console.error("Error saving entry:", err);
      if (onError) {
        onError("Failed to save journal entry. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <Plus color="#10b981" size={20} />
        <h2 style={styles.sectionTitle}>Add Journal Details</h2>
        {videoKey && videoKey !== "no-video" && (
          <span style={{
            ...styles.badge,
            backgroundColor: '#dcfce7',
            color: '#16a34a'
          }}>
            Video Ready
          </span>
        )}
      </div>

      <div>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Journal Title *</label>
          <input
            type="text"
            placeholder="What's on your mind today?"
            style={styles.input}
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
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
              <Plus size={16} />
              Save Entry
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Journal Viewer Component
const JournalViewer = ({ refreshTrigger, onError }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mockBackend.getEntries();

      const entriesWithVideos = await Promise.all(
        data.map(async (entry) => {
          if (entry.videoUrl && entry.videoUrl !== "no-video") {
            try {
              const videoUrl = await mockBackend.getVideo(entry.videoUrl);
              return { ...entry, videoBlobUrl: videoUrl, hasVideo: !!videoUrl };
            } catch (error) {
              console.error(`Error loading video for entry ${entry._id}:`, error);
              return { ...entry, videoBlobUrl: null, hasVideo: false };
            }
          }
          return { ...entry, videoBlobUrl: null, hasVideo: false };
        })
      );

      setEntries(entriesWithVideos);
    } catch (err) {
      console.error("Error fetching entries:", err);
      if (onError) {
        onError("Failed to load journal entries");
      }
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchEntries();
  }, [refreshTrigger, fetchEntries]);

  const handleDelete = async (entryId, videoKey) => {
    try {
      const success = await mockBackend.deleteEntry(entryId);
      
      if (success) {
        setEntries((prev) => prev.filter((e) => e._id !== entryId));
      } else {
        throw new Error("Failed to delete entry");
      }
    } catch (err) {
      console.error("Error deleting entry:", err);
      if (onError) {
        onError("Failed to delete entry");
      }
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
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '6rem'}}>
          <div style={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <Calendar color="#7c3aed" size={20} />
        <h2 style={styles.sectionTitle}>Your Journal Entries</h2>
        <span style={styles.badge}>
          {entries.length}
        </span>
      </div>

      {entries.length === 0 ? (
        <div style={styles.emptyState}>
          <Video size={40} style={{margin: '0 auto 0.75rem'}} />
          <p style={{fontSize: '1rem', marginBottom: '0.375rem'}}>No entries yet</p>
          <p style={{fontSize: '0.875rem'}}>Start by recording your first video journal!</p>
        </div>
      ) : (
        <div>
          {entries.map((entry) => (
            <div key={entry._id} style={styles.entryCard} className="entry-card">
              <div style={styles.entryHeader}>
                <div style={{flex: 1, minWidth: 0}}>
                  <h3 style={styles.entryTitle}>{entry.title}</h3>
                  
                  <div style={styles.entryMeta}>
                    <div style={styles.metaItem}>
                      <Clock size={12} />
                      {formatDate(entry.createdAt)}
                    </div>
                    
                    {entry.tags.length > 0 && (
                      <div style={styles.metaItem}>
                        <Tag size={12} />
                        {entry.tags.join(", ")}
                      </div>
                    )}

                    {entry.hasVideo && (
                      <div style={styles.metaItem}>
                        <Video size={12} />
                        Has Video
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
                  <Trash2 size={16} />
                </button>
              </div>

              {entry.videoBlobUrl && entry.hasVideo ? (
                <video 
                  src={entry.videoBlobUrl} 
                  controls 
                  playsInline
                  style={{...styles.video, height: '12rem'}}
                />
              ) : entry.videoUrl !== "no-video" ? (
                <div style={{
                  ...styles.video,
                  height: '12rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  border: '2px dashed #d97706'
                }}>
                  <div style={{textAlign: 'center'}}>
                    <Video size={28} style={{margin: '0 auto 0.375rem'}} />
                    <p style={{fontSize: '0.875rem'}}>Video unavailable</p>
                  </div>
                </div>
              ) : (
                <div style={{
                  ...styles.video,
                  height: '12rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f3f4f6',
                  color: '#6b7280'
                }}>
                  <div style={{textAlign: 'center'}}>
                    <Tag size={28} style={{margin: '0 auto 0.375rem'}} />
                    <p style={{fontSize: '0.875rem'}}>Text-only entry</p>
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
  const [refreshEntries, setRefreshEntries] = useState(0);
  const [toast, setToast] = useState(null);
  const { user } = useAuth(); // ✅ THIS is how user is defined

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  const handleEntrySaved = useCallback(() => {
    setRefreshEntries(prev => prev + 1);
    setVideoKey(null);
    showToast("Journal entry saved successfully!", "success");
  }, [showToast]);

  const handleRecordingComplete = useCallback((key) => {
    setVideoKey(key);
    showToast("Video recorded successfully!", "success");
  }, [showToast]);

  const handleError = useCallback((message) => {
    showToast(message, "error");
  }, [showToast]);

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

          {!user ? (
            <div style={{ textAlign: 'center', marginTop: '4rem' }}>
              <h2 style={{ fontSize: '1.5rem', color: '#374151' }}>You have been logged out.</h2>
              <p style={{ color: '#6b7280' }}>Please log in again to continue using MindMirror.</p>
            </div>
          ) : (
            <div style={styles.maxWidth}>
              <div style={styles.header}>
                <div style={{
                  marginBottom: '0.75rem',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  padding: '0.625rem 0.875rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h1 style={styles.title}>MindMirror</h1>
                  <button 
                    onClick={handleLogout}
                    style={{
                      backgroundColor: '#f87171',
                      color: 'white',
                      border: 'none',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '5px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Logout
                  </button>
                </div>
                <p style={styles.subtitle}>Your personal video journal companion</p>
              </div>

              <VideoRecorder 
                onRecordingComplete={handleRecordingComplete} 
                onError={handleError}
              />
              <JournalForm 
                videoKey={videoKey} 
                onEntrySaved={handleEntrySaved}
                onError={handleError}
              />
              <JournalViewer 
                refreshTrigger={refreshEntries}
                onError={handleError}
              />
            </div>
          )}
        </div>
      </>
    );
}

export default App;
