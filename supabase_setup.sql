-- SQL for Supabase Table Setup
-- Run this in your Supabase SQL Editor

-- 1. Create the session_log table
CREATE TABLE IF NOT EXISTS public.session_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now(),
    type TEXT NOT NULL, -- DECISION, CORRECTION, APPROVAL, CONFLICT
    content TEXT NOT NULL,
    source_url TEXT,
    is_user_input BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Enable row level security (optional for dev)
ALTER TABLE public.session_log ENABLE ROW LEVEL SECURITY;

-- 3. Create a policy for public access using service role (or specific roles)
CREATE POLICY "Enable all for service role" ON public.session_log
    USING (true)
    WITH CHECK (true);

-- 4. Indexing for faster conflict checks
CREATE INDEX IF NOT EXISTS idx_session_log_timestamp ON public.session_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_session_log_type ON public.session_log (type);
