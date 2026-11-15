import { parseInfraCSV } from "./infra.js?v=4.0";
import { validateContracts } from "./contracts.js?v=4.0";

/** Billing facts are required; illustrative contract metadata is optional. */
export async function loadDemoSource(
  fetcher = fetch,
  metadataTimeoutMs = 2000,
  billingTimeoutMs = 20000,
) {
  const billingController = new AbortController();
  let billingTimer, rows;
  try {
    const deadline = new Promise((_, reject) => {
      billingTimer = setTimeout(() => {
        reject(
          Error(
            "Demo billing data timed out. Check connectivity and retry Restore historical demo in Workspace.",
          ),
        );
        billingController.abort();
      }, billingTimeoutMs);
    });
    const billing = async () => {
      const response = await fetcher("./data/infrastructure.csv", {
        signal: billingController.signal,
      });
      if (!response.ok)
        throw Error(
          `Demo could not load (${response.status}). Serve this folder with HTTP.`,
        );
      return parseInfraCSV(await response.text());
    };
    rows = await Promise.race([billing(), deadline]);
  } finally {
    clearTimeout(billingTimer);
  }
  if (!rows.length) throw Error("Demo CSV contains no infrastructure facts.");
  let contracts = [],
    warning = "";
  const controller = new AbortController();
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("Contract examples timed out"));
      }, metadataTimeoutMs);
    });
    const metadata = async () => {
      const response = await fetcher("./data/contracts.example.json", {
        signal: controller.signal,
      });
      if (!response.ok) throw Error("Contract examples unavailable");
      return validateContracts(await response.json());
    };
    contracts = await Promise.race([metadata(), deadline]);
  } catch {
    warning =
      "Billing data loaded; optional contract examples are unavailable. Import contract JSON in the vendor workspace if needed.";
  } finally {
    clearTimeout(timer);
  }
  return { rows, contracts, warning };
}
