import { sellerProofResponse } from "@/features/panel-sellers/proof-route";

type Context = { params: Promise<{ sellerId: string }> };

// The seller's current verification proof as a PDF attachment (AC 58, F12).
// GET only: any other method is a 405 from Next.
export async function GET(
  _request: Request,
  { params }: Context,
): Promise<Response> {
  return sellerProofResponse((await params).sellerId);
}
