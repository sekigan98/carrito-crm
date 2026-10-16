import { env } from "cloudflare:workers";
import { handleApi } from "@/lib/api";
export const dynamic = "force-dynamic";
const handler = (request: Request) => handleApi(request, env as any);
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
