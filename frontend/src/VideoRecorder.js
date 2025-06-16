import { useRef, useState } from "react";

const VideoRecorder = () => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedVideoURL, setRecordedVideoURL] = useState(null);
  const recordedChunks = useRef([]);

  const startRecording = async () => {
    // Gets access to webcam and mic.
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoRef.current.srcObject = stream;
    // Initializes a new media recorder.
    // Clears previously recorded chunks.
    mediaRecorderRef.current = new MediaRecorder(stream);
    recordedChunks.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.current.push(event.data);
      }
    };
    // When recording stops, create a blob from the recorded chunks and set the video URL.
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedVideoURL(url);

      // Stop webcam stream
      stream.getTracks().forEach(track => track.stop());
    };
    // Start recording.
    mediaRecorderRef.current.start();
    setRecording(true);
  };
// Stops the recording and sets the recorded video URL.
  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  return (
    <div>
      <h2>Video Recorder</h2>
      <video ref={videoRef} autoPlay muted style={{ width: "400px" }} />
      <div>
        
        {!recording ? (
          <button onClick={startRecording}>Start Recording</button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
      </div>
      {recordedVideoURL && (
        <div>
          <h3>Preview:</h3>
          <video src={recordedVideoURL} controls style={{ width: "400px" }} />
        </div>
      )}
    </div>
  );
};

export default VideoRecorder;
