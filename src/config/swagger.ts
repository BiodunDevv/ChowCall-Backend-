import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./env.js";
import { openApiDocument } from "../docs/openapi.js";

export function setupSwagger(app: Express) {
  if (!env.SWAGGER_ENABLED) return;

  app.get(`${env.SWAGGER_PATH}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(env.SWAGGER_PATH, swaggerUi.serve, swaggerUi.setup(openApiDocument));
}
