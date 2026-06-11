import { Router } from "express";

export function createPlaceholderRouter(moduleName: string) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      module: moduleName,
      status: "scaffolded",
      message: `${moduleName} API is ready for v1 implementation.`,
    });
  });

  return router;
}
