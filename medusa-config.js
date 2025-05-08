const dotenv = require("dotenv");

let ENV_FILE_NAME = "";
switch (process.env.NODE_ENV) {
  case "production":
    ENV_FILE_NAME = ".env.production";
    break;
  case "staging":
    ENV_FILE_NAME = ".env.staging";
    break;
  case "test":
    ENV_FILE_NAME = ".env.test";
    break;
  case "development":
  default:
    ENV_FILE_NAME = ".env";
    break;
}

try {
  dotenv.config({ path: process.cwd() + "/" + ENV_FILE_NAME });
} catch (e) { }

// CORS when consuming Medusa from admin
const ADMIN_CORS =
  process.env.ADMIN_CORS || "http://localhost:7001";

// CORS to avoid issues when consuming Medusa from a client
const STORE_CORS = process.env.STORE_CORS || "https://ehfconcept.cl";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost/medusa-store";

const plugins = [
  `medusa-fulfillment-manual`,
  `medusa-payment-manual`,
  {
    resolve: `medusa-file-s3`,
    options: {
        s3_url: process.env.S3_URL,
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION,
        access_key_id: process.env.S3_ACCESS_KEY_ID,
        secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
        cache_control: process.env.S3_CACHE_CONTROL
    },
  },
  {
    resolve: `medusa-plugin-strapi`,
    options: {
      strapi_medusa_user: process.env.STRAPI_USER,
      strapi_medusa_password: process.env.STRAPI_PASSWORD,
      strapi_url: process.env.STRAPI_URL, //optional
    }
  },
  {
    resolve: `./src/services/stripe-payment.service.ts`,
    options: {
      // No requiere opciones específicas más allá de las vars de entorno:
      // STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (opcional), STRIPE_API_VERSION
    },
  },
  {
    resolve: "@medusajs/admin",
    /** @type {import('@medusajs/admin').PluginOptions} */
    options: {
      autoRebuild: true,
      develop: {
        open: process.env.OPEN_BROWSER !== "false",
      },
    },
  }
];

const modules = {
  eventBus: {
    resolve: "@medusajs/event-bus-local", // Usar event-bus-local en lugar de event-bus-redis
  },
  cacheService: {
    resolve: "@medusajs/cache-inmemory", // Usar cache-inmemory en lugar de cache-redis
  },
};

/** @type {import('@medusajs/medusa').ConfigModule["projectConfig"]} */
const projectConfig = {
  jwtSecret: process.env.JWT_SECRET,
  cookieSecret: process.env.COOKIE_SECRET,
  store_cors: STORE_CORS,
  database_url: DATABASE_URL,
  admin_cors: ADMIN_CORS,
  // Elimina redis_url ya que no se necesita
};

/** @type {import('@medusajs/medusa').ConfigModule} */
module.exports = {
  projectConfig,
  plugins,
  modules,
};