import fetch from "node-fetch";

async function trigger() {
  console.log("Triggering forced market sync...");
  try {
    const res = await fetch("http://localhost:3000/api/market-data?force=true");
    console.log("Status: " + res.status);
    if (res.ok) {
      const data: any = await res.json();
      console.log("Keys in response:", Object.keys(data));
      console.log("debugNewCode exists?", "debugNewCode" in data);
      console.log("debugNewCode value:", data.debugNewCode);
      console.log("Sync succeeded! Last updated on: " + data.lastUpdated);
      
      console.log("\n=== US Stocks in Cache ===");
      for (const s of data.usStocks || []) {
        console.log(`- ${s.ticker} (${s.name}): $${s.lastClose} | IsMock: ${s.isMock} | Klines Count: ${s.klines?.length}`);
      }
    } else {
      console.log("Failed. Res status: " + res.status);
      const text = await res.text();
      console.log("Error body: " + text);
    }
  } catch (err) {
    console.error("Error connecting:", err);
  }
}

trigger();
