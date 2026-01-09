import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get("/fetch", async (req, res) => {
  try {
    const { accession, gene, organism = "human" } = req.query;
    let acc = accession;

    if (!acc && gene) {
      const searchUrl =
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
        `?db=nuccore&term=${gene}[Gene]+AND+${organism}[Organism]&retmode=json`;

      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      if (!searchData.esearchresult.idlist.length) {
        return res.status(404).json({ error: `Gene "${gene}" not found` });
      }
      acc = searchData.esearchresult.idlist[0];
    }

    if (!acc) {
      return res.status(400).json({ error: "Provide accession or gene parameter" });
    }

    const fetchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi` +
      `?db=nuccore&id=${acc}&rettype=fasta&retmode=text`;

    const fastaRes = await fetch(fetchUrl);
    const fastaText = await fastaRes.text();

    res.type('text/plain').send(fastaText);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));