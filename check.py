# api.py
import os
import re
import json
from urllib import request, error
from flask import Flask, jsonify, request as flask_request, send_from_directory
from flask_cors import CORS
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import FakeEmbeddings
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

PERSIST_DIR = "./dochelper_chroma_testsearchfiles"

# AI configuration (read from environment variables)
AI_ENDPOINT = os.getenv("AI_CHAT_ENDPOINT", "https://aichat.maxsolo.co.uk/api/chat")
AI_BEARER_TOKEN = os.getenv("AI_CHAT_BEARER_TOKEN", "").strip()
AI_API_KEY = os.getenv("AI_CHAT_API_KEY", "").strip()
AI_HTTP_USER_AGENT = os.getenv(
    "AI_HTTP_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
).strip()

# 1. Use FakeEmbeddings to remain consistent with study.py
embeddings = FakeEmbeddings(size=1536)

# 2. Load the previously created Chroma DB (created by study.py)
vectordb = Chroma(
    persist_directory=PERSIST_DIR,
    embedding_function=embeddings,
)


def load_docs_from_testsearchfiles() -> list:
    """Load documents from testsearchfiles directory."""
    base_path = "./testsearchfiles"
    patterns = ["**/*.py", "**/*.txt", "**/*.md", "**/*.ino", "**/*.css", "**/*.html", "**/*.jsx", "**/*.js"]
    docs = []
    
    for pattern in patterns:
        loader = DirectoryLoader(
            base_path,
            glob=pattern,
            loader_cls=TextLoader,
            recursive=True,
            silent_errors=True,
            show_progress=False,
        )
        part = loader.load()
        docs.extend(part)
    
    return docs


app = Flask(__name__)
CORS(app)  # Enable CORS support


def _json_dumps(payload: dict) -> bytes:
    """Convert dict to JSON bytes."""
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _build_system_prompt(context: str) -> str:
    """Build the AI system prompt (used by the legacy endpoint).

    The prompt instructs the model to answer only from the provided context. If
    the information is insufficient, the model should state that it does not know.
    Responses should be concise and in English. Add a 'References' section listing
    source file names at the end. MUST English
    """
    return (
        "You are an internal document assistant. Answer ONLY using the provided Context."
        " If the information is insufficient, state clearly that you don't know.\n"
        "Please answer in English and keep responses concise.\n"
        "At the end include a 'References' section listing source file names.\n\n"
        f"Context:\n{context}"
    )


def _build_rag_prompt_english(
    original_query: str,
    cleaned_keywords: list,
    results: list
) -> str:
    """Build English RAG prompt, including document evaluation requirements."""
    from pathlib import Path
    
    context_parts = []
    for i, r in enumerate(results, 1):
        source_name = Path(r['source']).name
        context_parts.append(
            f"Document {i} (File: {source_name})\n"
            f"Preview: {r['preview']}\n"
            f"Full content (truncated):\n{r['full_content'][:1200]}..."
        )
    context = "\n\n".join(context_parts)

    # System prompt
    system = (
        "You are an internal document assistant. You must answer in English.\n"
        "You will be given:\n"
        "1. The original user query.\n"
        "2. A cleaned keyword version of the query.\n"
        "3. A set of retrieved documents (Document 1, 2, 3).\n\n"
        "Your task:\n"
        "1. First, write a concise but clear answer to the original query, using ONLY the information in the provided documents.\n"
        "   - If the information is insufficient, state clearly that you don't know.\n"
        "2. Then, write a short evaluation for each document (Document 1, 2, 3):\n"
        "   - State how relevant the document is to the query (High/Medium/Low relevance).\n"
        "   - Mention key evidence (e.g., keywords, code snippets, settings) that support the answer.\n"
        "3. Do NOT reference document numbers explicitly in the main answer; keep the main answer natural.\n"
        "4. Keep the whole response clear and well‑structured.\n"
    )

    # User prompt
    user = (
        f"Original query: {original_query}\n"
        f"Cleaned keywords: {', '.join(cleaned_keywords) if cleaned_keywords else '(none)'}\n\n"
        f"Retrieved documents (each already prefixed with 'Document X'):\n"
        f"{context}"
    )

    return f"{system}\n\n{user}"


def _call_ai_endpoint(prompt: str, context_or_system: str, use_english_prompt: bool = False) -> str:
    """Call AI endpoint to generate a response.
    
    Args:
        prompt: User query
        context_or_system: If use_english_prompt=False, treated as context (will call _build_system_prompt)
                           If use_english_prompt=True, treated as full system prompt
        use_english_prompt: Whether to use the English RAG prompt (if True, context_or_system is treated as the full system prompt)
    """
    if use_english_prompt:
        system_prompt = context_or_system
    else:
        system_prompt = _build_system_prompt(context_or_system)
    
    payload = {
        "role": "user",
        "prompt": prompt,
        "system": system_prompt,
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": AI_HTTP_USER_AGENT,
    }
    if AI_BEARER_TOKEN:
        headers["Authorization"] = f"Bearer {AI_BEARER_TOKEN}"
    if AI_API_KEY:
        headers["X-API-Key"] = AI_API_KEY

    req = request.Request(
        AI_ENDPOINT,
        data=_json_dumps(payload),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore") if exc.fp else str(exc)
        raise RuntimeError(f"AI endpoint HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(f"AI endpoint request failed: {exc}") from exc

    try:
        data = json.loads(body)
        if isinstance(data, dict):
            answer = data.get("answer") or data.get("result") or data.get("response") or data.get("text") or body
            return str(answer).strip()
    except json.JSONDecodeError:
        pass
    return body.strip()


def parse_ai_rag_answer(content: str) -> dict:
    """Parse AI RAG answer into a main summary and per-document evaluations.

    Expected format:
        Main answer text...

        Evaluation:
        Document 1: ...
        Document 2: ...
        Document 3: ...

    Returns a dict with keys "summary" and "evaluations" where evaluations is
    a list of {"doc": <n>, "text": <evaluation text>}.
    """

    # Handle possible JSON wrapper like {"content": "..."}
    raw_content = content.strip()
    if raw_content.startswith("{") and raw_content.endswith("}"):
        try:
            parsed_json = json.loads(raw_content)
            if isinstance(parsed_json, dict) and "content" in parsed_json:
                raw_content = parsed_json["content"]
        except json.JSONDecodeError:
            pass
    
    lines = raw_content.strip().split("\n")
    
    # Find the start of the Evaluation section (accepts "Evaluation:" or similar)
    eval_start = -1
    for i, line in enumerate(lines):
        stripped = line.strip().lower()
        if "evaluation" in stripped and (":" in stripped or stripped.startswith("evaluation")):
            eval_start = i
            break
    
    # If no Evaluation: header found, try to locate 'Document 1:' directly
    if eval_start == -1:
        for i, line in enumerate(lines):
            if line.strip().startswith("Document 1:"):
                eval_start = i
                break
    
    if eval_start == -1:
        return {
            "summary": raw_content.strip(),
            "evaluations": []
        }
    
    main_lines = lines[:eval_start]
    summary = "\n".join(line for line in main_lines).strip()
    
    eval_lines = lines[eval_start:]
    evaluations = []
    current_doc = None
    current_text = []
    
    for line in eval_lines:
        stripped = line.strip()
        
        if stripped.startswith("Document 1:"):
            if current_doc is not None and current_text:
                evaluations.append({"doc": current_doc, "text": " ".join(current_text)})
            current_doc = 1
            current_text = [stripped]
        elif stripped.startswith("Document 2:"):
            if current_doc is not None and current_text:
                evaluations.append({"doc": current_doc, "text": " ".join(current_text)})
            current_doc = 2
            current_text = [stripped]
        elif stripped.startswith("Document 3:"):
            if current_doc is not None and current_text:
                evaluations.append({"doc": current_doc, "text": " ".join(current_text)})
            current_doc = 3
            current_text = [stripped]
        elif current_doc is not None and stripped:
            current_text.append(stripped)
    
    if current_doc is not None and current_text:
        evaluations.append({"doc": current_doc, "text": " ".join(current_text)})
    
    return {
        "summary": summary,
        "evaluations": evaluations
    }


def extract_tech_keywords(text: str) -> list:
    """ 
    Rule-based extraction of technical keywords. Filters out common noise 
    and returns a list of keywords, e.g. ['GPIO_NUM_2', 'ESP32', 'PWM']. 
    """ 
    # General-purpose keyword extraction for multi-purpose search.
    # Extract word-like tokens, remove common stop words, ignore short tokens
    # and numeric-only tokens. Preserve token order and return up to 8 tokens.
    import re

    stop_words = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "with", "by", "of", "is", "are", "was", "were", "be", "been",
        "like", "know", "how", "use", "can", "will", "would", "should",
        "this", "that", "these", "those", "what", "where", "when", "who",
        "why", "because", "if", "then", "else", "also", "just", "very",
        "get", "set", "has", "have", "do", "does", "did", "make", "take",
        "want", "need", "try", "put", "call", "see", "help",
    }

    tokens = re.findall(r"\b[A-Za-z0-9_]+\b", text)
    clean = []
    seen = set()
    for t in tokens:
        t2 = t.strip()
        if len(t2) <= 2:
            continue
        lt = t2.lower()
        if lt in seen or lt in stop_words:
            continue
        if t2.isdigit():
            continue
        seen.add(lt)
        clean.append(t2)

    return clean[:8]


def smart_query_preprocess(raw_query: str) -> dict:
    """
    Split user input into:
    - original: the original query
    - keywords: rule-extracted technical keywords
    - cleaned: a denoised query string assembled from keywords
    """
    original = raw_query.strip()
    keywords = extract_tech_keywords(original)
    if keywords:
        cleaned = " ".join(keywords)
    else:
        cleaned = original  # 

    # console debug
    print("=== Query Preprocess ===")
    print(f"Original: {original}")
    print(f"Keywords: {keywords}")
    print(f"Cleaned : {cleaned}")
    print("========================")

    return {
        "original": original,
        "keywords": keywords,
        "cleaned": cleaned,
    }


def stable_keyword_search(raw_query: str, k: int = None):
    """
    Stable keyword search (no vector similarity) with denoising.

    Args:
        raw_query: original user input
        k: number of top sources to return (None = return all matches)

    Returns:
        results: list of matched sources
        debug_info: metadata about the search and preprocessing
    """
    qp = smart_query_preprocess(raw_query)
    query = qp["cleaned"]  # 

    # Use general-purpose keywords extracted by `smart_query_preprocess`.
    # If none were extracted, fall back to tokenizing the cleaned query.
    keywords = qp.get("keywords", [])

    if not keywords:
        import re
        tokens = re.findall(r"\b[A-Za-z0-9_]+\b", query)
        # local stop words (same list as used in extractor)
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "with", "by", "of", "is", "are", "was", "were", "be", "been",
            "like", "know", "how", "use", "can", "will", "would", "should",
            "this", "that", "these", "those", "what", "where", "when", "who",
            "why", "because", "if", "then", "else", "also", "just", "very",
            "get", "set", "has", "have", "do", "does", "did", "make", "take",
            "want", "need", "try", "put", "call", "see", "help",
        }
        kws = [t.lower() for t in tokens if len(t) > 2 and not t.isdigit() and t.lower() not in stop_words]
        seen = set()
        dedup = []
        for w in kws:
            if w in seen:
                continue
            seen.add(w)
            dedup.append(w)
        keywords = dedup

    # Fallback: if no keywords detected, try extracting snake_case tokens
    if not keywords:
        snake_matches = re.findall(r"\b[a-z0-9_]+_[a-z0-9_]+\b", query, re.IGNORECASE)
        if snake_matches:
            keywords = [m.lower() for m in snake_matches]
        else:
            # final fallback: use the whole cleaned query if it's reasonably short
            qtrim = query.strip().lower()
            if len(qtrim) > 2:
                keywords = [qtrim]

    if not keywords:
        return [], {
            "query_preprocess": qp,
            "keywords_for_match": [],
            "total_docs": 0,
            "total_sources": 0,
        }
    
    # Retrieve all documents from the vector DB
    try:
        all_docs_result = vectordb.get()
        all_doc_ids = all_docs_result.get('ids', [])
        all_metadatas = all_docs_result.get('metadatas', [])
        all_contents = all_docs_result.get('documents', [])
    except Exception as e:
        return [], {
            "query_preprocess": qp,
            "keywords_for_match": keywords,
            "error": str(e),
        }
    
    # Group document contents by source
    from pathlib import Path
    source_contents = {}
    for doc_id, metadata, content in zip(all_doc_ids, all_metadatas, all_contents):
        raw_source = metadata.get('source', 'unknown')
        try:
            normalized = str(Path(raw_source).resolve())
        except Exception:
            normalized = raw_source
        source_contents.setdefault(normalized, []).append(content)
    
    # Scoring (optional: weight important keywords)
    # Dynamic weights: more specific technical tokens get higher weight
    keyword_weights = {}
    for kw in keywords:
        if '_' in kw and 'gpio' in kw:  # GPIO_NUM_2 like pin identifiers
            keyword_weights[kw] = 10
        elif kw in ['gpio_num_2', 'gpio_num']:
            keyword_weights[kw] = 10
        elif kw in ['esp32', 'webserver', 'aiagent']:
            keyword_weights[kw] = 3
        else:
            keyword_weights[kw] = 1
    
    source_scores = []
    q_lower = query.strip().lower()
    for source, contents in source_contents.items():
        combined_content = ' '.join(contents).lower()
        # Compute weighted score
        keyword_freq = sum(
            combined_content.count(kw) * keyword_weights.get(kw, 1)
            for kw in keywords
        )
        exact = 1 if q_lower and q_lower in combined_content else 0
        source_scores.append((source, keyword_freq, contents, exact))

    # Sort by exact match first, then by keyword frequency
    source_scores.sort(key=lambda x: (-x[3], -x[1], x[0]))
    # Debug: display keyword scores per file
    print("\n=== Keyword scores per file ===")
    for source, freq, _, exact in source_scores[:min(10, len(source_scores))]:
        from pathlib import Path
        print(f"{Path(source).name:40s} -> freq={freq:3d}, exact={exact}")
    print("=== End keyword scores ===")

    # Filter out sources with zero keyword frequency (first-pass noise)
    filtered_scores = [t for t in source_scores if t[1] > 0]

    # If nothing remains after filtering, return empty results and debug info
    if not filtered_scores:
        return [], {
            "query_preprocess": qp,
            "keywords_for_match": keywords,
            "total_docs": len(all_doc_ids),
            "total_sources": len(source_contents),
            "total_candidates": len(source_scores),
        }

    # Apply k slicing (None means return all)
    slice_scores = filtered_scores if k is None else filtered_scores[:k]

    # Assemble result objects
    results = []
    for source, freq, contents, exact in slice_scores:
        results.append({
            "source": source,
            "preview": contents[0][:200],
            "full_content": '\n\n---\n\n'.join(contents),
            "keyword_freq": freq,
            "exact": bool(exact),
        })

    debug_info = {
        "query_preprocess": qp,
        "keywords_for_match": keywords,
        "total_docs": len(all_doc_ids),
        "total_sources": len(source_contents),
        "selected_sources": [
            {
                "source": r["source"],
                "keyword_freq": r["keyword_freq"],
                "exact": r["exact"],
            } for r in results
        ],
    }

    # console debug
    print("=== Stable Keyword Search ===")
    print(f"Match keywords : {keywords}")
    print(f"Total docs     : {len(all_doc_ids)}")
    print(f"Total sources  : {len(source_contents)}")
    print("Selected:")
    for s in debug_info["selected_sources"]:
        print(f" - {s['source']} (freq={s['keyword_freq']}, exact={s['exact']})")
    print("=============================")

    return results, debug_info


@app.route("/check/<path:query>", methods=["GET"])
def check(query: str):
    """
    Search endpoint: returns matching sources and debug info.

    Example: GET http://127.0.0.1:8009/check/GPIO_NUM

    Returns the list of matched sources and preprocessing/debug metadata.
    """
    results, debug_info = stable_keyword_search(query, k=None)

    # If we're returning unlimited results, filter out sources that have
    # no keyword frequency (freq==0) since they are not relevant.
    filtered_results = [r for r in results if r.get("keyword_freq", 0) > 0]

    formatted_results = []
    for i, r in enumerate(filtered_results, 1):
        formatted_results.append({
            "rank": i,
            "source": r["source"],
            "preview": r["preview"],
            "keyword_freq": r.get("keyword_freq", 0),
            "exact_phrase_match": r["exact"],
        })

    return jsonify({
        "query": query,
        "preprocess": debug_info.get("query_preprocess", {}),
        "keywords_for_match": debug_info.get("keywords_for_match", []),
        "stats": {
            "total_docs": debug_info.get("total_docs", 0),
            "total_sources": debug_info.get("total_sources", 0),
        },
        # selected_sources reflects the filtered list (only items with freq>0)
        "selected_sources": [
            {
                "source": r["source"],
                "keyword_freq": r.get("keyword_freq", 0),
                "exact": r["exact"],
            } for r in filtered_results
        ],
        "top_k": len(formatted_results),
        "results": formatted_results,
    })


@app.route("/ask/<path:query>", methods=["GET"])
def ask(query: str):
    """
    RAG endpoint: perform retrieval, then generate an English answer and per-document evaluations.

    Example: GET http://127.0.0.1:8009/ask/GPIO_NUM%20is%20what

    Response structure:
        - answer: raw AI response (full string)
        - answer_summary: parsed main answer
        - document_evaluations: structured per-document evaluations
        - document_details: original search metadata (rank, filename, preview, keyword_freq, exact_match)
    """
    results, debug_info = stable_keyword_search(query, k=None)  # return all matching documents

    if not results:
        return jsonify({
            "query": query,
            "preprocess": debug_info.get("query_preprocess", {}),
            "answer": "No relevant documents found.",
            "answer_summary": "No relevant documents found.",
            "sources": [],
            "document_evaluations": [],
            "document_details": [],
            "error": "no_documents_found",
        })

    # Prepare the English RAG prompt
    qp = debug_info["query_preprocess"]
    original = qp["original"]
    keywords = qp["keywords"]

    full_prompt = _build_rag_prompt_english(original, keywords, results)

    try:
        answer = _call_ai_endpoint(
            "Please follow the instructions above and answer the query.",
            full_prompt,
            use_english_prompt=True
        )
        error_flag = None
    except Exception as e:
        answer = f"AI call failed: {str(e)}"
        error_flag = "ai_call_failed"

    # Parse AI response into main answer and document evaluations
    parsed = parse_ai_rag_answer(answer)
    summary = parsed["summary"]
    evaluations = parsed["evaluations"]

    from pathlib import Path
    sources = [Path(r["source"]).name for r in results]

    # Map evaluations to corresponding document metadata
    structured_evals = []
    for ev in evaluations:
        doc_idx = ev["doc"] - 1  # 0-based index
        if doc_idx < 0 or doc_idx >= len(results):
            continue
        
        doc = results[doc_idx]
        structured_evals.append({
            "document_number": ev["doc"],
            "filename": Path(doc["source"]).name,
            "file_path": doc["source"],
            "rank": doc_idx + 1,
            "keyword_freq": doc["keyword_freq"],
            "preview": doc["preview"],
            "evaluation_text": ev["text"],
        })

    return jsonify({
        "query": query,
        "preprocess": qp,
        "answer": answer,  # 
        "answer_summary": summary,  # 
        "document_evaluations": structured_evals,  # 
        "sources": sources,
        "document_details": [
            {
                "rank": i + 1,
                "filename": Path(r["source"]).name,
                "file_path": r["source"],
                "preview": r["preview"],
                "keyword_freq": r["keyword_freq"],
                "exact_match": r["exact"],
            } for i, r in enumerate(results)
        ],
        "context_preview": full_prompt[:500] + "..." if len(full_prompt) > 500 else full_prompt,
        "error": error_flag,
    })


@app.route("/ask", methods=["POST"])
def ask_post():
    """
    RAG endpoint (POST version): Receive JSON body
    
    Request body:
    {
      "query": "User Question"
    }
    
    Response: Same structure as GET /ask/<query>
    """
    try:
        data = flask_request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                "error": "invalid_request",
                "message": "Request body must contain 'query' field"
            }), 400
        
        query = data['query'].strip()
        if not query:
            return jsonify({
                "error": "empty_query",
                "message": "Query cannot be empty"
            }), 400
        
        # Call the existing search logic (return all matching documents)
        results, debug_info = stable_keyword_search(query, k=None)

        if not results:
            return jsonify({
                "query": query,
                "preprocess": debug_info.get("query_preprocess", {}),
                "answer": "No relevant documents found.",
                "answer_summary": "No relevant documents found.",
                "sources": [],
                "document_evaluations": [],
                "document_details": [],
                "error": "no_documents_found",
            })

        # Prepare the English RAG prompt
        qp = debug_info["query_preprocess"]
        original = qp["original"]
        keywords = qp["keywords"]

        # Build the English prompt
        full_prompt = _build_rag_prompt_english(original, keywords, results)

        # Call the AI (using the English prompt)
        try:
            answer = _call_ai_endpoint(
                "Please follow the instructions above and answer the query.",
                full_prompt,
                use_english_prompt=True
            )
            error_flag = None
        except Exception as e:
            answer = f"AI call failed: {str(e)}"
            error_flag = "ai_call_failed"

        # Parse AI response into main answer and document evaluations
        parsed = parse_ai_rag_answer(answer)
        summary = parsed["summary"]
        evaluations = parsed["evaluations"]

        from pathlib import Path
        sources = [Path(r["source"]).name for r in results]

        # Map evaluations to corresponding document metadata
        structured_evals = []
        for ev in evaluations:
            doc_idx = ev["doc"] - 1  # 0-based index
            if doc_idx < 0 or doc_idx >= len(results):
                continue
            
            doc = results[doc_idx]
            structured_evals.append({
                "document_number": ev["doc"],
                "filename": Path(doc["source"]).name,
                "file_path": doc["source"],
                "rank": doc_idx + 1,
                "keyword_freq": doc["keyword_freq"],
                "preview": doc["preview"],
                "evaluation_text": ev["text"],
            })

        return jsonify({
            "query": query,
            "preprocess": qp,
            "answer": answer,
            "answer_summary": summary,
            "document_evaluations": structured_evals,
            "sources": sources,
            "document_details": [
                {
                    "rank": i + 1,
                    "filename": Path(r["source"]).name,
                    "file_path": r["source"],
                    "preview": r["preview"],
                    "keyword_freq": r["keyword_freq"],
                    "exact_match": r["exact"],
                } for i, r in enumerate(results)
            ],
            "context_preview": full_prompt[:500] + "..." if len(full_prompt) > 500 else full_prompt,
            "error": error_flag,
        })
    
    except Exception as e:
        return jsonify({
            "error": "server_error",
            "message": str(e)
        }), 500


@app.route('/', methods=['GET'])
def serve_index():
    """Serve the frontend index.html at the application root."""
    print("Serving index from:A")
    base_dir = os.path.dirname(__file__) or '.'
    return send_from_directory(base_dir, 'index.html')


@app.route('/index.html', methods=['GET'])
def serve_index_alias():
    """Alias for index.html"""
    print("Serving index from:B")
    base_dir = os.path.dirname(__file__) or '.'
    return send_from_directory(base_dir, 'index.html')


@app.route('/study', methods=['POST', 'GET'])
def study():
    """
    Index and persist documents from testsearchfiles directory.
    
    This endpoint performs the same operations as study.py:
    1. Load all documents from testsearchfiles
    2. Split documents into chunks
    3. Create embeddings
    4. Build and persist Chroma vector database
    
    Request: GET or POST /study
    Response: JSON with status and statistics
    """
    try:
        # Step 1: Load documents
        print("[/study] Loading documents from testsearchfiles...")
        docs = load_docs_from_testsearchfiles()
        if not docs:
            return jsonify({
                "success": False,
                "error": "no_documents_found",
                "message": "No documents loaded from testsearchfiles directory"
            }), 400
        
        print(f"[/study] Loaded {len(docs)} documents")
        
        # Step 2: Split documents into chunks
        print("[/study] Splitting documents into chunks...")
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
        )
        chunks = splitter.split_documents(docs)
        print(f"[/study] Created {len(chunks)} chunks")
        
        # Step 3: Create and persist Chroma DB
        print("[/study] Building vector database...")
        global vectordb
        vectordb = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=PERSIST_DIR,
        )
        vectordb.persist()
        print(f"[/study] Vector database persisted to: {PERSIST_DIR}")
        
        return jsonify({
            "success": True,
            "message": "Vector database created and persisted successfully",
            "statistics": {
                "total_documents": len(docs),
                "total_chunks": len(chunks),
                "persist_directory": PERSIST_DIR,
                "embedding_dimension": 1536,
            }
        })
    
    except Exception as e:
        print(f"[/study] Error: {str(e)}")
        return jsonify({
            "success": False,
            "error": "build_failed",
            "message": str(e)
        }), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8009, debug=False)
