import React, { useEffect, useState } from "react";
import { getVideoBlob } from "./videoDB";

const JournalViewer = () => {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/entries");
        const data = await res.json();

        // For each entry, fetch the blob from IndexedDB
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
      }
    };

    fetchEntries();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Your Journal Entries</h2>
      {entries.length === 0 ? (
        <p>No entries found.</p>
      ) : (
        entries.map((entry) => (
          <div key={entry._id} className="mb-6 border-b pb-4">
            <h3 className="text-lg font-semibold">{entry.title}</h3>
            <p className="text-sm text-gray-600">Tags: {entry.tags.join(", ")}</p>
            <p className="text-sm text-gray-500">Created: {new Date(entry.createdAt).toLocaleString()}</p>
            {entry.videoBlobUrl ? (
              <video src={entry.videoBlobUrl} controls style={{ width: "400px", marginTop: "10px" }} />
            ) : (
              <p className="text-red-500 mt-2">Video not found (may be cleared or inaccessible)</p>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default JournalViewer;
