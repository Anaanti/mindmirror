import React, { useState } from "react";
import VideoRecorder from "./VideoRecorder";

const JournalForm = () => {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const tagArray = tags.split(",").map(tag => tag.trim()).filter(Boolean);

    try {
      const res = await fetch("http://localhost:5000/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          tags: tagArray,
          videoUrl: "local-only", // placeholder to indicate local storage
        }),
      });

      if (res.ok) {
        setMessage("Journal entry saved!");
        setTitle("");
        setTags("");
      } else {
        setMessage("Error saving entry.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Server error.");
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <h2 className="text-xl font-bold mb-2">Create Video Journal Entry</h2>
      
      <VideoRecorder />

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Journal Title"
          className="w-full p-2 border rounded"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Tags (comma separated)"
          className="w-full p-2 border rounded"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />

        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Save Entry
        </button>
      </form>

      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
    </div>
  );
};

export default JournalForm;
