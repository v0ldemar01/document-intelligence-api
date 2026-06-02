# Manual Test Documents

Upload these files via Swagger UI at `http://localhost:3000/docs` → `POST /documents`
or via curl: `curl -F "file=@test/documents/<filename>" http://localhost:3000/documents`

## Files and expected extraction results

### `invoice-simple.txt` — complete invoice, all fields extractable
Expected extraction (`EXTRACTION_ENGINE=mock`):
```json
{
  "invoiceNumber": "INV-2026-001",
  "date": "2026-04-03",
  "vendor": "SpheraX Ltd",
  "amount": 1250.75,
  "currency": "EUR"
}
```

### `invoice-usd.txt` — USD invoice with tax breakdown
Expected:
```json
{
  "invoiceNumber": "INV-2026-042",
  "date": "2026-05-15",
  "vendor": "Global Tech Solutions Inc.",
  "amount": 7699.89,
  "currency": "USD"
}
```

### `invoice-partial.txt` — informal document, minimal field coverage
Tests graceful fallback when fields are missing. The mock engine returns defaults:
```json
{
  "invoiceNumber": "INV-2026-001",
  "amount": 2500.0,
  "currency": "GBP"
}
```
**Use this file with `EXTRACTION_ENGINE=langflow`** to see how the LLM handles
unstructured text vs the mock engine's regex fallbacks.

### `invoice-multilingual.txt` — German/English mixed invoice
Tests extraction from mixed-language documents:
```json
{
  "date": "2026-03-20",
  "vendor": "EuroTech GmbH",
  "amount": 1487.50,
  "currency": "EUR"
}
```

### `invoices-batch.csv` — CSV with 5 invoice rows
Tests CSV parsing. The entire CSV content is sent to the extraction engine as text.
With the mock engine, it extracts the first invoice row's values.
With LangFlow, test whether your prompt handles tabular data.

### `invoice-sample.pdf` — minimal valid PDF
Tests the PDF parsing path (`pdf-parse`). Contains the same fields as `invoice-simple.txt`.
Expected extraction matches `invoice-simple.txt` but uses: `INV-2026-099, 999.99 EUR`.

## Polling for results

Extraction runs asynchronously (queue mode). After uploading, poll until done:

```bash
JOB_ID="<paste job.id from upload response>"

while true; do
  STATUS=$(curl -s http://localhost:3000/jobs/$JOB_ID | jq -r '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done

# Get the extraction result
curl -s http://localhost:3000/jobs/$JOB_ID/result | jq
```

## What to verify

| Scenario | Expected behaviour |
|---|---|
| All `.txt` files | `status: completed`, `confidence: 0.91` (mock) |
| `.csv` file | Parsed as tabular text, first row extracted |
| `.pdf` file | Parsed with `pdf-parse`, text extraction successful |
| `invoice-partial.txt` with LangFlow | LLM extracts amount `2500.00` and currency `GBP` from prose |
| Unsupported file (e.g., `.exe`) | `POST /documents` returns `400 Bad Request` |
| File > 5 MB | `POST /documents` returns `400 Bad Request` |
