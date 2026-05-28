import fetch from "node-fetch";

async function fetchTWSEList() {
  console.log("Fetching TWSE listed stocks list...");
  const url = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=2";
  
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('big5');
    const text = decoder.decode(buffer);
    
    // Split into rows
    const rows = text.split('<tr>');
    const stocks: { ticker: string, name: string, industry: string }[] = [];
    
    let inStockSection = false;
    for (let row of rows) {
      if (row.includes("股票")) {
        inStockSection = true;
        continue;
      }
      
      // Stop sections
      if (row.includes("上市認購(售)權證") || row.includes("存託憑證") || row.includes("受益證券") || row.includes("ETF")) {
        inStockSection = false;
        continue;
      }

      if (inStockSection) {
        // Extract cells
        const cells = row.split(/<td[^>]*>/).map(c => c.split('</td>')[0].trim());
        if (cells.length >= 5) {
          const firstCell = cells[1]; // Index 0 is empty after split
          // "1101　台泥"
          const match = firstCell.match(/^(\d{4,6})[　\s]+(.+)$/);
          if (match) {
            const ticker = match[1];
            const name = match[2].trim();
            const market = cells[4];   // 市場別
            const industry = cells[5]; // 產業別
            
            if (market === "上市") {
              stocks.push({ ticker, name, industry });
            }
          }
        }
      }
    }
    
    console.log(`Found ${stocks.length} stocks.`);
    if (stocks.length > 0) {
        console.log("First 5:", stocks.slice(0, 5));
        console.log("Last 5:", stocks.slice(-5));
    }
    return stocks;
  } catch (err) {
    console.error("Error fetching TWSE list:", err);
    return [];
  }
}

fetchTWSEList();
