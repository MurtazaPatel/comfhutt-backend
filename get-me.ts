import { getUserFromSupabase } from './src/services/userSync.service';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const user = await getUserFromSupabase('user_3EWM4ogA98V5mLXownCmpiA5uOA');
  console.log(user);
}
run();
