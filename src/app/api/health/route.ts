import { jsonOk } from "@/lib/api";

export async function GET() {
  return jsonOk({
    status: "ok",
    service: "bloret-translation-collector",
    time: new Date().toISOString(),
  });
}
