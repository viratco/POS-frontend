import { Suspense } from "react";
import PrintDoc from "./PrintDoc";

// /staff/print/<orderId>?type=bill|receipt|kot[&auto=1]
export default function PrintPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Preparing…</p>}>
      <PrintDoc />
    </Suspense>
  );
}
