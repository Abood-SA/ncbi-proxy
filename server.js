const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const BLAST_BASE = "https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi";

// ============================================
// Health check
// ============================================
app.get("/", (req, res) => {
    res.json({ 
        status: "ok", 
        message: "NCBI Proxy Server with BLAST support",
        endpoints: ["/ncbi", "/fetch", "/blast/submit", "/blast/status", "/blast/results"]
    });
});

// ============================================
// Legacy NCBI endpoint
// ============================================
app.get("/ncbi", async (req, res) => {
    const { accession } = req.query;
    if (!accession) {
        return res.status(400).json({ error: "accession is required" });
    }
    try {
        const url = `${NCBI_BASE}/efetch.fcgi?db=nuccore&id=${accession}&rettype=fasta&retmode=text`;
        const response = await fetch(url);
        const text = await response.text();
        res.set("Content-Type", "text/plain");
        res.send(text);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Fetch endpoint (gene name or accession)
// ============================================
app.get("/fetch", async (req, res) => {
    const { accession, gene, organism = "human" } = req.query;
    
    try {
        let fastaText;
        
        if (accession) {
            const url = `${NCBI_BASE}/efetch.fcgi?db=nuccore&id=${accession}&rettype=fasta&retmode=text`;
            const response = await fetch(url);
            fastaText = await response.text();
        } else if (gene) {
            const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(gene)}[Gene]+AND+${encodeURIComponent(organism)}[Organism]+AND+refseq[filter]+AND+biomol_mrna[PROP]&retmax=1&retmode=json`;
            const searchRes = await fetch(searchUrl);
            const searchData = await searchRes.json();
            
            if (!searchData.esearchresult?.idlist?.length) {
                return res.status(404).json({ error: "Gene not found" });
            }
            
            const id = searchData.esearchresult.idlist[0];
            const fetchUrl = `${NCBI_BASE}/efetch.fcgi?db=nuccore&id=${id}&rettype=fasta&retmode=text`;
            const fetchRes = await fetch(fetchUrl);
            fastaText = await fetchRes.text();
        } else {
            return res.status(400).json({ error: "accession or gene is required" });
        }
        
        res.set("Content-Type", "text/plain");
        res.send(fastaText);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BLAST Submit
// ============================================
app.post("/blast/submit", async (req, res) => {
    try {
        const { sequence, program = "blastn", database = "nt", evalue = "0.05" } = req.body;
        
        if (!sequence) {
            return res.status(400).json({ error: "sequence is required" });
        }
        
        const params = new URLSearchParams({
            CMD: "Put",
            PROGRAM: program,
            DATABASE: database,
            QUERY: sequence,
            FORMAT_TYPE: "XML",
            EXPECT: evalue,
            HITLIST_SIZE: "15"
        });
        
        const response = await fetch(BLAST_BASE, {
            method: "POST",
            body: params.toString(),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        
        const text = await response.text();
        const ridMatch = text.match(/RID = (\w+)/);
        const rtoeMatch = text.match(/RTOE = (\d+)/);
        
        if (!ridMatch) {
            return res.status(500).json({ error: "Failed to submit BLAST job" });
        }
        
        res.json({
            success: true,
            rid: ridMatch[1],
            estimatedTime: rtoeMatch ? parseInt(rtoeMatch[1]) : 30
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BLAST Status
// ============================================
app.get("/blast/status", async (req, res) => {
    try {
        const { rid } = req.query;
        
        if (!rid) {
            return res.status(400).json({ error: "rid is required" });
        }
        
        const url = `${BLAST_BASE}?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${rid}`;
        const response = await fetch(url);
        const text = await response.text();
        
        let status = "UNKNOWN";
        if (text.includes("Status=WAITING")) status = "WAITING";
        else if (text.includes("Status=READY")) status = "READY";
        else if (text.includes("Status=FAILED")) status = "FAILED";
        
        res.json({ rid, status });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BLAST Results
// ============================================
app.get("/blast/results", async (req, res) => {
    try {
        const { rid, format = "XML" } = req.query;
        
        if (!rid) {
            return res.status(400).json({ error: "rid is required" });
        }
        
        const url = `${BLAST_BASE}?CMD=Get&FORMAT_TYPE=${format}&RID=${rid}`;
        const response = await fetch(url);
        const text = await response.text();
        
        res.set("Content-Type", format === "XML" ? "application/xml" : "text/plain");
        res.send(text);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PubMed Search
// ============================================
app.get("/pubmed/search", async (req, res) => {
    try {
        const { query, limit = 10 } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: "query is required" });
        }
        
        const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (!searchData.esearchresult?.idlist?.length) {
            return res.json({ results: [] });
        }
        
        const ids = searchData.esearchresult.idlist.join(",");
        const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);
        const summaryData = await summaryRes.json();
        
        res.json({
            count: searchData.esearchresult.count,
            results: summaryData.result
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`NCBI Proxy Server running on port ${PORT}`);
});
