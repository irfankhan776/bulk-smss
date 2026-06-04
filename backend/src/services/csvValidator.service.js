const { normalizePhone } = require("./googleMaps.service");

/**
 * Validates raw CSV content for campaign leads.
 * Returns all errors at once so the user sees everything wrong at once.
 *
 * @param {string} rawCSV - Raw CSV string
 * @returns {{ valid: boolean, errors: Array<string>, rows: Array<{businessName,city,phone}>, headers: string[] }}
 */
function validateCSV(rawCSV) {
  const errors = [];
  const rows = [];

  if (!rawCSV || typeof rawCSV !== "string") {
    return { valid: false, errors: ["CSV content is empty or not provided."], rows: [], headers: [] };
  }

  const lines = rawCSV.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { valid: false, errors: ["CSV must have a header row and at least one data row."], rows: [], headers: [] };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"_\s\-]+/g, ""));

  // Find column indices
  const businessNameIdx = headers.findIndex(
    (h) => h === "businessname" || h === "business" || h.includes("businessname")
  );
  const cityIdx = headers.findIndex(
    (h) => h === "city" || h === "location" || h.includes("city")
  );
  const phoneIdx = headers.findIndex(
    (h) => h === "phone" || h === "phonenumber" || h.includes("phone")
  );

  const missingColumns = [];
  if (businessNameIdx === -1) missingColumns.push("business_name (or businessName, business)");
  if (cityIdx === -1) missingColumns.push("city");
  if (phoneIdx === -1) missingColumns.push("phone");

  if (missingColumns.length > 0) {
    return {
      valid: false,
      errors: [`Missing required columns: ${missingColumns.join(", ")}. Found headers: ${headers.join(", ")}`],
      rows: [],
      headers,
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty rows

    const fields = parseCSVLine(line);
    const lineNum = i + 1;

    const rawBusinessName = (fields[businessNameIdx] || "").trim();
    const rawCity = (fields[cityIdx] || "").trim();
    const rawPhone = (fields[phoneIdx] || "").trim();

    const rowErrors = [];

    if (!rawBusinessName) {
      rowErrors.push(`Row ${lineNum}: business_name is missing`);
    }
    if (!rawCity) {
      rowErrors.push(`Row ${lineNum}: city is missing`);
    }
    if (!rawPhone) {
      rowErrors.push(`Row ${lineNum}: phone is missing`);
    } else {
      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        rowErrors.push(`Row ${lineNum}: phone "${rawPhone}" is not a valid phone number`);
      } else if (normalized.replace(/\D/g, "").length < 10) {
        rowErrors.push(`Row ${lineNum}: phone "${rawPhone}" has fewer than 10 digits`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      rows.push({
        businessName: rawBusinessName,
        city: rawCity,
        phone: normalizePhone(rawPhone),
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    rows,
    headers,
  };
}

/**
 * Minimal CSV line parser that handles quoted fields and commas inside quotes.
 */
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

module.exports = { validateCSV };
