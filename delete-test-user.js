const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("List users error:", error);
    return;
  }
  const user = users.find(u => u.email === 'playwright@comfhutt.com');
  if (user) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) {
       console.error("Delete user error:", delErr);
    } else {
       console.log('Deleted playwright@comfhutt.com');
    }
  } else {
    console.log('User not found');
  }
}
run();
