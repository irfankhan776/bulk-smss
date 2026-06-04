const { parse } = require("csv-parse/sync");
const { prisma } = require("../prisma/client");

function normalizePhone(p) {
  if (!p) return null;
  return String(p).trim();
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  return String(tags)
    .split(/[;,]/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

async function createContact(req, res, next) {
  try {
    const { phone, name, tags } = req.body || {};
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: "phone is required" });

    const contact = await prisma.contact.create({
      data: {
        phone: p,
        name: name ? String(name) : null,
        tags: normalizeTags(tags),
      },
    });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
}

async function listContacts(req, res, next) {
  try {
    const q = req.query.q ? String(req.query.q).trim() : "";
    const tag = req.query.tag ? String(req.query.tag).trim() : "";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || "50", 10)));

    const where = {};
    if (q) {
      where.OR = [
        { phone: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    if (tag) {
      where.tags = { has: tag };
    }

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({ items, page, pageSize, total, hasMore: page * pageSize < total });
  } catch (err) {
    next(err);
  }
}

async function importContacts(req, res, next) {
  try {
    // Body: { csvText, mapping: { phone, name, tags }, delimiter? }
    const { csvText, mapping, delimiter } = req.body || {};
    if (!csvText || !mapping?.phone) {
      return res.status(400).json({ error: "csvText and mapping.phone are required" });
    }

    const records = parse(String(csvText), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      delimiter: delimiter || ",",
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    });

    const toUpsert = [];
    for (const r of records) {
      const phone = normalizePhone(r[mapping.phone]);
      if (!phone) continue;
      const name = mapping.name ? r[mapping.name] : null;
      const tags = mapping.tags ? r[mapping.tags] : null;
      toUpsert.push({
        phone,
        name: name ? String(name) : null,
        tags: normalizeTags(tags),
      });
    }

    let created = 0;
    let updated = 0;
    const errors = [];

    for (const c of toUpsert) {
      try {
        const existing = await prisma.contact.findUnique({ where: { phone: c.phone }, select: { id: true } });
        await prisma.contact.upsert({
          where: { phone: c.phone },
          create: { phone: c.phone, name: c.name, tags: c.tags },
          update: {
            name: c.name ?? undefined,
            tags: c.tags.length ? c.tags : undefined,
          },
        });
        if (existing) updated += 1;
        else created += 1;
      } catch (e) {
        errors.push({ phone: c.phone, error: e?.message || "unknown" });
      }
    }

    res.json({ created, updated, errorsCount: errors.length, errors });
  } catch (err) {
    next(err);
  }
}

async function updateContact(req, res, next) {
  try {
    const id = String(req.params.id);
    const { name, tags } = req.body || {};

    const data = {};
    if (name !== undefined) data.name = name === null || name === "" ? null : String(name);
    if (tags !== undefined) data.tags = normalizeTags(tags);

    const contact = await prisma.contact.update({
      where: { id },
      data,
    });
    res.json({ contact });
  } catch (err) {
    next(err);
  }
}

module.exports = { createContact, listContacts, importContacts, updateContact };

