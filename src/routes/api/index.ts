import { Router } from "express";
import { requireApiAuth } from "@/middleware/requireAuth";
import { healthRouter } from "./health";
import { meRouter } from "./me";
import { orgsRouter, publicOrgsRouter } from "./orgs";
import { collaborationRouter } from "./collaboration";
import { glossaryRouter } from "./glossary";
import { extrasRouter } from "./extras";

export const apiRouter = Router();

apiRouter.use(healthRouter);

// Public endpoints (no auth) — must be mounted before the auth gate.
apiRouter.use(publicOrgsRouter);

apiRouter.use(requireApiAuth);
apiRouter.use(meRouter);
// Collaboration routes first so workflow-aware string handlers win
apiRouter.use(collaborationRouter);
apiRouter.use(glossaryRouter);
apiRouter.use(extrasRouter);
apiRouter.use(orgsRouter);
