# 🎬 Video RAG Analyser

A full-stack RAG chatbot that ingests YouTube and Instagram Reel metadata + transcripts, embeds them into ChromaDB, and lets creators ask natural-language questions — with streamed, cited responses powered by Claude.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  IngestPanel → VideoCards (metadata) + ChatPanel (SSE)  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                          │
│  POST /api/ingest ──► YouTube Service (yt-dlp + YT API) │
│                   ──► Instagram Service (yt-dlp)         │
│                   ──► Vector Store (chunk + embed)       │
│                                                          │
│  POST /api/chat/stream ──► RAG Service                   │
│                        ──► ChromaDB similarity_search    │
│                        ──► LangChain + Claude (stream)   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              ChromaDB (local persistence)                │
│  Collection: video_transcripts                           │
│  Embedding: all-MiniLM-L6-v2 (free, local, 384-dim)     │
│  Tagged per chunk: video_id (A|B), platform, creator    │
└─────────────────────────────────────────────────────────┘
```

---

## Stack Choices & Reasoning

| Component | Choice | Why |
|-----------|--------|-----|
| LLM | Claude 3.5 Sonnet | Best reasoning/cost ratio. Outperforms GPT-4o on analysis tasks at lower cost |
| Embeddings | `all-MiniLM-L6-v2` | Free, runs locally, 384-dim, fast. No API cost vs OpenAI ada-002 ($0.10/1M tokens) |
| Vector DB | ChromaDB | Zero infra cost, persistent, no cloud dependency. Swap to Qdrant/Pinecone for scale |
| Backend | FastAPI | Async-native, SSE support, fastest Python framework |
| Transcript | `youtube-transcript-api` + `yt-dlp` | Free, no quota. yt-dlp handles Instagram captions |
| Orchestration | LangChain | Standard RAG chain, memory management, easy swapping of components |

---

## Setup

### 1. Clone & configure

```bash
git clone <your-repo>
cd rag-chatbot
cp backend/.env.example backend/.env
# Add your ANTHROPIC_API_KEY to backend/.env
```

### 2. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm start   # runs on :3000, proxies /api to :8000
```

---

## Features

- ✅ YouTube transcript via `youtube-transcript-api` (free, no quota)
- ✅ Instagram Reel metadata + caption via `yt-dlp`
- ✅ Engagement rate computed dynamically: `(likes + comments) / views × 100`
- ✅ Chunked (500 tokens, 80 overlap) + embedded locally (no API cost)
- ✅ Every chunk tagged with `video_id` for source citation
- ✅ Streamed responses via SSE
- ✅ 6-turn memory window per session
- ✅ Source citations with relevance scores + hover tooltips
- ✅ Suggested questions chips

---

## Cost & Scalability Analysis

### Current cost per analysis session (1 creator, 2 videos)

| Item | Cost |
|------|------|
| Embeddings (MiniLM, local) | $0.00 |
| Transcript fetch (yt-dlp) | $0.00 |
| Claude 3.5 Sonnet (avg 5 questions × ~800 tokens) | ~$0.012 |
| ChromaDB (local) | $0.00 |
| **Total per session** | **~$0.012** |

### At 1,000 creators/day → ~$12/day (~$360/month)

### Scaling to 1,000 creators/day

**Bottlenecks at scale and solutions:**

1. **ChromaDB → Qdrant Cloud or Pinecone**
   - ChromaDB is single-node. At 1K creators/day, switch to Qdrant (self-hosted on k8s) or Pinecone Serverless (~$0.08/1M vectors)

2. **Embedding at scale → batch async workers**
   - Replace sync embedding with Celery + Redis workers. Ingest jobs go to queue, frontend polls status.

3. **Instagram rate limiting**
   - yt-dlp hits limits at scale. Solution: rotating proxies + session pools, or switch to RapidAPI Instagram scraper (~$0.001/request)

4. **LLM cost at scale**
   - 1K sessions × 5 questions × 800 tokens = 4M tokens/day = ~$12/day with Sonnet
   - If cost is critical: route simple factual queries (engagement rate, creator name) to Claude Haiku (~10× cheaper), only use Sonnet for reasoning queries

5. **Transcript fetching latency**
   - Cache transcripts in Redis with video URL as key (TTL 24h). Avoid re-fetching same video.

### Best alternative architecture at true scale (10K+/day):

```
API Gateway → FastAPI workers (autoscaled)
           → Redis cache (transcript + metadata)
           → Celery workers (embed + ingest)
           → Qdrant Cloud (vector search)
           → Claude via Anthropic Batch API (50% cost reduction)
```

---

## Example Questions

- *"Why did Video A get more engagement than Video B?"*
- *"What's the engagement rate of each?"*
- *"Compare the hooks in the first 5 seconds."*
- *"Who's the creator of Video B and what's their follower count?"*
- *"Suggest improvements for B based on what worked in A."*

---

## Chunk Size Reasoning

- **500 tokens, 80 overlap**: Balances semantic coherence vs retrieval precision
- Too large (1000+): Retrieved chunks may mix topics, reducing answer quality
- Too small (100-): Loses context, fragments sentences
- 80-token overlap: Ensures boundary chunks don't lose meaning

---

## What breaks at 10,000 users

1. ChromaDB memory limits (~10M vectors = ~40GB RAM)
2. Single FastAPI process → need gunicorn workers or k8s pods
3. yt-dlp Instagram blocks after ~500 requests/hour per IP
4. No persistent chat memory across server restarts (need Redis or DB)
