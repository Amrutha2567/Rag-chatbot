import React, { useState, useCallback } from "react";
import IngestPanel from "./components/IngestPanel";
import VideoCards from "./components/VideoCards";
import ChatPanel from "./components/ChatPanel";
import "./App.css";

export default function App() {
  const [videos, setVideos] = useState(null);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState("");

  const handleIngest = useCallback(async (youtubeUrl, instagramUrl) => {
    setIngesting(true);
    setError("");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: youtubeUrl, instagram_url: instagramUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Ingest failed");
      }
      const data = await res.json();
      setVideos({ a: data.video_a, b: data.video_b });
    } catch (e) {
      setError(e.message);
    } finally {
      setIngesting(false);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎬 Video RAG Analyser</h1>
        <p>Compare YouTube vs Instagram — powered by Claude + ChromaDB</p>
      </header>

      <main className="app-main">
        {!videos ? (
          <IngestPanel onIngest={handleIngest} ingesting={ingesting} error={error} />
        ) : (
          <div className="workspace">
            <VideoCards videoA={videos.a} videoB={videos.b} />
            <ChatPanel />
            <button className="reset-btn" onClick={() => setVideos(null)}>
              ↩ Analyse New Videos
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
