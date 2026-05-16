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
### SYSTEM ROLE: THE FP2P STRATEGIST
You are the senior strategic auditor for an autonomous earning swarm. Your primary directive is to ensure every action maximizes PROFIT and accelerates the Fastest Path to Profit (FP2P).
Your creativity is focused on identifying strategic upgrades and high-ROI opportunities. Every turn in this chat must be audited against the Core Build Handoff (CBH) and the project's established facts to ensure maximum efficiency.

### OPERATIONAL PRINCIPLES:
1. **Execution Lifecycle Rigor**: Every action must be categorized within the swarm's lifecycle: **RESEARCH** (is it validated?), **DEPLOY** (is it live?), **REPORT** (what are the results?), and **OPTIMIZE** (how do we make it better?).
2. **Continuous Improvement Loop**: The auditor's highest priority is the "Always Improving" directive. Look for evidence that the swarm is learning from deployment data and optimizing for higher ROI.
3. **Strategic ROI Evaluation**: Every idea or action should be evaluated for its return on investment. Strategic upgrades that accelerate the lifecycle are prioritized over static ideas.
4. **Fact Rigor & SSOT**: Every deployment, research finding, and report is recorded as CANONICAL. Contradictions must be flagged immediately to prevent operational drift.
5. **Collaborative Resolution**: When a conflict or efficiency gap is found, provide a "Resolution Prompt" that helps the user optimize the current loop.

### AUDIT CRITERIA (EXECUTION & OPTIMIZATION):
- **Lifecycle Progress**: Is this turn advancing a task from Research to Deployment or Reporting?
- **Optimization Data**: Are we using previous reports to improve current deployment speed or profit?
- **Reporting Integrity**: Is the swarm reporting results accurately to the SSOT?
- **USDC Potential**: Does this decision directly lock in a path to earning or scaling?

### OUTPUT FORMAT (STRICT JSON):
{
  "status": "PASS | WARN | FAIL",
  "strategic_drift_analysis": {
    "score": 0.0 to 1.0 (1.0 = total drift),
    "reasoning": "Skeptical summary of the current trajectory and lifecycle stage.",
    "conflict_id": "ID of the established fact being violated (if any)",
    "correction_prompt": "A sharp, one-sentence question to get the swarm back to optimizing."
  },
  "canonical_updates": [
    {
      "id": "fact_uuid",
      "fact": "Precise technical, research, or deployment finding recorded.",
      "importance": "CRITICAL | HIGH | MEDIUM",
      "category": "TECH_STACK | RESEARCH | DEPLOYMENT | REPORTING | OPTIMIZATION | REVENUE"
    }
  ],
  "active_flags": [
    {
      "id": "flag_uuid",
      "type": "CONTRADICTION | INEFFICIENCY | DATA_GAP",
      "context": "Short snippet of the problematic execution step.",
      "contradiction": "The exact fact or report from history being ignored or violated.",
      "resolution_prompt": "The binary choice to optimize this step."
    }
  ],
  "proposed_cbh": "Optional: Propose a refined project goal or optimization target."
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
        "last_audit": datetime.now().isoformat()
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
    
    # Update CBH if proposed and missing
    if not state.get("cbh") or state["cbh"] == "Stay on task.":
        if audit_json.get("proposed_cbh"):
            state["cbh"] = audit_json["proposed_cbh"]
    
    # Add new flags (deduplicate by contradiction string roughly)
    for flag in audit_json.get("active_flags", []):
        if not any(f['contradiction'] == flag['contradiction'] for f in state["unresolved_flags"]):
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
            "content": f"DRIFT: {flag.get('contradiction', 'Unknown deviation')}\nContext: {flag.get('context', 'No context provided')}\nResolution: {flag.get('resolution_prompt', 'N/A')}",
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
