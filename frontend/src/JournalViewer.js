import { useEffect, useState } from "react";
import { getVideoBlob, deleteVideoBlob } from "./videoDB";


const JournalViewer = ({ refreshTrigger }) => {
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
  }, [refreshTrigger]);

const handleDelete = async (entryId, videoKey) => {
  try {
    console.log("Entry ID to delete:", entryId);
    console.log("Video key to delete:", videoKey); // ← ADD THIS LINE

    const res = await fetch(`http://localhost:5000/api/entries/${entryId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      if (videoKey && videoKey !== "no-video") {
        await deleteVideoBlob(videoKey);
        console.log("Deleted from IndexedDB:", videoKey); // ← CONFIRM THIS SHOWS UP
      }

      setEntries((prev) => prev.filter((e) => e._id !== entryId));
    } else {
      console.error("Failed to delete entry");
    }
  } catch (err) {
    console.error("Error deleting:", err);
  }
};

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
            <button
              onClick={() => handleDelete(entry._id, entry.videoUrl)}
              className="mt-2 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Delete Entry
            </button>

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
