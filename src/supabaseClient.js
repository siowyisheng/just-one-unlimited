import { createClient } from '@supabase/supabase-js';

// Replace with your actual Supabase URL and anon key from Project Settings -> API
const SUPABASE_URL = 'https://snfrplrypqjnqxftpkme.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZnJwbHJ5cHFqbnF4ZnRwa21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNTU4MzAsImV4cCI6MjEwNTczMTgzMH0.jR7_cSFSyYWAKexhLLZwO_-eZgT_lhb7EHllDaAiJ5U';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);