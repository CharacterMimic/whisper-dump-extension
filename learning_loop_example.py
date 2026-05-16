import psycopg2
import json
from datetime import datetime

# Centralized DB Configuration (matching the user's Supabase)
DB_URL = "postgresql://postgres:3ob04z1yZwONfQaL@db.uhaztkjcdefkbypklzif.supabase.co:5432/postgres"

def log_agent_action(agent_name, action_type, content, metadata=None):
    """
    Simulates an agent (e.g. Web3 Agent, Research Agent) logging to the unified session_log.
    """
    if metadata is None:
        metadata = {}
        
    metadata['agent'] = agent_name
    metadata['source'] = 'learning_loop_agent'
    
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO session_log (type, content, is_user_input, metadata)
            VALUES (%s, %s, %s, %s)
        """, (action_type, content, False, json.dumps(metadata)))
        
        conn.commit()
        cur.close()
        conn.close()
        print(f"[{agent_name}] Logged {action_type}: {content[:50]}...")
    except Exception as e:
        print(f"Error logging agent action: {e}")

if __name__ == "__main__":
    # Simulate a Web3 Agent Action
    log_agent_action(
        "SolanaDeployer", 
        "DECISION", 
        "Deploying 'ClawmanderToken' to Solana Mainnet. RPC: helius.xyz",
        {"chain": "solana", "contract_name": "ClawmanderToken"}
    )
    
    # Simulate a Research Agent Finding
    log_agent_action(
        "MarketBot", 
        "APPROVAL", 
        "Found high-conviction pattern for $SOL. Momentum score: 88/100. Proceeding with analysis.",
        {"strategy": "momentum", "score": 88}
    )
    
    # Simulate a Conflict / Warning from an agent
    log_agent_action(
        "ComplianceBot", 
        "CORRECTION", 
        "Detected unauthorized deployment attempt. Reverting transaction 0xabc...",
        {"reason": "gas_limit_exceeded"}
    )
