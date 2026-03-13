import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(
    `🚀  comfhutt-backend running on port ${env.PORT}  [${env.APP_ENV}]`,
  );
});
