import { useRef, useState } from "react";
import { saveVideoBlob } from "./videoDB";
const VideoRecorder = ({ onRecordingComplete }) => {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedVideoURL, setRecordedVideoURL] = useState(null);
  const recordedChunks = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
        onRecordingComplete(url);
      }

      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  return (
    <div>
      <h3>Video Recorder</h3>
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
          <h4>Preview:</h4>
          <video src={recordedVideoURL} controls style={{ width: "400px" }} />
        </div>
      )}
    </div>
  );
};

export default VideoRecorder;
