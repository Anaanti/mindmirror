
import VideoRecorder from "./VideoRecorder";
import JournalForm from "./JournalForm";

function App() {
  return (
    <div className="App" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>MindMirror - Video Journal</h1>
      
      <section style={{ marginBottom: "2rem" }}>
        <h2> Record Your Entry</h2>
        <VideoRecorder />
      </section>

      <section>
        <h2> Add Journal Details</h2>
        <JournalForm />
      </section>
    </div>
  );
}

export default App;
