import { useState } from "react";
import VideoRecorder from "./VideoRecorder";
import JournalForm from "./JournalForm";
import JournalViewer from "./JournalViewer";

function App() {
  const [videoKey, setVideoKey] = useState(null);
  const [refreshEntries, setRefreshEntries] = useState(false);

  return (
    <div className="App" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>MindMirror - Video Journal</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Record Your Entry</h2>
        <VideoRecorder onRecordingComplete={setVideoKey} />
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Add Journal Details</h2>
        <JournalForm videoKey={videoKey} onEntrySaved={() => setRefreshEntries(prev => !prev)} />
      </section>

      <section>
        <h2>View Entries</h2>
        <JournalViewer refreshTrigger={refreshEntries} />
      </section>
    </div>
  );
}

export default App;
