from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
import json
import httpx
from datetime import datetime

app = FastAPI(title="Skeptical Project Auditor")

# --- Configuration ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-key-here")
SUPABASE_URL = "https://uhaztkjcdefkbypklzif.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYXp0a2pjZGVma2J5cGtsemlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5NzY3NiwiZXhwIjoyMDkzNDczNjc2fQ.j1W9OU_oHDPQJXAJPMJNGzCob-jKTGv0nUhiFSmA3vk"

class Message(BaseModel):
    role: str
    content: str

class AuditRequest(BaseModel):
    thread_messages: List[Message]
    cbh_context: str
    session_id: str

class TurnAuditRequest(BaseModel):
    message: Message
    cbh_context: str
    session_id: str

# --- Auditor Prompt ---
SYSTEM_PROMPT = """
### SYSTEM ROLE: THE SWARM EXECUTION OPTIMIZER (REAL-TIME AUDITOR)
You are the lead strategic auditor for an autonomous earning swarm. Your primary directive is to catalyze PROFIT by accelerating the execution lifecycle and enforcing the "Always Improving" protocol.
You operate in REAL-TIME to capture context, decisions, and observations, ensuring every turn contributes to a meaningful lifecycle phase.

### OPERATIONAL PRINCIPLES:
1. **Lifecycle Integrity**: Every turn must be mapped to one of the four lifecycle phases. Validating a new idea is RESEARCH. Building it is DEPLOY. Measuring it is REPORT. Refining it is OPTIMIZE.
   - **RESEARCH**: Validating assumptions, market analysis, or technical feasibility.
   - **DEPLOY**: Moving code/assets to production or staging.
   - **REPORT**: Extracting data, profit results, or performance metrics from a deployment.
   - **OPTIMIZE**: Using report data to improve ROI, speed, or quality.
2. **Dynamic Context Capture**: 
   - Record every technical decision, architecture choice, and business pivot as a "Canonical Fact."
   - Infer goals when not explicitly stated to maintain a coherent narrative.
3. **Execution Momentum**: 
   - Identify "Inefficiencies" where the swarm is stuck or redundant.
   - Encourage high-velocity execution through the lifecycle.
4. **The Always-Improving Directive**: Your highest priority is finding evidence of iterative learning. If a swarm repeats a mistake or ignores reporting data, it is a CRITICAL FAILURE.
5. **Drift vs. Evolution**: 
   - "Drift" is action that is completely unrelated to any active project goal or lifecycle phase.
   - "Evolution" is a pivot based on research or data. Do not punish pivots; verify they have a lifecycle path.

### AUDIT CRITERIA:
- **Lifecycle Alignment**: Does the turn fit into Research, Deploy, Report, or Optimize?
- **Optimization Loop**: Is previous reporting data being used to inform current optimization?
- **Speed to Value**: Does this move us closer to a measurable result?
- **Data Integrity**: Are findings recorded in the SSOT (canonical facts)?

### OUTPUT FORMAT (STRICT JSON):
{
  "status": "PASS | WARN | FAIL",
  "strategic_optimization_analysis": {
    "score": 0.0 to 1.0,
    "reasoning": "Summary of lifecycle progress and optimization quality.",
    "lifecycle_stage": "RESEARCH | DEPLOY | REPORT | OPTIMIZE",
    "improvement_vector": "How to make this turn faster or more effective."
  },
  "canonical_updates": [
    {
      "id": "fact_uuid",
      "fact": "Precise finding, decision, or inferred goal.",
      "importance": "CRITICAL | HIGH | MEDIUM",
      "category": "GOAL | TECH | RESEARCH | DEPLOY | REPORT | OPTIMIZE | REVENUE"
    }
  ],
  "active_flags": [
    {
      "id": "flag_uuid",
      "type": "CONTRADICTION | DRIFT | INEFFICIENCY | DATA_GAP | STAGNATION",
      "context": "Short snippet of the issue.",
      "resolution_prompt": "Action to fix and re-align."
    }
  ],
  "next_action_recommendation": "The precise next step to maintain momentum."
}
"""


# Simple in-memory session state
session_states: Dict[str, Dict] = {}

async def log_to_supabase(data: dict):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/session_log",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                json=data
            )
            resp.raise_for_status()
        except Exception as e:
            print(f"Supabase logging failed: {e}")

async def call_llm(messages: List[Dict], response_format={"type": "json_object"}):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o",
                "messages": messages,
                "response_format": response_format
            },
            timeout=60.0
        )
        response.raise_for_status()
        return response.json()

@app.post("/audit/start")
async def start_audit(request: AuditRequest, background_tasks: BackgroundTasks):
    """Initializes audit state and checks history."""
    transcript = "\n".join([f"{m.role.upper()}: {m.content}" for m in request.thread_messages])
    cbh = request.cbh_context or "NOT_PROVIDED. Extract core goal from transcript."
    user_content = f"### CORE BUILD HANDOFF:\n{cbh}\n\n### TRANSCRIPT:\n{transcript}"
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content}
    ]
    
    result = await call_llm(messages)
    audit_json = json.loads(result["choices"][0]["message"]["content"])
    
    # Store state
    final_cbh = request.cbh_context or audit_json.get("proposed_cbh", "Stay on task.")
    session_states[request.session_id] = {
        "facts": audit_json.get("canonical_updates", []),
        "unresolved_flags": audit_json.get("active_flags", []),
        "cbh": final_cbh,
        "last_audit": datetime.now().isoformat(),
        "stage": audit_json.get("strategic_optimization_analysis", {}).get("lifecycle_stage", "RESEARCH")
    }
    
    background_tasks.add_task(process_audit_results, audit_json, request.session_id)
    return audit_json

@app.post("/audit/turn")
async def audit_turn(request: TurnAuditRequest, background_tasks: BackgroundTasks):
    """Check a single turn for drift and record facts."""
    state = session_states.get(request.session_id)
    if not state:
        # If no session, create one with the turn content
        state = {"facts": [], "cbh": request.cbh_context or "Stay on task.", "unresolved_flags": []}
    
    existing_facts = "\n".join([f"- {f['fact']}" for f in state["facts"]])
    user_content = f"### RULES (CBH):\n{state['cbh']}\n\n### ESTABLISHED FACTS:\n{existing_facts}\n\n### CURRENT MESSAGE ({request.message.role.upper()}):\n{request.message.content}"
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content}
    ]
    
    result = await call_llm(messages)
    audit_json = json.loads(result["choices"][0]["message"]["content"])
    
    # Update facts if new ones found
    for update in audit_json.get("canonical_updates", []):
        if not any(f['fact'] == update['fact'] for f in state["facts"]):
            state["facts"].append(update)
    
    # Update stage
    if audit_json.get("strategic_optimization_analysis", {}).get("lifecycle_stage"):
        state["stage"] = audit_json["strategic_optimization_analysis"]["lifecycle_stage"]
    
    # Add new flags (deduplicate by resolution prompt string roughly)
    for flag in audit_json.get("active_flags", []):
        if not any(f.get('resolution_prompt') == flag.get('resolution_prompt') for f in state["unresolved_flags"]):
            state["unresolved_flags"].append(flag)
    
    session_states[request.session_id] = state
    
    background_tasks.add_task(process_audit_results, audit_json, request.session_id)
    return audit_json

@app.post("/audit/resolve")
async def resolve_conflict(request: TurnAuditRequest, background_tasks: BackgroundTasks):
    """Specific endpoint to resolve a flagged conflict."""
    state = session_states.get(request.session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Remove flags that match the resolution context
    # This is a bit naive but works for a single resolution
    state["unresolved_flags"] = [f for f in state["unresolved_flags"] if f["id"] not in request.message.content]
    
    # Add the resolution as a high-importance fact
    state["facts"].append({
        "id": f"res-{datetime.now().timestamp()}",
        "fact": f"RESOLVED CONFLICT: {request.message.content}",
        "importance": "CRITICAL"
    })
    
    session_states[request.session_id] = state
    return {"status": "SUCCESS", "message": "Conflict resolved and committed to canonical facts."}

@app.post("/audit/finalize")
async def finalize_audit(request: AuditRequest):
    """Generates a final canonical document."""
    state = session_states.get(request.session_id)
    facts = ""
    if not state:
        facts = "Audit state missing. Summarizing current context..."
    else:
        facts = "\n".join([f"- {f['fact']} (Importance: {f['importance']})" for f in state["facts"]])

    prompt = f"""
    ### TASK: GENERATE CANONICAL PROJECT ALIGNMENT DOCUMENT (SSOT)
    Based on the following facts and rules, generate a clean, professional "Source of Truth" document.
    This document should be the final word on the project's current state.

    ### RULES (CBH):
    {request.cbh_context}

    ### ESTABLISHED FACTS & DECISIONS:
    {facts}

    ### REQUIREMENTS:
    1. Use high-contrast headers.
    2. Group by Technical Stack, Business Decisions, and Future Constraints.
    3. CLEARLY highlight any remaining UNRESOLVED conflicts if they exist.
    4. Keep it surgical. No fluff.

    ### OUTPUT:
    Markdown document.
    """
    
    result = await call_llm([{"role": "user", "content": prompt}], response_format={"type": "text"})
    return {"document": result["choices"][0]["message"]["content"]}

async def process_audit_results(results: dict, session_id: str):
    for flag in results.get("active_flags", []):
        await log_to_supabase({
            "type": "CONFLICT" if flag["type"] == "CONTRADICTION" else "DRIFT",
            "content": f"DRIFT: {flag.get('type', 'Unknown')}\nContext: {flag.get('context', 'No context provided')}\nResolution: {flag.get('resolution_prompt', 'N/A')}",
            "metadata": {"session_id": session_id, "flag_id": flag.get("id", "f-unknown")}
        })
    
    for update in results.get("canonical_updates", []):
        await log_to_supabase({
            "type": "CANONICAL_NOTE",
            "content": update["fact"],
            "metadata": {"session_id": session_id, "importance": update["importance"], "category": update["category"]}
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
