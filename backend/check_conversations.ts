import { supabaseAdmin } from './src/utils/supabase';

async function checkConversations() {
  const athleteId = 'ee2830e4-49e4-419a-8ffd-a6147b5123df'; // Brandon Nelson
  
  const { data: conversations, error } = await supabaseAdmin
    .from('chat_conversations')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log(`\nFound ${conversations?.length || 0} conversation(s):`);
  conversations?.forEach(conv => {
    console.log(`  - ${conv.title} (created: ${conv.created_at})`);
  });
  
  process.exit(0);
}

checkConversations();
