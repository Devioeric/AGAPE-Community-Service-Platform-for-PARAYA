import { z } from "zod";
import { assertTarget, safeLocalEndpoint, sha256 } from "./target";
import type { FinanceIntegrityVerificationDTO } from "./types";

const hex = z.string().regex(/^0x[0-9a-fA-F]+$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const receiptSchema = z.object({ transactionHash: hash, status: hex, to: address.nullable(), blockNumber: hex, blockHash: hash,
  logs: z.array(z.object({ address, topics: z.array(hash), data: hex, removed: z.boolean().optional(), transactionHash: hash, blockHash: hash, blockNumber: hex })) });
const blockSchema = z.object({ hash, number: hex });
// keccak256('Anchored(bytes32,bytes32,uint8,uint256,bytes32)'); generated from registry ABI.
const ANCHORED_TOPIC = "0x1e7344c8c5d4702f2540b1c0c4b394549250e87d28ee581d3fadedb9a7d69be2";
type VerificationInput = Pick<FinanceIntegrityVerificationDTO, "target" | "anchorReference" | "canonicalHash" | "sourceType" | "sourceVersion" | "canonicalSchema" | "transactionHash" | "receiptBlockNumber" | "receiptBlockHash" | "anchorStatus">;
export type ChainResult = { status: FinanceIntegrityVerificationDTO["chainVerification"]; blockNumber?: string; blockHash?: string };

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4_000) });
  if (!res.ok) throw new Error("rpc_unavailable");
  const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.literal(1), result: z.unknown(), error: z.unknown().optional() }).parse(await res.json());
  if (envelope.error !== undefined) throw new Error("rpc_unavailable");
  return envelope.result;
}

/** Independent read-only chain check. Does not trust relay status or mutate stored history. */
export async function verifyFinanceCommitment(p: VerificationInput): Promise<ChainResult> {
  if (!p.target) return { status: "legacy_unverified" };
  if (p.target.execution === "simulated") return { status: p.anchorStatus === "anchored" ? "simulated" : "pending" };
  if (!p.transactionHash) return { status: "pending" };
  try {
    const t = p.target;
    assertTarget(t, false);
    if (!hash.safeParse(p.transactionHash).success || !p.anchorReference || !t.contractAddress) return { status: "mismatch" };
    const url = safeLocalEndpoint(process.env.AGAPE_BLOCKCHAIN_READ_RPC_URL, "rpc");
    const [chain, codeRaw, receiptRaw] = await Promise.all([
      rpc(url, "eth_chainId", []), rpc(url, "eth_getCode", [t.contractAddress, "latest"]), rpc(url, "eth_getTransactionReceipt", [p.transactionHash]),
    ]);
    if (BigInt(hex.parse(chain)) !== BigInt(t.chainId)) return { status: "mismatch" };
    const code = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).parse(codeRaw);
    if (code === "0x" || sha256(Buffer.from(code.slice(2), "hex")) !== t.bytecodeHash) return { status: "mismatch" };
    if (receiptRaw === null) return { status: p.anchorStatus === "anchored" ? "mismatch" : "pending" };
    const r = receiptSchema.parse(receiptRaw);
    if (r.status !== "0x1" || r.transactionHash.toLowerCase() !== p.transactionHash.toLowerCase() || r.to?.toLowerCase() !== t.contractAddress || (p.receiptBlockHash && r.blockHash !== p.receiptBlockHash) || (p.receiptBlockNumber && BigInt(r.blockNumber) !== BigInt(p.receiptBlockNumber))) return { status: "mismatch" };
    const logs = r.logs.filter(l => l.address.toLowerCase() === t.contractAddress && l.topics[0]?.toLowerCase() === ANCHORED_TOPIC && l.topics[1]?.toLowerCase() === `0x${p.anchorReference}`);
    if (logs.length !== 1) return { status: "mismatch" };
    const l = logs[0];
    const words = l.data.slice(2).match(/.{64}/g);
    if (l.removed || l.topics.length !== 2 || l.data.length !== 258 || !words || words.length !== 4 || l.blockHash !== r.blockHash || l.transactionHash !== r.transactionHash || l.blockNumber !== r.blockNumber
      || words[0].toLowerCase() !== p.canonicalHash || BigInt(`0x${words[1]}`) !== BigInt(p.sourceType === "finance_cleared_budget" ? 1 : 2)
      || BigInt(`0x${words[2]}`) !== BigInt(p.sourceVersion) || words[3].toLowerCase() !== sha256(p.canonicalSchema)) return { status: "mismatch" };
    const [canonicalRaw, tipRaw] = await Promise.all([rpc(url, "eth_getBlockByNumber", [r.blockNumber, false]), rpc(url, "eth_getBlockByNumber", [t.confirmationPolicy === "sepolia_finalized" ? "finalized" : "latest", false])]);
    if (!canonicalRaw || !tipRaw) return { status: "pending" };
    const canonical = blockSchema.parse(canonicalRaw), tip = blockSchema.parse(tipRaw);
    if (canonical.hash !== r.blockHash || canonical.number !== r.blockNumber) return { status: "mismatch" };
    if (BigInt(tip.number) < BigInt(r.blockNumber)) return { status: "pending" };
    return { status: "verified", blockNumber: BigInt(r.blockNumber).toString(), blockHash: r.blockHash.toLowerCase() };
  } catch { return { status: "unavailable" }; }
}
