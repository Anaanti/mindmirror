import React, { useState } from "react";
import VideoRecorder from "./VideoRecorder";
import JournalForm from "./JournalForm";

function App() {
  const [videoBlobURL, setVideoBlobURL] = useState(null);

  return (
    <div className="App" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>MindMirror - Video Journal</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Record Your Entry</h2>
        <VideoRecorder onRecordingComplete={setVideoBlobURL} />
      </section>

      <section>
        <h2>Add Journal Details</h2>
        <JournalForm videoUrl={videoBlobURL} />
      </section>
    </div>
  );
}

export default App;
