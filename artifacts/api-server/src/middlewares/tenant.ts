import type { Request, Response, NextFunction } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId: number;
      userId?: string;
    }
  }
}

const DEMO_ORG_ID = "demo-org";
const DEMO_USER_ID = "demo-user";

export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clerkOrgId = (req.headers["x-clerk-org-id"] as string) || DEMO_ORG_ID;
    const userId = (req.headers["x-clerk-user-id"] as string) || DEMO_USER_ID;

    let tenant = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.clerkOrgId, clerkOrgId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!tenant) {
      const [created] = await db
        .insert(tenantsTable)
        .values({ clerkOrgId, name: clerkOrgId })
        .returning();
      tenant = created;
    }

    req.tenantId = tenant.id;
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
