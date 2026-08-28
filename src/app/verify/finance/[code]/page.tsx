import { FinanceIntegrityVerification } from "@/components/integrity/FinanceIntegrityVerification";
export default function FinanceIntegrityVerificationPage({ params }: { params: { code: string } }) { return <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 px-4 py-16"><FinanceIntegrityVerification code={params.code} /></main>; }
