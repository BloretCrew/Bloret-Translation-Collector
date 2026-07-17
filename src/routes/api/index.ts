import { Router } from "express";
import { requireApiAuth } from "@/middleware/requireAuth";
import { healthRouter } from "./health";
import { meRouter } from "./me";
import { orgsRouter } from "./orgs";

export const apiRouter = Router();

apiRouter.use(healthRouter);

apiRouter.use(requireApiAuth);
apiRouter.use(meRouter);
apiRouter.use(orgsRouter);
