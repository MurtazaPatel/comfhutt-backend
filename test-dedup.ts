import { getRecentSearches } from './src/services/searchHistory.service';
import { supabase } from './src/lib/db';

async function run() {
  const clerkUserId = 'user_3EWN0eHU7A2Tgb9yeIoylYfeOF6'; // from the logs
  const results = await getRecentSearches(clerkUserId, 10);
  console.log('Results length:', results.length);
  results.forEach(r => console.log(r.id, r.property_id));
  
  const raw = await supabase.from('crux_searches').select('id, property_id').eq('clerk_user_id', clerkUserId);
  console.log('Raw length:', raw.data?.length);
  process.exit(0);
}

run();
