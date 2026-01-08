import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

app.get("/ncbi", async (req, res) => {
  try {
    const { db = "nuccore", id, rettype = "fasta" } = req.query;
    if (!id) return res.status(400).send("Missing id");

    const url =
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi" +
      `?db=${db}&id=${encodeURIComponent(id)}` +
      `&rettype=${rettype}&retmode=text` +
      "&tool=helixpro&email=test@example.com";

    const r = await fetch(url, {
      headers: { "User-Agent": "HelixPro/1.0" }
    });

    const data = await r.text();
    res.send(data);
  } catch (e) {
    res.status(500).send("NCBI error");
  }
});

app.listen(3000, () => {
  console.log("NCBI proxy running on port 3000");
});
