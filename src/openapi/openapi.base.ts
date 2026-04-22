export const openAPIBase = {
  openapi: '3.0.3',
  info: {
    title: 'CRUX API',
    version: '1.0.0',
    description: 'ComfHutt CRUX Property Intelligence Engine API',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local' },
    { url: 'https://api.crux.comfhutt.com', description: 'Production' },
  ],
  components: {
    securitySchemes: {
      ClerkAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Clerk session token',
      },
    },
  },
  security: [{ ClerkAuth: [] }],
};
